import json
import unittest
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from scripts.odds_collector import (
    FAILURE_STATUSES,
    classify_page,
    load_targets,
    observation,
    run,
    safe_landing_url,
    team_presence,
    valid_source,
)

LIGA = {
    "id": "liga-1",
    "bookmaker": "Лига Ставок",
    "probe_mode": "event",
    "enabled": True,
    "revision": 1,
    "event": "Амур — Салават Юлаев",
    "start_at": "2026-10-17T10:00:00+03:00",
    "source_url": "https://www.ligastavok.ru/sports/ice-hockey/example",
    "market": "ТМ 4,5 за 60 минут",
    "teams": ["Амур", "Салават"],
}
PARI = {
    "id": "pari-homepage-v1",
    "bookmaker": "PARI",
    "probe_mode": "homepage",
    "enabled": True,
    "revision": 1,
    "one_shot": True,
    "source_url": "https://pari.ru/",
}
NOW = datetime(2026, 10, 16, 12, tzinfo=timezone.utc)


class CollectorTests(unittest.TestCase):
    def test_domains_allow_only_expected_https(self):
        self.assertTrue(valid_source(LIGA["source_url"], "Лига Ставок"))
        self.assertTrue(valid_source("https://www.pari.ru/", "PARI"))
        self.assertTrue(valid_source("https://winline.ru/", "Winline"))
        self.assertTrue(valid_source("https://betboom.ru/", "BetBoom"))
        self.assertFalse(valid_source("http://pari.ru/", "PARI"))
        self.assertFalse(valid_source("https://pari.ru.evil.invalid/", "PARI"))
        self.assertFalse(valid_source("https://winline.ru/", "PARI"))
        self.assertFalse(valid_source("https://pari.ru@evil.invalid/", "PARI"))

    def test_safe_landing_url_strips_query(self):
        self.assertEqual(
            safe_landing_url("https://pari.ru/sport?token=secret#profile", "PARI"),
            "https://pari.ru/sport",
        )
        self.assertEqual(
            safe_landing_url("https://login.example.com/auth?token=value", "PARI"),
            "external-domain:login.example.com",
        )

    def test_liga_security_page_detected(self):
        status, reason = classify_page(
            "Лига Ставок", "Доступ заблокирован системой защиты. User IP: 1.2.3.4",
            LIGA["source_url"], LIGA["teams"],
        )
        self.assertEqual(status, "blocked")
        self.assertIn("restriction", reason)

    def test_generic_access_denial_detected(self):
        status, _ = classify_page(
            "PARI", "Checking your browser! CAPTCHA", "https://pari.ru/", [],
            bookmaker="PARI", probe_mode="homepage",
        )
        self.assertEqual(status, "blocked")

    def test_homepage_brand_visible_is_not_market(self):
        status, _ = classify_page(
            "Ставки на спорт — PARI", "PARI Букмекерская контора. " * 10,
            "https://pari.ru/", [], bookmaker="PARI", probe_mode="homepage",
        )
        self.assertEqual(status, "homepage_visible")
        row = observation(PARI, status, "Brand visible", "2026-10-16T12:00:00+00:00")
        self.assertIsNone(row["odds"])
        self.assertFalse(row["market_verified"])
        self.assertFalse(row["start_at_verified"])
        self.assertFalse(row["price_verified"])

    def test_homepage_without_brand_is_not_verified(self):
        status, _ = classify_page(
            "Generic", "Welcome to another site! " * 8, "https://pari.ru/", [],
            bookmaker="PARI", probe_mode="homepage",
        )
        self.assertEqual(status, "homepage_not_verified")

    def test_homepage_redirect_cross_bookmaker_is_bad(self):
        status, _ = classify_page(
            "PARI", "PARI Букмекерская контора" * 9,
            "https://winline.ru/", [], bookmaker="PARI", probe_mode="homepage",
        )
        self.assertEqual(status, "redirected")

    def test_matching_teams_never_confirms_odds(self):
        status, _ = classify_page(
            "Амур — Салават", "Амур Салават " + "Страница матча. " * 9,
            LIGA["source_url"], LIGA["teams"],
        )
        self.assertEqual(status, "event_visible")
        row = observation(LIGA, status, "Teams visible", "2026-10-16T12:00:00+00:00")
        self.assertIsNone(row["odds"])
        self.assertFalse(row["market_verified"])

    def test_optional_event_aliases(self):
        self.assertEqual(
            team_presence("Amur — Salavat Yulaev", ["Амур", "Салават"],
                          [["Amur"], ["Salavat Yulaev"]]),
            [True, True],
        )

    def test_disabled_liga_never_probed(self):
        disabled = dict(LIGA, enabled=False)
        def forbidden(_):
            raise AssertionError("Browser must not open for disabled source")
        doc = run([disabled], NOW, probe=forbidden)
        self.assertEqual(doc["observations"][0]["status"], "paused")
        self.assertIsNone(doc["observations"][0]["odds"])

    def test_disabled_source_does_not_change_timestamp_after_first_run(self):
        disabled = dict(LIGA, enabled=False)
        def forbidden(_):
            raise AssertionError("Browser must not open")
        first = run([disabled], NOW, probe=forbidden)
        second = run([disabled], datetime(2026, 10, 16, 13, tzinfo=timezone.utc),
                     probe=forbidden, previous=first)
        self.assertEqual(second["observations"], first["observations"])
        self.assertEqual(second["generated_at"], first["generated_at"])
        third = run([disabled], datetime(2026, 10, 16, 14, tzinfo=timezone.utc),
                    probe=forbidden, previous=second)
        self.assertEqual(third, second)

    def test_one_shot_homepage_is_not_retried_even_on_block(self):
        calls = []
        def blocked(_):
            calls.append(1)
            return "blocked", "Protection page", {"landing_url": "https://pari.ru/"}
        first = run([PARI], NOW, probe=blocked)
        self.assertEqual(len(calls), 1)
        second = run([PARI], datetime(2026, 10, 16, 13, tzinfo=timezone.utc),
                     probe=blocked, previous=first)
        self.assertEqual(len(calls), 1)
        self.assertEqual(second["observations"][0]["status"], "blocked")
        self.assertEqual(first["observations"], second["observations"])

    def test_explicit_revision_can_rearm_probe(self):
        calls = []
        def visible(_):
            calls.append(1)
            return "homepage_visible", "Site visible", {}
        first = run([PARI], NOW, probe=visible)
        rearmed = dict(PARI, revision=2)
        second = run([rearmed], datetime(2026, 10, 16, 13, tzinfo=timezone.utc),
                     probe=visible, previous=first)
        self.assertEqual(len(calls), 2)
        self.assertEqual(second["observations"][0]["revision"], 2)

    def test_expired_event_no_browser(self):
        def forbidden(_):
            raise AssertionError("Browser must not open after start")
        doc = run([LIGA], datetime(2026, 10, 18, tzinfo=timezone.utc), probe=forbidden)
        self.assertEqual(doc["observations"][0]["status"], "expired")

    def test_invalid_target_host_is_rejected(self):
        with TemporaryDirectory() as tmp:
            p = Path(tmp, "targets.json")
            p.write_text(json.dumps({
                "schema_version": 1,
                "targets": [dict(PARI, source_url="https://bad.invalid/")],
            }), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_targets(p)

    def test_homepage_must_be_one_shot(self):
        with TemporaryDirectory() as tmp:
            p = Path(tmp, "targets.json")
            p.write_text(json.dumps({
                "schema_version": 1,
                "targets": [dict(PARI, one_shot=False)],
            }), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_targets(p)

    def test_bad_aliases_fail_closed(self):
        with TemporaryDirectory() as tmp:
            p = Path(tmp, "targets.json")
            p.write_text(json.dumps({
                "schema_version": 1,
                "targets": [dict(LIGA, team_aliases=[["Amur"], "Salavat"])],
            }), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_targets(p)


if __name__ == "__main__":
    unittest.main()
