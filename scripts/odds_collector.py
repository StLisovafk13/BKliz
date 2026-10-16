#!/usr/bin/env python3
"""Conservative Selenium accessibility pilot for BKliz odds.

This pilot intentionally NEVER extracts or confirms a bookmaker price.
It checks that an allowed page can be rendered for a specifically named event.
It writes only observations with odds=null until a separately tested,
market-specific and time-aware extractor is implemented.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = ROOT / "data/odds/targets.json"
DEFAULT_OUTPUT = ROOT / "data/odds/latest.json"
ALLOWED_HOSTS = {
    "ligastavok.ru", "www.ligastavok.ru",
}
BLOCK_MARKERS = (
    "captcha", "капча", "access denied", "доступ запрещен",
    "доступ ограничен", "checking your browser", "verify you are human",
    "attention required", "error 403",
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat(timespec="seconds")


def parse_start(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("start_at must contain a timezone")
    return result


def valid_source(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.hostname in ALLOWED_HOSTS


def load_targets(path: Path) -> list[dict]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if document.get("schema_version") != 1 or not isinstance(document.get("targets"), list):
        raise ValueError("Invalid targets configuration")
    unique: set[str] = set()
    targets = []
    for t in document["targets"]:
        for key in ("id", "event", "start_at", "source_url", "market", "teams"):
            if key not in t:
                raise ValueError(f"Missing {key}")
        if not isinstance(t["id"], str) or not re.fullmatch(r"[a-z0-9-]+", t["id"]):
            raise ValueError("Invalid target id")
        if t["id"] in unique:
            raise ValueError("Duplicate target id")
        unique.add(t["id"])
        if not valid_source(t["source_url"]):
            raise ValueError("Unsupported source host")
        parse_start(t["start_at"])
        if not (isinstance(t["teams"], list) and len(t["teams"]) == 2
                and all(isinstance(v, str) and len(v) >= 3 for v in t["teams"])):
            raise ValueError("Two team names are required")
        targets.append(t)
    return targets


def classify_page(title: str, visible_text: str, current_url: str, teams: list[str]) -> tuple[str, str]:
    """Classify accessibility, NOT odds availability or market validity."""
    if not valid_source(current_url):
        return "redirected", "Navigation left an approved bookmaker host"
    text = (title + "\n" + visible_text).casefold()
    if any(marker in text for marker in BLOCK_MARKERS):
        return "blocked", "Possible CAPTCHA / access restriction"
    if len(visible_text.strip()) < 60:
        return "empty_page", "Insufficient rendered page content"
    if not all(team.casefold() in text for team in teams):
        return "event_not_verified", "Cannot verify both participants on rendered page"
    return "event_visible", "Both participants visible; exact market and odds NOT verified"


def probe_selenium(target: dict) -> tuple[str, str]:
    """One normal browser navigation; no login, bypassing or API interception."""
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.support.ui import WebDriverWait

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1440,900")
    options.add_argument("--lang=ru-RU")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-sandbox")  # GitHub hosted Linux runner only
    options.add_argument("--disable-notifications")
    driver = webdriver.Chrome(options=options)
    try:
        driver.set_page_load_timeout(35)
        driver.get(target["source_url"])
        WebDriverWait(driver, 20).until(
            lambda browser: browser.execute_script("return document.readyState") in ("interactive", "complete")
        )
        time.sleep(4)  # Allow ordinary client-side rendering; do not rapidly poll.
        current_url = driver.current_url
        title = driver.title or ""
        visible_text = driver.execute_script(
            "return (document.body && document.body.innerText || '').slice(0, 200000)"
        ) or ""
        return classify_page(title, visible_text, current_url, target["teams"])
    finally:
        driver.quit()


def observation(target: dict, status: str, explanation: str, checked_at: str) -> dict:
    return {
        "id": target["id"],
        "event": target["event"],
        "bookmaker": "Лига Ставок",
        "competition": target.get("competition", "Не подтверждено"),
        "expected_start_at": target["start_at"],
        "start_at_verified": False,
        "market": target["market"],
        "market_verified": False,
        "odds": None,
        "price_verified": False,
        "source_url": target["source_url"],
        "checked_at": checked_at,
        "status": status,
        "reason": explanation,
    }


def run(targets: list[dict], now: datetime, probe=probe_selenium) -> dict:
    checked_at = now.astimezone(timezone.utc).isoformat(timespec="seconds")
    results = []
    for target in targets:
        if parse_start(target["start_at"]) <= now:
            results.append(observation(target, "expired", "Scheduled match start is past; no live-price claim", checked_at))
            continue
        try:
            status, reason = probe(target)
        except Exception as exc:
            # Do not leak driver network details, credentials or page contents into a public JSON.
            status, reason = "source_error", "Could not render bookmaker page with Selenium: " + type(exc).__name__
        results.append(observation(target, status, reason, checked_at))
    return {
        "schema_version": 1,
        "collector": "BKliz Selenium pilot",
        "generated_at": checked_at,
        "status": "no_targets" if not targets else (
            "all_expired" if all(r["status"] == "expired" for r in results) else "checked"
        ),
        "note": "Accessibility pilot only. All bookmaker odds are deliberately null until a reliable market-specific extractor is tested.",
        "observations": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--targets", type=Path, default=DEFAULT_TARGETS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        data = run(load_targets(args.targets), utc_now())
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print("Configuration error: " + str(exc), file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    statuses = {item["status"] for item in data["observations"]}
    print("Odds pilot: " + data["status"] + "; result statuses: " + ",".join(sorted(statuses)) + "; confirmed prices: 0")
    if "source_error" in statuses or "blocked" in statuses:
        # Fail the job visibly, but leave JSON available for the failure artifact.
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
