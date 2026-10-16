import unittest
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import json

from scripts.odds_collector import classify_page, load_targets, observation, run, valid_source

TARGET = {
    "id": "liga-1", "event": "Амур — Салават Юлаев",
    "start_at": "2026-10-17T10:00:00+03:00",
    "source_url": "https://www.ligastavok.ru/sports/ice-hockey/example",
    "market": "ТМ 4,5 за 60 минут", "teams": ["Амур", "Салават"],
}


class CollectorTests(unittest.TestCase):
    def test_source_whitelist(self):
        self.assertTrue(valid_source(TARGET["source_url"]))
        self.assertFalse(valid_source("http://www.ligastavok.ru/test"))
        self.assertFalse(valid_source("https://www.ligastavok.ru.evil.invalid/test"))

    def test_matching_teams_never_confirms_odds(self):
        status, _ = classify_page("Амур — Салават", "Амур Салават " + "Страница матча. " * 9, TARGET["source_url"], TARGET["teams"])
        self.assertEqual(status, "event_visible")
        row = observation(TARGET, status, "Visible names", "2026-10-16T13:00:00+00:00")
        self.assertIsNone(row["odds"])
        self.assertFalse(row["market_verified"])
        self.assertFalse(row["price_verified"])

    def test_captcha_is_blocked(self):
        status, _ = classify_page("", "Амур Салават Checking your browser! " * 8, TARGET["source_url"], TARGET["teams"])
        self.assertEqual(status, "blocked")

    def test_redirect_not_verified(self):
        status, _ = classify_page("Амур Салават", "Игровая страница " * 10, "https://example.com/", TARGET["teams"])
        self.assertEqual(status, "redirected")

    def test_future_target_mock_probe(self):
        def fake_probe(_):
            return "event_visible", "Fixture visible"
        value = run([TARGET], datetime(2026, 10, 16, 12, tzinfo=timezone.utc), fake_probe)
        self.assertEqual(value["status"], "checked")
        self.assertEqual(len(value["observations"]), 1)
        self.assertIsNone(value["observations"][0]["odds"])

    def test_expired_target_does_not_open_browser(self):
        def fail_probe(_):
            raise AssertionError("Browser must not open after start")
        value = run([TARGET], datetime(2026, 10, 18, tzinfo=timezone.utc), fail_probe)
        self.assertEqual(value["status"], "all_expired")
        self.assertEqual(value["observations"][0]["status"], "expired")

    def test_invalid_targets_fail_closed(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "targets.json"
            path.write_text(json.dumps({"schema_version": 1, "targets": [dict(TARGET, source_url="https://wrong.example/sports")]}), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_targets(path)


if __name__ == "__main__":
    unittest.main()
