"""Validate snapshots and generate the archive index before publication."""
import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUSES = {'Ожидается', 'Идёт', 'Завершён', 'Перенесён', 'Отменён', 'Нет данных'}

def timestamp(value):
    assert isinstance(value, str)
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    assert parsed.tzinfo is not None, 'Timezone is required'
    return parsed

def validate(path):
    report = json.loads(path.read_text(encoding='utf-8-sig'))
    assert report['schema_version'] == 1
    assert isinstance(report['title'], str) and isinstance(report['summary'], str)
    assert isinstance(report['events'], list)
    if report['generated_at'] is None:
        assert path.name == 'latest.json' and not report['events'] and report['run_id'] is None
    else:
        timestamp(report['generated_at'])
        assert re.fullmatch(r'[a-z0-9-]+', report['run_id'])
    ids = set()
    for event in report['events']:
        assert isinstance(event['id'], str) and event['id'] and event['id'] not in ids
        ids.add(event['id'])
        for key in ['event', 'sport', 'competition', 'market', 'analysis']:
            assert isinstance(event[key], str) and event[key].strip(), key
        assert event['status'] in STATUSES
        timestamp(event['checked_at'])
        if event['start_at'] is not None:
            timestamp(event['start_at'])
        odds = event['odds']
        assert odds is None or (type(odds) in (int, float) and 1 < odds < 100000)
        for key in ['source_name', 'source_url']:
            assert event[key] is None or isinstance(event[key], str)
        url = event['source_url']
        if url is not None:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            assert parsed.scheme in ('https', 'http') and parsed.hostname
        if odds is not None:
            assert url and event['source_name'], 'Quoted odds require a source'
    return report

if __name__ == '__main__':
    latest = validate(ROOT / 'data/latest.json')
    reports = []
    for path in sorted((ROOT / 'data/reports').glob('*.json')):
        assert re.fullmatch(r'\d{8}T\d{6}Z-[a-z0-9-]+\.json', path.name)
        report = validate(path)
        reports.append({'file': path.name, 'generated_at': report['generated_at'], 'title': report['title']})
    reports.sort(key=lambda r: timestamp(r['generated_at']), reverse=True)
    (ROOT / 'data/index.json').write_text(json.dumps({'reports': reports}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Validated {len(latest["events"])} current events and {len(reports)} archived reports.')
