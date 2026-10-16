#!/usr/bin/env python3
"""Selenium diagnostic pilot for a named Liga Stavok event.

Observations are NOT verified odds. No market-specific extractor is present:
every row keeps odds=null, market_verified=false and price_verified=false.
Browser is anonymous: no login, anti-bot bypass, network API interception or
profile import. Screenshot artifacts can contain public page contents only.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse, urlunparse

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = ROOT / "data/odds/targets.json"
DEFAULT_OUTPUT = ROOT / "data/odds/latest.json"
DEFAULT_DIAGNOSTICS = ROOT / ".odds-diagnostics"
ALLOWED_HOSTS = frozenset({"ligastavok.ru", "www.ligastavok.ru"})
BLOCK_MARKERS = (
    "captcha", "капча", "access denied", "доступ запрещен",
    "доступ ограничен", "checking your browser", "verify you are human",
    "attention required", "error 403",
)
BAD_RESULTS = {"blocked", "redirected", "empty_page", "event_not_verified", "source_error"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_start(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("start_at must contain a timezone")
    return result


def valid_source(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.hostname in ALLOWED_HOSTS


def safe_landing_url(url: str) -> str:
    """Keep a useful URL without sharing query strings, fragments or credentials."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ""
        if not host:
            return "unknown"
        if not valid_source(url):
            return "external-domain:" + host[:100]
        return urlunparse(("https", host, parsed.path[:300], "", "", ""))
    except ValueError:
        return "unknown"


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
        aliases = t.get("team_aliases", [[], []])
        if not (isinstance(aliases, list) and len(aliases) == 2
                and all(isinstance(group, list) and len(group) <= 5
                        and all(isinstance(v, str) and 3 <= len(v) <= 80 for v in group)
                        for group in aliases)):
            raise ValueError("team_aliases must be two groups of up to five names")
        targets.append(t)
    return targets


def team_presence(text: str, teams: list[str], aliases: list[list[str]] | None = None) -> list[bool]:
    folded = text.casefold()
    groups = aliases or [[], []]
    return [any(name.casefold() in folded for name in [team] + groups[i])
            for i, team in enumerate(teams)]


def classify_page(
    title: str,
    visible_text: str,
    current_url: str,
    teams: list[str],
    team_aliases: list[list[str]] | None = None,
) -> tuple[str, str]:
    """Classify accessibility, never odds availability or market validity."""
    if not valid_source(current_url):
        return "redirected", "Browser navigated away from an approved bookmaker host"
    text = title + "\n" + visible_text
    if any(marker in text.casefold() for marker in BLOCK_MARKERS):
        return "blocked", "Possible CAPTCHA or access restriction"
    if len(visible_text.strip()) < 60:
        return "empty_page", "Not enough visible page content"
    if not all(team_presence(text, teams, team_aliases)):
        return "event_not_verified", "Both participant names not found in rendered page"
    return "event_visible", "Both participants appear on page; event time, exact market and odds NOT verified"


def page_snapshot(driver: object, target: dict) -> tuple[str, str, str, str]:
    current_url = driver.current_url
    title = driver.title or ""
    try:
        visible_text = driver.execute_script(
            "return (document.body && document.body.innerText || '').slice(0, 200000)"
        ) or ""
    except Exception:
        visible_text = ""
    return current_url, title, visible_text, classify_page(
        title, visible_text, current_url, target["teams"], target.get("team_aliases")
    )


def probe_selenium(target: dict, diagnostics_dir: Path = DEFAULT_DIAGNOSTICS) -> tuple[str, str, dict]:
    """One normal Chrome navigation and bounded wait for visibly rendered teams."""
    from selenium import webdriver
    from selenium.common.exceptions import TimeoutException
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.support.ui import WebDriverWait

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--incognito")
    options.add_argument("--disable-extensions")
    options.add_argument("--window-size=1440,900")
    options.add_argument("--lang=ru-RU")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--no-sandbox")  # Dedicated ephemeral GitHub Actions runner
    options.add_argument("--disable-notifications")
    driver = webdriver.Chrome(options=options)
    diagnostics: dict = {}
    try:
        driver.set_page_load_timeout(35)
        try:
            driver.get(target["source_url"])
        except TimeoutException:
            # Inspect whatever the browser rendered; never fake an accessible market.
            diagnostics["navigation_timeout"] = True

        # Wait for relevant page content, rather than sleeping for four seconds.
        # The browser never fills a betting slip, logs in or clicks consent banners.
        def meaningful_page(browser):
            url, title, body, classification = page_snapshot(browser, target)
            return classification[0] in ("blocked", "redirected", "event_visible")

        try:
            WebDriverWait(driver, 22, poll_frequency=1.5).until(meaningful_page)
        except TimeoutException:
            diagnostics["render_wait_timeout"] = True

        landing, title, text, (status, reason) = page_snapshot(driver, target)
        diagnostics["landing_url"] = safe_landing_url(landing)
        diagnostics["page_title"] = re.sub(r"[\r\n\t]+", " ", title)[:160]
        diagnostics["visible_characters"] = len(text)
        diagnostics["teams_visible"] = team_presence(
            title + "\n" + text, target["teams"], target.get("team_aliases")
        )
        diagnostics["screenshot_captured"] = False
        # Screenshot only an anonymous approved bookmaker page, never redirects
        # to unrelated domains. Artifacts are NOT committed to the repository.
        if valid_source(landing):
            try:
                diagnostics_dir.mkdir(parents=True, exist_ok=True)
                filename = target["id"] + ".png"
                if driver.save_screenshot(str(diagnostics_dir / filename)):
                    diagnostics["screenshot_captured"] = True
                    diagnostics["screenshot_filename"] = filename
            except (OSError, Exception):
                diagnostics["screenshot_error"] = "Screenshot unavailable"
        return status, reason, diagnostics
    finally:
        driver.quit()


def observation(target: dict, status: str, explanation: str, checked_at: str, diagnostic: dict | None = None) -> dict:
    result = {
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
    if diagnostic is not None:
        result["diagnostic"] = diagnostic
    return result


def run(targets: list[dict], now: datetime, probe=probe_selenium) -> dict:
    checked_at = now.astimezone(timezone.utc).isoformat(timespec="seconds")
    results = []
    for target in targets:
        if parse_start(target["start_at"]) <= now:
            results.append(observation(target, "expired", "Scheduled match start is past; no live-price claim", checked_at))
            continue
        try:
            response = probe(target)
            if len(response) == 3:
                status, reason, diagnostic = response
            else:
                status, reason = response
                diagnostic = None
        except Exception as exc:
            # Do not leak URL query strings, cookies, page text or private user data.
            status, reason, diagnostic = "source_error", (
                "Selenium could not render bookmaker page: " + type(exc).__name__
            ), None
        results.append(observation(target, status, reason, checked_at, diagnostic))
    return {
        "schema_version": 1,
        "collector": "BKliz Selenium pilot",
        "generated_at": checked_at,
        "status": "no_targets" if not targets else (
            "all_expired" if all(r["status"] == "expired" for r in results) else "checked"
        ),
        "note": "Diagnostic accessibility pilot only; odds are always null, and no exact market or event time is verified.",
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
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    statuses = {item["status"] for item in data["observations"]}
    print("Odds pilot: " + data["status"] + "; statuses: " + ",".join(sorted(statuses)) + "; confirmed prices: 0")
    for result in data["observations"]:
        diag = result.get("diagnostic") or {}
        if diag:
            print("Source diagnostic:", json.dumps({
                "status": result["status"],
                "landing_url": diag.get("landing_url"),
                "page_title": diag.get("page_title"),
                "visible_characters": diag.get("visible_characters"),
                "teams_visible": diag.get("teams_visible"),
                "screenshot_captured": diag.get("screenshot_captured"),
            }, ensure_ascii=False))
    if statuses & BAD_RESULTS:
        # Event missing/blocked now makes the pilot fail visibly AFTER uploading JSON.
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
