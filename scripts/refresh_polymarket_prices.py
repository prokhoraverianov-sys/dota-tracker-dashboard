"""Recover timestamped map prices from the public Polymarket Gamma and CLOB APIs."""

import argparse
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote, urlencode

ROOT = Path(__file__).resolve().parents[1]
GAMMA = "https://gamma-api.polymarket.com"
CLOB = "https://clob.polymarket.com"
HISTORY_WINDOW = 3600
FIDELITY = 1


def get(url, **params):
    return json.loads(subprocess.check_output([
        "curl", "--fail", "--silent", "--show-error", "--max-time", "25", "--retry", "2",
        f"{url}?{urlencode(params, quote_via=quote)}",
    ]))


def timestamp(value):
    return int(datetime.fromisoformat(value).timestamp())


def team_key(value):
    return re.sub(r"[\W_]+", "", value.casefold())


def market_tokens(market, teams):
    try:
        outcomes = json.loads(market["outcomes"])
        tokens = json.loads(market["clobTokenIds"])
        if len(outcomes) != 2 or len(tokens) != 2 or len(set(tokens)) != 2:
            return None
        if any(not re.fullmatch(r"[0-9]+", token) for token in tokens):
            return None
        by_team = {team_key(team): token for team, token in zip(outcomes, tokens, strict=True)}
        return tuple(by_team[team_key(team)] for team in teams)
    except (KeyError, TypeError, ValueError):
        return None


def discover(name):
    events = {}
    for page in range(1, 11):
        data = get(f"{GAMMA}/public-search", q=name, limit_per_type=15, page=page)
        for event in data.get("events") or []:
            if re.fullmatch(r"dota2-[a-z0-9-]+", event["slug"]):
                events[event["slug"]] = event
        if not data["pagination"]["hasMore"]:
            return list(events.values())
    raise RuntimeError(f"Polymarket search for {name} exceeded its page limit")


def bind_event(events, series, name):
    teams = series["team_a"], series["team_b"]
    start = timestamp(series["starts_at_utc"])
    candidates = []
    for event in events:
        title = event.get("title") or ""
        prefix, sep, competition = title.partition(f" (BO{series['best_of']}) - ")
        if (
            not sep
            or not prefix.startswith("Dota 2: ")
            or not re.match(re.escape(name) + r"(?:\s|$)", competition, flags=re.I)
            or "qualifier" in competition.casefold()
            or not event.get("startTime")
            or abs(timestamp(event["startTime"]) - start) > 8 * 3600
        ):
            continue
        if {team_key(team) for team in prefix[8:].split(" vs ")} != {team_key(t) for t in teams}:
            continue
        if any(
            m.get("sportsMarketType") == "moneyline" and market_tokens(m, teams)
            for m in event.get("markets", [])
        ):
            candidates.append(event)
    return candidates[0] if len(candidates) == 1 else None


def last_price(history, lower, upper):
    valid = [
        (row["t"], row["p"])
        for row in history
        if type(row["t"]) is int and lower <= row["t"] < upper
        and type(row["p"]) in (float, int) and 0 < row["p"] < 1
    ]
    if not valid:
        return None
    last = max(t for t, _ in valid)
    prices = {p for t, p in valid if t == last}
    return (last, prices.pop()) if len(prices) == 1 else None


def market_for(event, teams, number):
    slug = event["slug"]
    expected = f"{slug}-game{number}" if number else slug
    label = f"Game {number} Winner" if number else "Match Winner"
    kind = "child_moneyline" if number else "moneyline"
    found = [
        (market, market_tokens(market, teams))
        for market in event.get("markets", [])
        if market.get("slug") == expected
        and market.get("groupItemTitle") == label
        and market.get("sportsMarketType") == kind
    ]
    return found[0] if len(found) == 1 and found[0][1] else None


def history_price(event, teams, fact, series):
    if not event:
        return None, "серия не привязана"
    if not fact.get("started_at_utc") or not fact.get("steam_match_id"):
        return None, "нет подтверждённого старта или Steam ID"
    number = fact["map_number"]
    start = timestamp(fact["started_at_utc"])
    lower = start - HISTORY_WINDOW
    scope = "map"
    matched = market_for(event, teams, number)
    if not matched and number == 3 and series["best_of"] == 3:
        first, second = (next((x for x in series["maps"] if x["map_number"] == n), None) for n in (1, 2))
        previous = market_for(event, teams, 2)
        if first and second and first["winner"] != second["winner"] and previous:
            previous_market, ordered_tokens = previous
            outcomes = json.loads(previous_market["clobTokenIds"])
            settled = json.loads(previous_market.get("outcomePrices") or "[]")
            winner_token = ordered_tokens[0 if second["winner"] == "A" else 1]
            if (
                previous_market.get("closed")
                and previous_market.get("closedTime")
                and len(settled) == 2
                and float(settled[outcomes.index(winner_token)]) == 1
                and sorted(map(float, settled)) == [0, 1]
            ):
                lower = max(lower, timestamp(previous_market["closedTime"]) + 1)
                matched = market_for(event, teams, 0)
                scope = "series_at_1_1"
    if not matched:
        return None, "нет рынка карты или подтверждённого рынка серии при 1:1"
    if lower >= start:
        return None, "рынок второй карты закрылся после старта третьей"
    market, tokens = matched
    points = [
        last_price(get(f"{CLOB}/prices-history", market=token, startTs=lower, endTs=start,
                       fidelity=FIDELITY)["history"], lower, start)
        for token in tokens
    ]
    if not all(points) or abs(points[0][0] - points[1][0]) > 120:
        return None, "нет синхронной истории обеих сторон до старта"
    return {
        "source": "polymarket",
        "scope": scope,
        "team_a": str(1 / points[0][1]),
        "team_b": str(1 / points[1][1]),
        "at": datetime.fromtimestamp(max(p[0] for p in points), UTC).isoformat(),
        "url": f"https://polymarket.com/event/{event['slug']}?marketSlug={market['slug']}",
        "resolution": FIDELITY * 60,
    }, None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tournament", default="pari-universe")
    parser.add_argument("--output", type=Path, default=ROOT / "src/polymarket-api-prices.json")
    args = parser.parse_args()
    registry = json.loads((ROOT / "public/data/verified-results.json").read_text(encoding="utf-8"))
    tournament = registry["tournaments"][args.tournament]
    name = tournament["name"]
    events = discover(name)

    def recover(entry):
        series_id, series = entry
        event = bind_event(events, series, name)
        teams = series["team_a"], series["team_b"]
        for fact in series["maps"]:
            key = f"{series_id}/{fact['map_number']}"
            quote, reason = history_price(event, teams, fact, series)
            if quote:
                yield key, dict(steam=fact["steam_match_id"], team_a=teams[0], team_b=teams[1], quotes=[quote])
            else:
                print(f"{key} · {teams[0]} / {teams[1]} · {reason}")

    # Finish all API reads before touching the output. A failed refresh preserves the last archive.
    with ThreadPoolExecutor(max_workers=6) as executor:
        recovered = dict(item for batch in executor.map(lambda item: list(recover(item)),
                                                          tournament["series"].items()) for item in batch)
    existing = json.loads(args.output.read_text(encoding="utf-8")) if args.output.exists() else {}
    existing.update(recovered)
    rows = dict(sorted(existing.items()))
    tmp = args.output.with_suffix(".tmp")
    tmp.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(args.output)
    print(f"{name}: {len(recovered)} of {sum(len(s['maps']) for s in tournament['series'].values())} maps")


if __name__ == "__main__":
    main()
