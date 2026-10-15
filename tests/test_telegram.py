import sys
import unittest
import io
import os
import urllib.error
from unittest.mock import patch
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from telegram_notify import pending_notifications, result_key, event_key, event_day, message, api, credentials


class NotificationsTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 15, 12, tzinfo=timezone.utc)
        self.event = dict(event='А — Б', market='П1', start_at='2026-10-15T12:45:00+00:00', status='Ожидается')

    def test_reminder_and_deduplication(self):
        first = pending_notifications(self.event, None, self.now)
        self.assertEqual([kind for kind, key in first], ['new', 'reminder'])
        previous = dict(result=result_key(self.event), sent=[key for kind, key in first])
        self.assertEqual(pending_notifications(self.event, previous, self.now), [])

    def test_old_history_and_unknown_time(self):
        old = dict(self.event, start_at='2026-10-14T12:00:00+00:00', score='2:1', status='Завершён')
        self.assertEqual(pending_notifications(old, None, self.now, first_run=True), [])
        unknown = dict(self.event, start_at=None)
        self.assertEqual(pending_notifications(unknown, None, self.now), [])

    def test_result_update_and_correction(self):
        done = dict(self.event, score='2:1', forecast_result='Сбылся', status='Завершён')
        previous = dict(result=result_key(self.event), sent=[])
        self.assertEqual([kind for kind, key in pending_notifications(done, previous, self.now)], ['result'])
        previous = dict(result=result_key(done), sent=['reminder:' + self.event['start_at']])
        self.assertEqual(pending_notifications(done, previous, self.now), [])

    def test_same_event_across_feeds_and_date_zone(self):
        self.assertEqual(event_key(self.event), event_key(dict(self.event, id='another', feed_id='signals')))
        self.assertEqual(event_day(dict(self.event, start_at='2026-10-15T22:00:00+00:00')), '2026-10-16')
        self.assertEqual(event_day(dict(self.event, start_at=None, calendar_date='15.10.2026')), '2026-10-15')
        self.assertEqual(event_day(dict(self.event, start_at=None, event_date='unknown')), '')

    def test_no_fake_result_in_message(self):
        text = message(dict(self.event, reported_forecast_result='Сбылся'), 'reminder')
        self.assertNotIn('Итог прогноза: Сбылся', text)
        self.assertIn('17:45 ЕКБ', text)

    def test_chat_not_found_has_actionable_diagnostic(self):
        error = urllib.error.HTTPError('https://example.test/secret', 400, 'Bad Request', {}, io.BytesIO(b'{"description":"Bad Request: chat not found"}'))
        with patch('urllib.request.urlopen', side_effect=error):
            with self.assertRaisesRegex(RuntimeError, 'Telegram getChat: HTTP 400.*TELEGRAM_CHAT_ID'):
                api('123:secret', 'getChat', {'chat_id': '12345'})

    def test_unknown_description_cannot_leak_secrets(self):
        error = urllib.error.HTTPError('https://example.test/secret', 400, 'Bad Request', {}, io.BytesIO(b'{"description":"token=123:secret chat=12345"}'))
        with patch('urllib.request.urlopen', side_effect=error):
            with self.assertRaises(RuntimeError) as caught:
                api('123:secret', 'getChat', {'chat_id': '12345'})
        self.assertNotIn('123:secret', str(caught.exception))
        self.assertNotIn('12345', str(caught.exception))

    def test_credentials_trim_and_reject_username(self):
        with patch.dict(os.environ, TELEGRAM_BOT_TOKEN=' 123:abc_DEF-9\n', TELEGRAM_CHAT_ID=' 456\n'):
            self.assertEqual(credentials(), ('123:abc_DEF-9', '456'))
        with patch.dict(os.environ, TELEGRAM_BOT_TOKEN='123:abc_DEF-9', TELEGRAM_CHAT_ID='@some_bot'):
            with self.assertRaisesRegex(RuntimeError, 'TELEGRAM_CHAT_ID'):
                credentials()


if __name__ == '__main__':
    unittest.main()
