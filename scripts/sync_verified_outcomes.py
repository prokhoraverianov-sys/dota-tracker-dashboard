"""Apply verified map facts to the public tracker without generating predictions or changing their grading."""

import argparse
from collections import Counter
import hashlib
import json
import os
import time
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from refresh_results import DATA, ROOT, fetch, positive, stamp, validate, warn


ORIGIN = "https://54-251-198-194.sslip.io"
API = ORIGIN + "/api/v1"
STATE = ROOT / "public/data/server-settlements.json"
PREVIOUS_STATE = "https://prokhoraverianov-sys.github.io/dota-tracker-dashboard/data/server-settlements.json"


class DirectOnly(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("redirected write refused")


def post_result(map_id, body, key):
    request = Request(f"{API}/maps/{map_id}/result", data=json.dumps(body).encode(), method="POST",
                      headers={"Content-Type": "application/json", "Idempotency-Key": key,
                               "User-Agent": "DotaTracker-VerifiedSettlement/1.0"})
    with build_opener(DirectOnly).open(request, timeout=20) as response:
        if response.status not in (200, 201):
            raise ValueError(f"unexpected HTTP {response.status}")
        json.load(response)


def same_card(card, expected):
    return all(card.get(k) == v for k, v in expected.items()) and card.get("play_status") != "unplayed"


def result_agrees(card, verified):
    saved = card.get("result")
    if not saved:
        return False
    return (saved.get("winner") == verified["winner"] and saved.get("duration_seconds") == verified["duration_seconds"]
            and (not saved.get("steam_match_id") or str(saved["steam_match_id"]) == verified["steam_match_id"]))


def check_stages(card, row, archive):
    if not card.get("pre") and not card.get("post"):
        return "no-original-forecast"
    if not row.get("steam_match_id") or not row.get("started_at_utc") or not row.get("source_url"):
        return "incomplete-verification"
    start = stamp(row["started_at_utc"])
    finish = start + row["duration_seconds"]
    if finish >= time.time():
        return "still-playing"
    if not card.get("post") and time.time() - finish < 900:
        return "waiting-for-post-worker"
    for key, kind in (("pre", "pre_match"), ("post", "post_draft")):
        stage = card.get(key)
        if stage is None:
            continue
        if stage.get("stage") != kind or stage.get("map_id") != card["map_id"] or not stage.get("snapshot_id"):
            return "forecast-identity"
        for label in ("team_a", "team_b"):
            model_name = stage.get("model_" + label)
            expected_name = card[label]
            if model_name not in (expected_name, expected_name + " (1win Essence III Play-In)"):
                return "forecast-team-identity"
        analysis = stage.get("analysis") or {}
        status = (analysis.get("metadata") or {}).get("status")
        probability = (analysis.get("shadow_forecast") or {}).get("winner_probability_team_a")
        if not ((status == "abstain" and probability is None)
                or (status == "prediction" and type(probability) in (int, float) and 0 <= probability <= 1)):
            return "unconfirmed-forecast-status"
        if not stage.get("created_at_utc"):
            return "undated-forecast"
        made = stamp(stage["created_at_utc"])
        if key == "pre":
            if made >= start:
                return "late-pre"
            continue
        observed = stage.get("draft_observed_at_utc")
        if not observed or not stamp(observed) <= made < finish:
            return "late-or-undated-post"
        external = stage.get("draft_external_game_id")
        if external != f"steam:{row['steam_match_id']}":
            proof = (archive or {}).get("post") or {}
            fields = ("snapshot_id", "map_id", "draft_external_game_id", "players_a", "players_b",
                      "heroes_a", "heroes_b", "created_at_utc", "draft_observed_at_utc")
            if (not external or not external.startswith("hawk:") or
                    str(proof.get("verified_steam_match_id")) != row["steam_match_id"]
                    or not all(proof.get(field) == stage.get(field) for field in fields)):
                return "unverified-post-draft"
    return None


def settle_one(key, name, sid, series, row, archive, apply, read=fetch, write=post_result):
    number = row["map_number"]
    slot_url = f"{API}/series/{quote(sid, safe='')}/maps/{number}"
    expected = {"tournament": name, "series_id": sid, "map_number": number,
                "team_a": series["team_a"], "team_b": series["team_b"]}
    slot = read(slot_url)
    if not same_card(slot, expected) or not positive(slot.get("map_id")):
        return "no-matching-server-card"
    mid = slot["map_id"]
    expected["map_id"] = mid
    card_url = f"{API}/maps/{mid}"
    card = read(card_url)
    if not same_card(card, expected) or card.get("revision") != slot.get("revision"):
        return "binding-changed"
    for stage in ("pre", "post"):
        if (slot.get(stage) or {}).get("snapshot_id") != (card.get(stage) or {}).get("snapshot_id"):
            return "binding-changed"
    if card.get("result"):
        return "already-recorded" if result_agrees(card, row) else "result-conflict"
    if slot.get("result") or card.get("analysis_context") == "retrospective":
        return "binding-changed"
    if archive and not same_card(archive, expected):
        return "archived-binding-conflict"
    blocked = check_stages(card, row, archive)
    if blocked:
        return blocked
    if not apply:
        return "would-record"
    duration = row["duration_seconds"]
    if not positive(duration) or duration // 60 > 999 or type(card.get("revision")) is not int:
        return "invalid-result"
    identity = json.dumps([key, sid, number, row["steam_match_id"], row["winner"], duration],
                          separators=(",", ":")).encode()
    body = {"expected_revision": card["revision"], "winner": row["winner"],
            "duration": f"{duration//60:02d}:{duration%60:02d}", "confirmed": True}
    try:
        write(mid, body, "auto-result-" + hashlib.sha256(identity).hexdigest()[:40])
    except HTTPError as exc:
        if exc.code != 409:
            raise
    checked = read(card_url)
    if same_card(checked, expected) and result_agrees(checked, row):
        return "recorded"
    return "unconfirmed-write"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if json.loads((ROOT / "public/config.json").read_bytes())["apiUrl"].rstrip("/") != ORIGIN:
        raise ValueError("production origin differs from configured origin")
    data = validate(json.loads(DATA.read_bytes()))
    archive_path = DATA.with_name("completed-forecasts.json")
    archived = json.loads(archive_path.read_bytes()) if archive_path.is_file() else {}
    try:
        state = fetch(PREVIOUS_STATE)
    except HTTPError as exc:
        if exc.code != 404:
            raise
        state = {"version": 1, "maps": {}}
    if state.get("version") != 1 or not isinstance(state.get("maps"), dict):
        raise ValueError("previous settlement state invalid")
    if args.apply:
        STATE.write_text(json.dumps(state, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    if fetch(API + "/auth/mode").get("public_access") is not True:
        raise ValueError("public mode is disabled")
    options = fetch(API + "/schedule?" + urlencode({"date": "1970-01-01"})).get("tournaments")
    if not isinstance(options, list):
        raise ValueError("could not confirm which tournaments the model server tracks")
    served = {entry["key"] for entry in options}
    original = json.dumps(state, sort_keys=True)
    queue = []
    for key, event in data["tournaments"].items():
        if key not in served:
            print(f"{key}: public results available; no model server registration")
            continue
        for sid, series in event["series"].items():
            for row in series["maps"]:
                if row.get("steam_match_id"):
                    queue.append((row.get("started_at_utc") or "", key, event["name"], sid, series, row))
    now = int(time.time())
    counts = Counter()
    processed = 0
    # Oldest unchecked attempt first. New facts take priority; repeated upstream failures
    # cannot consume the entire bounded batch ahead of never-checked maps.
    queue.sort(key=lambda item: item[0], reverse=True)
    queue.sort(key=lambda item: state["maps"].get(str(item[-1]["steam_match_id"]), {}).get("last_attempt", 0))
    for _, key, name, sid, series, row in queue:
        identifier = str(row["steam_match_id"])
        marker = [key, sid, row["map_number"], row["winner"], row["duration_seconds"]]
        known = state["maps"].get(identifier, {})
        if known.get("fact") == marker and known.get("next_attempt", 0) > now:
            counts["recently-checked"] += 1
            continue
        if processed >= 55:
            counts["next-run"] += 1
            continue
        processed += 1
        proof = next((c for c in archived.get(sid, []) if c["map_number"] == row["map_number"]), None)
        try:
            status = settle_one(key, name, sid, series, row, proof, args.apply)
        except (KeyError, TypeError, OSError, ValueError) as exc:
            warn(f"{key}/{sid}/{row['map_number']}: settlement deferred: {exc}")
            status = "retry"
        finally:
            time.sleep(.35)
        counts[status] += 1
        if status in ("result-conflict", "unconfirmed-write", "archived-binding-conflict"):
            warn(f"{key}/{sid}/{row['map_number']}: {status}; existing result preserved")
        if args.apply:
            transient = status in ("binding-changed", "retry", "unconfirmed-write", "waiting-for-post-worker", "still-playing")
            recent = row.get("started_at_utc") and now - stamp(row["started_at_utc"]) < 86400
            delay = 900 if transient or (recent and status in ("no-matching-server-card", "no-original-forecast")) else 86400
            state["maps"][identifier] = {"fact": marker, "last_attempt": now, "next_attempt": now+delay, "status": status}
    print("Server result verification:", dict(sorted(counts.items())))
    if args.apply:
        STATE.write_text(json.dumps(state, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            print("changed=" + str(original != json.dumps(state, sort_keys=True)).lower(), file=output)


if __name__ == "__main__":
    main()
