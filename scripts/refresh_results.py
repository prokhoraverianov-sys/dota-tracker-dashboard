"""Build the public, append-only map result snapshot from registered tournament schedules."""

import argparse
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import gzip
import json
import os
import re
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public/data/verified-results.json"
LEAGUES = {"pari-universe": 20395, "1win-essence-3": 20486, "1win-essence-3-play-in": 20486}
STAGES = {"pari-universe": "10003747", "1win-essence-3": "10003626"}
REGISTRY = ROOT / "scripts/tournaments.json"
CYBER = "https://www.cybersport.ru/api"
NETWORK_ERRORS = (OSError, ValueError, EOFError)
MAX_BYTES = 96 * 1024 * 1024


def warn(message):
    print(f"Result sync: {message}", file=sys.stderr)
    if os.environ.get("GITHUB_ACTIONS") == "true":
        safe = str(message).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::warning title=Tournament results::{safe}")


def fetch(url):
    request = Request(url, headers={"User-Agent": "DotaTracker-ResultSync/1.0",
                                    "Accept": "application/json", "Accept-Encoding": "gzip"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=25) as response:
                stream = gzip.GzipFile(fileobj=response) if response.headers.get("Content-Encoding") == "gzip" else response
                raw = stream.read(MAX_BYTES + 1)
                if len(raw) > MAX_BYTES:
                    raise ValueError("JSON response is too large")
                return json.loads(raw)
        except HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504, 520, 522, 524) or attempt == 2:
                raise
        except (URLError, TimeoutError):
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)


def positive(value):
    return type(value) is int and value > 0


def stamp(value):
    if not isinstance(value, str):
        raise ValueError("missing UTC timestamp")
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("timezone missing")
    return dt.timestamp()


def iso(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")


def fact(row):
    number, match_id = row["map_number"], row.get("steam_match_id")
    if not positive(number) or (match_id is not None and
                                (not str(match_id).isdigit() or int(match_id) <= 0)):
        raise ValueError("invalid map identity")
    if match_id is None and not (row.get("external_game_id") and row.get("source_url")):
        raise ValueError(f"map {number} missing verified source identity")
    if row["winner"] not in ("A", "B") or not positive(row["duration_seconds"]):
        raise ValueError(f"invalid result for Steam {match_id}")
    started = stamp(row["started_at_utc"]) if row.get("started_at_utc") else None
    identity = str(match_id) if match_id is not None else str(row["external_game_id"])
    return number, identity, started, row["duration_seconds"], row["winner"]


def validate(data):
    if data.get("version") != 1 or not isinstance(data.get("tournaments"), dict):
        raise ValueError("unknown result snapshot format")
    identities = set()
    for key, event in data["tournaments"].items():
        if not key or not isinstance(event.get("name"), str):
            raise ValueError("event identity missing")
        for sid, series in event["series"].items():
            teams = series["team_a"], series["team_b"]
            if not sid or not all(teams) or teams[0] == teams[1] or not positive(series["best_of"]):
                raise ValueError(f"invalid fixture {key}/{sid}")
            stamp(series["starts_at_utc"])
            wins = Counter()
            seen = set()
            for row in sorted(series["maps"], key=lambda m: m["map_number"]):
                number, match_id, _, _, winner = fact(row)
                if match_id in identities or number in seen or number > series["best_of"]:
                    raise ValueError(f"duplicate or out-of-range map {key}/{sid}/{number}")
                wins[winner] += 1
                seen.add(number)
                identities.add(match_id)
            if series["finished"] and not terminal(series["best_of"], series["maps"]):
                raise ValueError(f"finished fixture has unverified outcome {key}/{sid}")
    return data


def terminal(best_of, rows):
    ordered = sorted(rows, key=lambda m: m["map_number"])
    if not ordered or [r["map_number"] for r in ordered] != list(range(1, len(rows) + 1)):
        return False
    threshold = best_of // 2 + 1
    prior = Counter(r["winner"] for r in ordered[:-1])
    return (max(prior.values(), default=0) < threshold
            and (prior[ordered[-1]["winner"]] + 1 == threshold or len(rows) == best_of))


def structural(series):
    return series["team_a"], series["team_b"], series["best_of"]


def orientation(source, target):
    """Return the A/B ordering of a second representation of the same confirmed pair."""
    pair = source.get("team_a"), source.get("team_b")
    reference = target.get("team_a"), target.get("team_b")
    if not all(pair) or pair[0] == pair[1]:
        return 0
    return 1 if pair == reference else -1 if pair[::-1] == reference else 0


def oriented_result(row, order):
    if order == 1:
        return row
    if order != -1 or row.get("winner") not in ("A", "B"):
        raise ValueError("cannot orient unknown winner or team pair")
    return {**row, "winner": "B" if row["winner"] == "A" else "A"}


def extend(series, rows):
    """Combine facts by slot, preserving supplemental seed fields and the first actual observation."""
    by_number = {r["map_number"]: r for r in series["maps"]}
    for row in rows:
        n = row["map_number"]
        if n in by_number and fact(row) != fact(by_number[n]):
            raise ValueError(f"conflicting historical outcome for map {n}")
        by_number[n] = {**row, **by_number.get(n, {})}
    ordered = sorted(by_number.values(), key=lambda m: m["map_number"])
    if len({fact(r)[1] for r in ordered}) != len(ordered):
        raise ValueError("source ID repeated in different slots")
    series["maps"] = ordered
    series["finished"] = terminal(series["best_of"], ordered)


def hydrate(seed, previous):
    validate(previous)
    for key, older in deepcopy(previous["tournaments"]).items():
        event = seed["tournaments"].setdefault(key, older)
        for sid, old in older["series"].items():
            series = event["series"].get(sid)
            if series is None:
                event["series"][sid] = old
                continue
            order = orientation(old, series)
            if not order or series["best_of"] != old["best_of"]:
                if old["maps"] and series["maps"]:
                    raise ValueError(f"seed and published results disagree on {sid} participants")
                if old["maps"]:
                    event["series"][sid] = old
                continue
            for field in ("phase", "group"):
                if field in old:
                    series.setdefault(field, old[field])
            extend(series, [oriented_result(row, order) for row in old["maps"]])
    return validate(seed)


def league_matches(raw, league_id, now):
    if not isinstance(raw, list):
        raise ValueError("league returned unexpected response")
    by_id, contested = {}, set()
    for row in raw:
        if (row.get("leagueid") != league_id or type(row.get("radiant_win")) is not bool
                or any(not positive(row.get(k)) for k in
                       ("match_id", "start_time", "duration", "radiant_team_id", "dire_team_id"))
                or row["radiant_team_id"] == row["dire_team_id"]
                or row["start_time"] + row["duration"] > now):
            continue
        mid = str(row["match_id"])
        if mid in by_id and by_id[mid] != row:
            contested.add(mid)
        by_id[mid] = row
    for mid in contested:
        warn(f"OpenDota returned conflicting rows for {mid}")
        del by_id[mid]
    return by_id


def participants(series, row, result):
    """Infer the two Steam team IDs only from a previously verified exact match result."""
    if row["duration"] != result["duration_seconds"] or row["start_time"] != stamp(result["started_at_utc"]):
        raise ValueError("Steam match timing disagrees with result")
    winner_id = row["radiant_team_id"] if row["radiant_win"] else row["dire_team_id"]
    loser_id = row["dire_team_id"] if row["radiant_win"] else row["radiant_team_id"]
    names = series["team_a"], series["team_b"]
    return zip(names, (winner_id, loser_id) if result["winner"] == "A" else (loser_id, winner_id))


def steam_teams(event, matches):
    names = defaultdict(set)
    for match in matches.values():
        for side in ("radiant", "dire"):
            name = match.get(f"{side}_team_name") or match.get(f"{side}_name")
            if name:
                names[name.casefold()].add(match[f"{side}_team_id"])
    for series in event["series"].values():
        for result in series["maps"]:
            match = matches.get(str(result.get("steam_match_id")))
            if match and result.get("started_at_utc"):
                try:
                    for name, team_id in participants(series, match, result):
                        names[name.casefold()].add(team_id)
                except ValueError as exc:
                    warn(f"Steam {match['match_id']}: {exc}; excluded from team identity mapping")
    return names


def names_for_match(document, entry):
    included = {(item["type"], item["id"]): item for item in document["included"]}
    def related(parent, key):
        ref = parent["relationships"][key]["data"]
        return included[(ref["type"], ref["id"])]
    return [related(related(entry, f"participant{n}"), "team")["attributes"]["title"].casefold()
            for n in (1, 2)]


def fixture_stage(relations, resources):
    table = (relations.get("groupTable") or {}).get("data") or {}
    if table.get("type") == "group_table" and isinstance(table.get("id"), str):
        group = resources.get(("group_table", table["id"]), {}).get("attributes", {})
        name = group.get("name")
        if isinstance(name, str) and name.strip():
            name = name.strip()
            short = re.fullmatch(r"(?:группа|group)\s+([АВСЕ])", name, re.I)
            if short:
                name = "Группа " + short[1].upper().translate(str.maketrans("АВСЕ", "ABCE"))
            elif not re.match(r"^(?:группа|group)\b", name, re.I):
                name = f"Группа {name}"
            return {"group": {"id": table["id"], "name": name}, "phase": f"Групповой этап · {name}"}
    ref = (relations.get("bracket") or {}).get("data") or {}
    bracket = resources.get(("stage_bracket", ref.get("id")), {}).get("attributes", {})
    phase = bracket.get("name")
    return {"phase": phase.strip()} if isinstance(phase, str) and phase.strip() else {}


def stage_schedule(config, read, previous):
    stage = str(config["stage_id"])
    brackets = {str(n) for n in config.get("bracket_ids", [])}
    result = {}
    for offset in range(0, 10000, 100):
        query = urlencode({"filter[stage]": stage, "page[limit]": "100", "page[offset]": offset, "sort": "date"})
        try:
            doc = read(f"{CYBER}/matches?{query}")
            resources = {(r["type"], r["id"]): r for r in doc["included"]}
        except (KeyError, TypeError, *NETWORK_ERRORS) as exc:
            warn(f"stage {stage} page {offset // 100 + 1}: {exc}; keeping earlier fixtures")
            break
        new = 0
        for entry in doc["data"]:
            try:
                ref = str(entry["id"])
                relations = entry["relationships"]
                if entry["type"] != "match" or not ref.isascii() or not ref.isdigit() or relations["stage"]["data"] != {"type":"stage","id":stage}:
                    continue
                bracket = (relations.get("bracket") or {}).get("data") or {}
                if brackets and (bracket.get("type") != "stage_bracket" or bracket.get("id") not in brackets):
                    continue
                attrs = entry["attributes"]
                best = {"bestOf1":1,"bestOf2":2,"bestOf3":3,"bestOf5":5}.get(attrs.get("format"))
                if not best or attrs.get("isHidden") is not False or type(attrs.get("isFinished")) is not bool:
                    continue
                names, scores = [], []
                for key in ("participant1", "participant2"):
                    pointer = relations[key]["data"]
                    part = resources[("match_participant", pointer["id"])]
                    if pointer["type"] != "match_participant" or any(part["attributes"].get(flag) is not False for flag in ("isTbd", "isTba")):
                        break
                    team = part["relationships"]["team"]["data"]
                    if team["type"] != "team":
                        break
                    names.append(resources[("team", team["id"])]["attributes"]["title"].strip())
                    scores.append(part["attributes"].get("matchScore"))
                if len(names) != 2 or not all(names) or names[0].casefold() == names[1].casefold():
                    continue
                start = iso(stamp(f"{attrs['date']}T{attrs['time']}+03:00"))
                sid = f"cs-{stage}-{ref}"
                old = previous.get(sid)
                if old and names == [old["team_b"], old["team_a"]]:
                    names.reverse()
                    scores.reverse()
                finished = attrs["isFinished"]
                if not all(type(n) is int and n >= 0 for n in scores):
                    scores = None
                elif best == 2:
                    if sum(scores) > 2 or finished != (sum(scores) == 2):
                        scores = None
                else:
                    target = best // 2 + 1
                    if min(scores) >= target or max(scores) > target or (max(scores) == target) != finished:
                        scores = None
                row = {"series_id": sid, "source_match_id": ref, "team_a":names[0], "team_b":names[1],
                       "starts_at_utc":start, "best_of":best, "finished":finished, "map_score":scores,
                       "maps":[], **fixture_stage(relations, resources)}
                if sid in result and result[sid] != row:
                    raise ValueError(f"conflicting source fixture {sid}")
                new += sid not in result
                result[sid] = row
            except (KeyError, TypeError, ValueError):
                continue  # TBD fixtures have no names or start time.
        if len(doc["data"]) < 100:
            break
        if offset and not new and all(f"cs-{stage}-{r['id']}" in result for r in doc["data"]):
            warn(f"stage {stage}: provider repeated pagination")
            break
    return {"series": list(result.values())}


def registrations(path):
    rows = json.loads(path.read_bytes())
    if not isinstance(rows, list):
        raise ValueError("tournament registry must be an array")
    keys, stages = set(LEAGUES), set(STAGES.values())
    for row in rows:
        if (not re.fullmatch("[a-z0-9]+(?:-[a-z0-9]+)*", row["key"]) or not row["name"].strip()
                or not positive(row["league_id"]) or not positive(row["stage_id"])
                or not all(positive(n) for n in row.get("bracket_ids", []))
                or row["key"] in keys or str(row["stage_id"]) in stages):
            raise ValueError("invalid or duplicate registered tournament identity")
        keys.add(row["key"])
        stages.add(str(row["stage_id"]))
    return rows


def roster_matches(entry, resources, stats, record):
    """Corroborate the ten Steam player accounts when both game references come from one feed."""
    def lookup(index, ref):
        return index[(ref["type"], ref["id"])]
    expected = set()
    for side in ("participant1TeamPlayers", "participant2TeamPlayers"):
        refs = entry["relationships"][side]["data"]
        if len(refs) != 5:
            return False
        for ref in refs:
            slot = lookup(resources, ref)
            person = lookup(resources, slot["relationships"]["player"]["data"])
            account = lookup(resources, person["relationships"]["dotaPlayer"]["data"])
            expected.add(str(account["attributes"]["externalId"]))
    index = {(r["type"], r["id"]): r for r in stats["included"]}
    observed = set()
    for ref in record["relationships"]["participants"]["data"]:
        player = lookup(index, lookup(index, ref)["relationships"]["player"]["data"])
        observed.add(str(player["attributes"]["externalId"]))
    return len(expected) == 10 and observed == expected and all(i.isdigit() and int(i) > 0 for i in observed)


def source_maps(series, source_id, stage_id, league, steam_names, read):
    doc = read(f"{CYBER}/matches/{source_id}?with_details=1")
    entry = doc["data"]
    if entry["id"] != str(source_id) or str(entry["relationships"]["stage"]["data"]["id"]) != str(stage_id):
        raise ValueError("wrong source series or stage")
    sides = names_for_match(doc, entry)
    expected = [series[k].casefold() for k in ("team_a", "team_b")]
    if sides != expected and sides != list(reversed(expected)):
        raise ValueError("source participants do not match fixture")
    games = entry["relationships"]["games"]["data"]
    resources = {(r["type"], r["id"]): r for r in doc["included"]}
    if len(games) > series["best_of"] or len({g["id"] for g in games}) != len(games):
        raise ValueError("ambiguous game positions")
    steam_ids = [resources[("match_game", ref["id"])]["attributes"].get("externalApiId") for ref in games]
    if len([i for i in steam_ids if i]) != len({str(i) for i in steam_ids if i}):
        raise ValueError("Steam ID repeated in different source games")
    prior = {m["map_number"]: m for m in series["maps"]}
    rows = []
    for n, ref in enumerate(games, 1):
        attrs = resources[("match_game", ref["id"])]["attributes"]
        points = attrs.get("participant1Score"), attrs.get("participant2Score")
        if points not in ((1, 0), (0, 1)) or any(attrs.get(k) for k in ("isWalkover", "isMapAdvantage")):
            continue
        steam_id = str(attrs.get("externalApiId") or "")
        if not steam_id.isdigit():
            continue
        winning_name = sides[points.index(1)]
        winner = "A" if winning_name == expected[0] else "B"
        if n in prior:
            if prior[n]["winner"] != winner or (prior[n].get("steam_match_id") is not None
                    and str(prior[n]["steam_match_id"]) != steam_id):
                raise ValueError("source contradicts saved game")
            continue
        match = league.get(steam_id)
        if match is not None:
            steam_winner = "radiant" if match["radiant_win"] else "dire"
            steam_loser = "dire" if match["radiant_win"] else "radiant"
            losing_name = sides[1 - points.index(1)]
            if (steam_names[winning_name] != {match[f"{steam_winner}_team_id"]}
                    or steam_names[losing_name] != {match[f"{steam_loser}_team_id"]}):
                raise ValueError("Steam participants or winning side unverified")
            started, duration = match["start_time"], match["duration"]
        else:
            query = urlencode({"filter[externalApiIds]": steam_id})
            stats = read(f"{CYBER}/v1/match-stats/dota2?{query}")
            records = [r for r in stats["data"] if str(r["attributes"].get("externalId")) == steam_id]
            if len(records) != 1:
                continue
            stat = records[0]["attributes"]
            if (str(stat.get("internalId")) != ref["id"] or stat.get("position") != n
                    or stat.get("status") != 4 or stat.get("winner") not in (1, 2)):
                continue
            resolved = {}
            for side in ("radiantTeam", "direTeam"):
                team_ref = records[0]["relationships"][side]["data"]
                team_names = [r["attributes"]["title"].casefold() for r in stats["included"]
                              if r["type"] == team_ref["type"] and r["id"] == team_ref["id"]]
                if len(team_names) == 1:
                    resolved[side] = team_names[0]
            won = "radiantTeam" if stat["winner"] == 1 else "direTeam"
            if set(resolved.values()) != set(expected) or resolved.get(won) != winning_name:
                raise ValueError("stats participants or winning side disagree with bracket")
            if not roster_matches(entry, resources, stats, records[0]):
                raise ValueError("the game's player accounts differ from the scheduled rosters")
            started, duration = stat.get("startedAt"), stat.get("duration")
        if not positive(started) or not positive(duration):
            continue
        fixture_start = stamp(series["starts_at_utc"])
        if not fixture_start - 7200 <= started <= fixture_start + 12 * 3600 or started + duration > time.time():
            continue
        rows.append({"map_number": n, "steam_match_id": steam_id, "winner": winner,
                     "started_at_utc": iso(started), "duration_seconds": duration,
                     "source_url": f"{CYBER}/matches/{source_id}?with_details=1"})
    return rows


def fill_from_bracket(event, schedule, stage, league, read):
    listed = None
    steam_names = steam_teams(event, league)
    for fixture in schedule["series"]:
        sid = fixture["series_id"]
        series = event["series"].get(sid)
        if not series or series["finished"] or not orientation(fixture,series) or fixture["best_of"] != series["best_of"]:
            continue
        start = stamp(fixture["starts_at_utc"])
        if start > time.time():
            continue
        try:
            source_id = fixture.get("source_match_id") or series.get("source_match_id")
            if not source_id:
                if listed is None:
                    listed = [(s["source_match_id"], frozenset((s["team_a"].casefold(),s["team_b"].casefold())),
                               stamp(s["starts_at_utc"])) for s in stage_schedule({"stage_id": stage},read,{})["series"]]
                pair = frozenset(series[k].casefold() for k in ("team_a", "team_b"))
                hits = {ref for ref, teams, when in listed if teams == pair and abs(when - start) <= 7200}
                if len(hits) != 1:
                    continue
                source_id = hits.pop()
            if str(source_id).isdigit():
                extend(series, source_maps(series, source_id, stage, league, steam_names, read))
        except (KeyError, TypeError, *NETWORK_ERRORS) as exc:
            warn(f"{sid}: bracket verification pending ({exc})")


def enrich(event, schedule, rows):
    fixtures = {s["series_id"]: s for s in schedule["series"]}
    if len(fixtures) != len(schedule["series"]):
        raise ValueError("duplicate series IDs in schedule")
    names = steam_teams(event, rows)

    slots = {s["series_id"]: s for s in (schedule.get("event") or {}).get("slots", [])}
    by_pair = defaultdict(list)
    anchor_rows = defaultdict(list)
    for sid, fixture in fixtures.items():
        new = {k: fixture[k] for k in ("team_a", "team_b", "best_of", "starts_at_utc")}
        if fixture.get("source_match_id"):
            new["source_match_id"] = str(fixture["source_match_id"])
        new.update(maps=[], finished=False)
        if not new["team_a"] or not new["team_b"] or new["team_a"] == new["team_b"]:
            continue
        series = event["series"].setdefault(sid, new)
        if not orientation(new, series) or new["best_of"] != series["best_of"]:
            if series["maps"]:
                warn(f"{sid}: participants or format changed; retain verified maps")
                continue
            series = event["series"][sid] = new
        if not series["maps"]:
            series["starts_at_utc"] = new["starts_at_utc"]
        phase = fixture.get("phase") or slots.get(sid, {}).get("phase")
        if isinstance(phase, str) and phase.strip():
            series["phase"] = phase.strip()
        if fixture.get("group"):
            series["group"] = fixture["group"]

        for card in fixture.get("maps", []):
            saved = card.get("result")
            if not saved or not saved.get("steam_match_id") or not saved.get("started_at_utc"):
                continue
            match = rows.get(str(saved["steam_match_id"]))
            order = orientation(card, series)
            if not match or not order or card.get("series_id") != sid:
                continue
            result = {"map_number": card["map_number"], "steam_match_id": str(match["match_id"]),
                      "started_at_utc": saved["started_at_utc"], "duration_seconds": saved["duration_seconds"],
                      "winner": oriented_result(saved, order)["winner"], "source_url": f"https://api.opendota.com/api/matches/{match['match_id']}"}
            fact(result)
            # Independent confirmation requires already established Steam teams or source names.
            try:
                mapping = list(participants(series, match, result))
            except ValueError as exc:
                warn(f"{sid}/{card['map_number']}: {exc}")
                continue
            if not all(names[name.casefold()] == {team_id} for name, team_id in mapping):
                continue
            anchor_rows[sid].append(result)

        ids = [names[series[k].casefold()] for k in ("team_a", "team_b")]
        if all(len(found) == 1 for found in ids):
            team_a, team_b = (next(iter(found)) for found in ids)
            if team_a != team_b:
                by_pair[frozenset((team_a, team_b))].append((sid, stamp(new["starts_at_utc"]), team_a))

    grouped = defaultdict(list)
    for match in rows.values():
        pair = frozenset((match["radiant_team_id"], match["dire_team_id"]))
        hits = [(sid, team_a) for sid, start, team_a in by_pair.get(pair, [])
                if start - 7200 <= match["start_time"] <= start + 12 * 3600]
        if len(hits) == 1:
            sid, team_a = hits[0]
            winner = match["radiant_team_id"] if match["radiant_win"] else match["dire_team_id"]
            grouped[sid].append((match, "A" if winner == team_a else "B"))

    for sid, fixture in fixtures.items():
        series = event["series"].get(sid)
        if not series or not orientation(fixture, series) or fixture["best_of"] != series["best_of"]:
            continue
        detail = slots.get(sid) or fixture
        score = detail.get("map_score")
        order = orientation(detail, series)
        if score is not None:
            score = list(score) if order == 1 else list(reversed(score)) if order == -1 else None
        matches = sorted(grouped[sid], key=lambda pair: pair[0]["start_time"])
        candidates = list(anchor_rows[sid])
        tally = [sum(w == side for _, w in matches) for side in ("A", "B")]
        same_provider_series = len({m.get("series_id") for m, _ in matches}) == 1
        if (matches and matches[0][0].get("series_id") and same_provider_series and score == tally
                and sum(score) <= fixture["best_of"]
                and len({m["start_time"] for m, _ in matches}) == len(matches)):
            ordered = [{"map_number": i, "steam_match_id": str(m["match_id"]), "winner": w,
                        "started_at_utc": iso(m["start_time"]), "duration_seconds": m["duration"],
                        "source_url": f"https://api.opendota.com/api/matches/{m['match_id']}"}
                       for i, (m, w) in enumerate(matches, 1)]
            if not detail.get("finished") or terminal(fixture["best_of"], ordered):
                candidates.extend(ordered)
        if candidates:
            try:
                extend(series, candidates)
            except ValueError as exc:
                warn(f"{sid}: {exc}; keeping existing facts")


def load_schedule(url, key, event, audit, read):
    def get(**params):
        return read(url + urlencode({"tournament": key, **params}))
    calendar = get(date="1970-01-01")
    dates = set(calendar.get("dates", []))
    existing = list(event["series"].values())
    known_dates = {datetime.fromtimestamp(stamp(s["starts_at_utc"]), timezone(timedelta(hours=h))).date().isoformat()
                   for s in existing for h in (0, 3, 7)}
    ended = (datetime.now(timezone.utc) - timedelta(days=3)).date().isoformat()
    if not audit and dates and existing and max(dates) < ended and dates <= known_dates and all(s["finished"] for s in existing):
        return None
    series, slots = {}, {}
    def merge(page):
        for source, records in ((series, page["series"]), (slots, (page.get("event") or {}).get("slots", []))):
            for entry in records:
                sid = entry["series_id"]
                if sid in source and (not orientation(source[sid],entry) or source[sid].get("best_of") != entry.get("best_of")):
                    raise ValueError(f"conflicting fixtures for {sid} across schedule pages")
                source[sid] = entry
    try:
        merge(get())
    except NETWORK_ERRORS as exc:
        warn(f"{key}: full schedule failed ({exc}), retrying by date")
    covered = {item.get("tournament_date") for item in (*series.values(), *slots.values())}
    for date in sorted(dates - covered):
        try:
            merge(get(date=date))
        except (KeyError, TypeError, *NETWORK_ERRORS) as exc:
            warn(f"{key} {date}: {exc}; prior fixtures retained")
    return {"series": list(series.values()), "event": {"slots": list(slots.values())}}


def run(seed, origin, read=fetch, audit=True, configured=None):
    schedule_url = f"{origin.rstrip('/')}/api/v1/schedule?"
    local = {r["key"]:r for r in (registrations(REGISTRY) if configured is None else configured)}
    try:
        catalog = read(schedule_url + urlencode({"date": "1970-01-01"}))["tournaments"]
        if not isinstance(catalog, list) or not catalog:
            raise ValueError("empty tournament catalog")
    except (KeyError, TypeError, *NETWORK_ERRORS) as exc:
        warn(f"tracker catalog unavailable ({exc}); checking configured stages")
        catalog = []
    options = {r["key"]:r for r in catalog}
    for key, config in local.items():
        options[key] = {**options.get(key, {}), **config}
    cache = {}
    cached_match = lru_cache(maxsize=24)(read)
    for option in options.values():
        key = option["key"]
        event = seed["tournaments"].setdefault(key, {"name": option["name"], "series": {}})
        try:
            if key in local:
                schedule = stage_schedule(local[key], cached_match, event["series"])
            else:
                schedule = load_schedule(schedule_url, key, event, audit, read)
            if schedule is None:
                continue
            league_id = option.get("league_id") or LEAGUES.get(key)
            if positive(league_id) and league_id not in cache:
                try:
                    raw = read(f"https://api.opendota.com/api/leagues/{league_id}/matches")
                    cache[league_id] = league_matches(raw, league_id, time.time())
                except NETWORK_ERRORS as exc:
                    warn(f"league {league_id}: {exc}; trying public bracket")
                    cache[league_id] = {}
            if not league_id:
                warn(f"{key}: public league ID missing; retained scheduled fixtures")
            enrich(event, schedule, cache.get(league_id, {}))
            stage = option.get("stage_id") or STAGES.get(key)
            if stage and str(stage).isdigit():
                fill_from_bracket(event, schedule, stage, cache.get(league_id, {}), cached_match)
        except (KeyError, TypeError, *NETWORK_ERRORS) as exc:
            warn(f"{key}: {exc}; retained prior results")
    return validate(seed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", type=Path, default=DATA)
    parser.add_argument("--previous-url", required=True)
    parser.add_argument("--audit-archives", action="store_true")
    args = parser.parse_args()
    origin = json.loads((ROOT / "public/config.json").read_text())["apiUrl"]
    seed = validate(json.loads(args.path.read_text(encoding="utf-8")))
    try:
        previous = fetch(args.previous_url)
    except HTTPError as exc:
        if exc.code != 404:
            raise
        previous = {"version": 1, "tournaments": {}}
    hydrate(seed, previous)
    try:
        run(seed, origin, audit=args.audit_archives)
    except (KeyError, TypeError, *NETWORK_ERRORS) as exc:
        warn(f"catalog: {exc}; using previously verified snapshot")
    validate(seed)
    temporary = args.path.with_suffix(".tmp")
    temporary.write_text(json.dumps(seed, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temporary.replace(args.path)
    changed = seed != previous
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
            print(f"changed={str(changed).lower()}", file=stream)
    for key, event in seed["tournaments"].items():
        series = event["series"]
        print(f"{key}: {len(series)} series, {sum(len(s['maps']) for s in series.values())} verified maps")


if __name__ == "__main__":
    main()
