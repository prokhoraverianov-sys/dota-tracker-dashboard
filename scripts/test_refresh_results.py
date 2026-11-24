import copy
import unittest

import refresh_results as sync
import sync_verified_outcomes as writes


def result(n, mid, winner, start):
    return {"map_number": n, "steam_match_id": str(mid), "started_at_utc": sync.iso(start),
            "winner": winner, "duration_seconds": 300}


def series(maps=()):
    return {"team_a": "PARIVISION", "team_b": "Team Spirit", "best_of": 5,
            "starts_at_utc": sync.iso(100000), "finished": False, "maps": list(maps)}


def league(mid, start, winner="B", source=123):
    return {"match_id": mid, "start_time": start, "duration": 300, "leagueid": 20486,
            "radiant_team_id": 10, "dire_team_id": 20, "radiant_win": winner == "A",
            "radiant_name": "PARIVISION", "dire_name": "Team Spirit", "series_id": source}


class ResultSyncTest(unittest.TestCase):
    def test_in_progress_reversed_sides_repeat_and_wrong_score(self):
        fixture = {**series(), "series_id": "final", "map_score": [1, 1]}
        event = {"name": "1win", "series": {}}
        left, right = league(11, 100000, "A"), league(12, 103000, "B")
        right.update(radiant_team_id=20, dire_team_id=10, radiant_win=True,
                     radiant_name="Team Spirit", dire_name="PARIVISION")
        rows = sync.league_matches([left, right], 20486, 200000)
        sync.enrich(event, {"series": [fixture]}, rows)
        self.assertEqual(["A", "B"], [m["winner"] for m in event["series"]["final"]["maps"]])
        saved = copy.deepcopy(event)
        sync.enrich(event, {"series": [fixture]}, rows)
        self.assertEqual(saved, event)
        third = league(13, 106000, "A")
        sync.enrich(event, {"series": [fixture]}, {**rows, "13": third})
        self.assertEqual(saved, event)

    def test_conflict_keeps_verified_maps_and_other_published_tournaments(self):
        maps = [result(1, 1, "A", 100000), result(2, 2, "B", 103000), result(3, 3, "B", 106000),
                result(4, 9095836436, "B", 109000)]
        archived = {**series(maps), "finished": True}
        before = {"version": 1, "tournaments": {"1win": {"name": "1win", "series": {"final": archived}}}}
        new = sync.hydrate({"version": 1, "tournaments": {}}, before)
        reloaded = new["tournaments"]["1win"]["series"]["final"]
        with self.assertRaises(ValueError):
            sync.extend(reloaded, [result(4, 9095846847, "B", 109000)])
        self.assertEqual(archived, reloaded)
        self.assertIsNot(before["tournaments"]["1win"], new["tournaments"]["1win"])
        hawk = {**maps[-1], "steam_match_id": None, "started_at_utc": None,
                "external_game_id": "hawk:219788", "source_url": "https://hawk.live/matches/219788"}
        reloaded["maps"][-1] = hawk
        sync.validate(new)
        with self.assertRaises(ValueError):
            sync.extend(reloaded, [result(4, 9095846847, "B", 109000)])
        self.assertEqual(hawk, reloaded["maps"][-1])

    def test_same_pair_same_window_cannot_bind_by_timing(self):
        fixture = {**series(), "map_score": [1, 0]}
        event = {"name": "1win", "series": {}}
        schedule = {"series": [dict(fixture, series_id=id_) for id_ in ("one", "two")]}
        sync.enrich(event, schedule, {"11": league(11, 100000, "A")})
        self.assertFalse(any(s["maps"] for s in event["series"].values()))

    def test_settlement_rechecks_slot_and_reads_back_without_rewriting(self):
        row = {**result(4, 9095836436, "B", 100000), "source_url": "https://www.opendota.com/matches/9095836436"}
        card = {"map_id": 44, "map_number": 4, "series_id": "final", "team_a": "PARIVISION", "team_b": "Team Spirit",
                "revision": 0, "tournament": "1win", "pre": None, "post": None}
        stage = {"map_id": 44, "snapshot_id": 1, "stage": "post_draft", "created_at_utc": sync.iso(100010),
                 "draft_observed_at_utc": sync.iso(100009), "draft_external_game_id": "steam:9095836436",
                 "analysis": {"metadata": {"status": "prediction"}, "shadow_forecast": {"winner_probability_team_a": .4}},
                 "model_team_a": card["team_a"], "model_team_b": card["team_b"]}
        card["post"] = stage
        calls = []
        def write(mid, body, key):
            calls.append((mid, body, key))
            card["result"] = {"winner": body["winner"], "duration_seconds": 300}
        def settle():
            return writes.settle_one("1win-key", "1win", "final", series(), row, None, True,
                                     read=lambda _: dict(card), write=write)
        stage["draft_external_game_id"] = "steam:9095846847"
        self.assertEqual(settle(), "unverified-post-draft")
        stage["draft_external_game_id"] = "steam:9095836436"
        self.assertEqual(settle(), "recorded")
        self.assertEqual(settle(), "already-recorded")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1], {"expected_revision": 0, "winner": "B", "duration": "05:00", "confirmed": True})
        card["result"]["winner"] = "A"
        self.assertEqual(settle(), "result-conflict")

    def test_calendar_fallback_preserves_partial_day(self):
        calls = []
        def read(url):
            calls.append(url)
            if "1970-01-01" in url:
                return {"dates": ["1971-01-01", "1971-01-02"]}
            if "date=1971-01-01" in url:
                return {"series": [{"series_id": "ok"}]}
            raise OSError("upstream failed")
        self.assertEqual(sync.load_schedule("https://tracker/schedule?", "one", {"series": {}}, True, read)["series"],
                         [{"series_id": "ok"}])
        self.assertEqual(len(calls), 4)

    def test_nonempty_partial_calendar_retries_uncovered_date(self):
        def read(url):
            if "1970-01-01" in url:
                return {"dates": ["1971-01-01", "1971-01-02"]}
            if "date=1971-01-02" in url:
                return {"series": [{"series_id": "two", "tournament_date": "1971-01-02"}]}
            if "date=" in url:
                raise AssertionError("the same complete day was fetched twice")
            return {"series": [{"series_id": "one", "tournament_date": "1971-01-01"}]}
        out = sync.load_schedule("https://tracker/schedule?", "one", {"series": {}}, True, read)
        self.assertEqual([s["series_id"] for s in out["series"]], ["one", "two"])

    def test_fourth_event_without_tracker_gets_real_game_results_once(self):
        config = {"key": "fourth", "name": "Fourth", "stage_id": 5001, "league_id": 20486, "bracket_ids": [72]}
        refs = [{"type": "match_participant", "id": str(n)} for n in (1, 2)]
        teamrefs = [{"type": "team", "id": str(n)} for n in (10, 20)]
        names = ["PARIVISION", "Team Spirit"]
        scores = [0, 0]
        def document():
            included = []
            for i in (0, 1):
                included.append({**refs[i], "attributes": {"isTbd": False, "isTba": False, "matchScore": scores[i]},
                                 "relationships": {"team": {"data": teamrefs[i]}}})
                included.append({**teamrefs[i], "attributes": {"title": names[i]}})
            relationships = {"stage": {"data": {"type":"stage","id":"5001"}},
                             "bracket": {"data": {"type":"stage_bracket","id":"72"}},
                             **{f"participant{i+1}": {"data":refs[i]} for i in (0,1)}}
            attrs = {"date":"1970-01-02","time":"06:46:40","format":"bestOf1","isHidden":False,"isFinished":sum(scores)>0}
            entry = {"type":"match","id":"191","attributes":attrs,"relationships":relationships}
            excluded = {**entry, "id":"192", "relationships":{**relationships,"bracket":{"data":{"type":"stage_bracket","id":"99"}}}}
            return {"data":[entry,excluded], "included":included}
        def read(url):
            if "tracker" in url:
                raise OSError("tracker unavailable")
            if "opendota.com" in url:
                return [league(555, 100000, "A")] if scores[0] else []
            if "/matches?" in url:
                return document()
            raise OSError("match details pending")
        snapshot = {"version":1,"tournaments":{f"old{i}":{"name":f"Old {i}","series":{}} for i in range(3)}}
        for score in (0,1,1):
            scores[0] = score
            sync.run(snapshot,"https://tracker",read,configured=[config])
            fixtures = snapshot["tournaments"]["fourth"]["series"]
            self.assertEqual(list(fixtures), ["cs-5001-191"])
            self.assertEqual(len(fixtures["cs-5001-191"]["maps"]),score)
        self.assertEqual(len(snapshot["tournaments"]),4)
        card=fixtures["cs-5001-191"]["maps"][0]
        self.assertEqual((card["steam_match_id"], card["winner"]),("555","A"))
        self.assertTrue(fixtures["cs-5001-191"]["finished"])

    def test_reversed_bracket_score_hydration_and_provider_binding(self):
        known = result(1, 11, "A", 100000)
        archive = {"name":"1win","series":{"final":series([known])}}
        flipped = {"team_a":"Team Spirit","team_b":"PARIVISION"}
        fixture = {**series(),"series_id":"final",**flipped,"map_score":[0,2]}
        rows = sync.league_matches([league(11,100000,"A"),league(12,103000,"A")],20486,200000)
        sync.enrich(archive,{"series":[fixture]},rows)
        self.assertEqual([r["winner"] for r in archive["series"]["final"]["maps"]], ["A","A"])
        previous = {"version":1,"tournaments":{"one":{"name":"1win","series":{
            "final":{**series([{**known,"winner":"B"}]),**flipped}}}}}
        sync.hydrate({"version":1,"tournaments":{"one":archive}},previous)
        self.assertEqual(archive["series"]["final"]["team_a"],"PARIVISION")
        before = copy.deepcopy(archive)
        wrong = {**fixture,"team_a":"Unrelated"}
        sync.enrich(archive,{"series":[wrong]},rows)
        self.assertEqual(archive,before)

    def test_submit_winner_in_fresh_card_order_only(self):
        row = {**result(1, 52, "A", 100000), "source_url":"https://www.opendota.com/matches/52"}
        card = {"series_id":"final","map_number":1,"tournament":"1win","map_id":71,"revision":0,
                "team_a":"Team Spirit","team_b":"PARIVISION","post":None}
        card["pre"] = {"stage":"pre_match","map_id":71,"snapshot_id":80,"created_at_utc":sync.iso(99900),
                       "model_team_a":card["team_a"],"model_team_b":card["team_b"],
                       "analysis":{"metadata":{"status":"prediction"},"shadow_forecast":{"winner_probability_team_a":.63}}}
        writes_seen = []
        def read(url):
            return {**card,"team_a":"PARIVISION","team_b":"Team Spirit"} if "/series/" in url else card
        def write(mid, body, key):
            writes_seen.append(body["winner"])
            card["result"] = {"duration_seconds":300,"winner":body["winner"]}
        def settle():
            return writes.settle_one("one","1win","final",series(),row,None,True,read=read,write=write)
        self.assertEqual(settle(),"recorded")
        self.assertEqual(writes_seen,["B"])
        self.assertEqual(settle(),"already-recorded")
        card["team_a"] = "Unrelated"
        self.assertEqual(settle(),"binding-changed")
        self.assertEqual(writes_seen,["B"])


if __name__ == "__main__":
    unittest.main()
