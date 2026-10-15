"""Send dashboard event notifications; credentials are environment-only."""
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://stlisovafk13.github.io/BKliz/'
FEEDS = ('cycle', 'overview', 'signals')
STATE = ROOT / '.telegram-state/state.json'
EKB = timezone(timedelta(hours=5))


def api(token, method, payload):
    request = urllib.request.Request(
        f'https://api.telegram.org/bot{token}/{method}',
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        # Never log the request URL, token, chat identity or response body.
        raise RuntimeError(f'Telegram returned HTTP {error.code}') from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        raise RuntimeError('Telegram request failed; credentials were not logged') from None
    if not result.get('ok'):
        raise RuntimeError('Telegram rejected the request')
    return result['result']


def start_time(event):
    try:
        value = datetime.fromisoformat(event['start_at'].replace('Z', '+00:00'))
        return value if value.tzinfo else None
    except (KeyError, TypeError, ValueError, AttributeError):
        return None


def event_day(event):
    start = start_time(event)
    if start:
        return start.astimezone(EKB).date().isoformat()
    value = event.get('event_date') or event.get('calendar_date') or ''
    try:
        return datetime.strptime(value, '%d.%m.%Y').date().isoformat()
    except ValueError:
        try:
            return datetime.strptime(value, '%Y-%m-%d').date().isoformat()
        except ValueError:
            return ''


def event_key(event):
    # Same market in two feeds should produce one notification.
    fields = [event_day(event), event['event'].strip().casefold(), event['market'].strip().casefold()]
    return hashlib.sha256(json.dumps(fields, ensure_ascii=False).encode()).hexdigest()


def result_key(event):
    fields = [event.get('score'), event.get('winner'), event.get('forecast_result'), event.get('status')]
    return json.dumps(fields, ensure_ascii=False)


def pending_notifications(event, previous, now, first_run=False):
    """Return message kind + id; unknown dates never create start reminders."""
    start = start_time(event)
    day = event_day(event)
    today = now.astimezone(EKB).date().isoformat()
    active = event.get('status') not in ('Завершён', 'Отменён', 'Перенесён')
    upcoming = active and (start >= now if start else bool(day and day >= today))
    notices = []
    if previous is None and not first_run and upcoming:
        notices.append(('new', 'new'))
    if active and start and now <= start <= now + timedelta(hours=1):
        reminder = 'reminder:' + start.isoformat()
        if reminder not in (previous or {}).get('sent', []):
            notices.append(('reminder', reminder))
    if previous is not None and previous.get('result') != result_key(event):
        if event.get('score') or event.get('forecast_result') or event.get('status') in ('Перенесён', 'Отменён'):
            notices.append(('result', 'result:' + result_key(event)))
    return [(kind, key) for kind, key in notices if key not in (previous or {}).get('sent', [])]


def message(event, kind):
    title = {'new': 'Новое событие', 'reminder': 'Скоро начало · в течение часа', 'result': 'Обновление результата / статуса'}[kind]
    start = start_time(event)
    when = start.astimezone(EKB).strftime('%d.%m.%Y %H:%M ЕКБ') if start else (event_day(event) or 'Дата уточняется')
    lines = [title, event['event'], when, event['market']]
    odds = event.get('original_odds') or event.get('odds')
    if odds is not None:
        lines.append(f'Коэффициент из отчёта: {odds}')
    if event.get('score'):
        lines.append('Счёт: ' + str(event['score']))
    if event.get('forecast_result'):
        lines.append('Итог прогноза: ' + event['forecast_result'])
    elif kind == 'result':
        lines.append('Итог прогноза пока не рассчитан')
    lines.append('Статус: ' + event.get('status', 'Нет данных'))
    lines.append(SITE)
    # Leave room under Telegram's 4096-character limit.
    return '\n'.join(lines)[:3900]


def read_events():
    events = {}
    for feed_id in FEEDS:
        report = json.loads((ROOT / f'data/feeds/{feed_id}.json').read_text(encoding='utf-8-sig'))
        if report.get('schema_version') != 1 or not isinstance(report.get('events'), list):
            raise RuntimeError('Invalid event feed')
        for event in report['events']:
            key = event_key(event)
            old = events.get(key)
            if old is None or (event.get('checked_at') or '') > (old.get('checked_at') or ''):
                events[key] = event
    return events


def save(state):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATE.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
    temporary.replace(STATE)


def main():
    token, chat_id = os.environ.get('TELEGRAM_BOT_TOKEN'), os.environ.get('TELEGRAM_CHAT_ID')
    if not token or not chat_id:
        print('Waiting for TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID repository secrets.')
        return
    # Fail closed on corrupt state instead of replaying all messages.
    state = json.loads(STATE.read_text(encoding='utf-8')) if STATE.exists() else {'events': {}}
    events = read_events()
    scope = hashlib.sha256((token + ':' + chat_id).encode()).hexdigest()
    if state.get('scope') not in (None, scope):
        state = {'events': {}}
    first_run = not state.get('connected')
    if first_run:
        chat = api(token, 'getChat', {'chat_id': chat_id})
        if chat.get('type') != 'private' or str(chat.get('id')) != str(chat_id):
            raise RuntimeError('Configure the numeric ID of your private chat with the bot.')
        api(token, 'sendMessage', {'chat_id': chat_id, 'text': 'БК анализ: уведомления подключены. Новые события, напоминания перед началом и результаты будут приходить сюда.\n' + SITE})
        state.update(connected=True, scope=scope)
        # Baseline all existing results; do not broadcast old reports on setup.
        state['events'] = {key: {'result': result_key(e), 'sent': [], 'day': event_day(e)} for key, e in events.items()}
        save(state)
    now = datetime.now(timezone.utc)
    sent_count = 0
    for key, event in events.items():
        previous = state['events'].get(key)
        notices = pending_notifications(event, previous, now, first_run)
        record = state['events'].setdefault(key, {'sent': []})
        for kind, notice_id in notices:
            api(token, 'sendMessage', {'chat_id': chat_id, 'text': message(event, kind), 'link_preview_options': {'is_disabled': True}})
            record['sent'].append(notice_id)
            save(state)
            sent_count += 1
        record.update(result=result_key(event), day=event_day(event))
    cutoff = (now - timedelta(days=90)).date().isoformat()
    state['events'] = {key: value for key, value in state['events'].items() if not value.get('day') or value['day'] >= cutoff}
    save(state)
    print(f'Processed {len(events)} current records; sent {sent_count} notifications.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # A traceback can include request URLs containing credentials.
        print(str(error) if isinstance(error, RuntimeError) else 'Notification run failed. Check feeds and saved state.', file=sys.stderr)
        sys.exit(1)
