#!/usr/bin/env python3
"""Conservative Selenium accessibility pilot for approved bookmaker pages.

This pilot intentionally NEVER extracts/validates bookmaker odds or markets.
The three homepage checks are one-shot; failed/blocked sources are not polled
again until explicitly rearmed in the target configuration. Screenshots stay
as GitHub Actions artifacts, never published as website content.
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
DEFAULT_DIAGNOSTICS = ROOT / "odds-diagnostics"

BOOKMAKER_DOMAINS = {
    "Лига Ставок": "ligastavok.ru",
    "PARI": "pari.ru",
    "Winline": "winline.ru",
    "BetBoom": "betboom.ru",
}
BRAND_MARKERS = {
    "Лига Ставок": ("лига ставок", "ligastavok"),
    "PARI": ("pari", "пари"),
    "Winline": ("winline", "винлайн"),
    "BetBoom": ("betboom", "бетбум"),
}
BLOCK_MARKERS = (
    "captcha", "капча", "access denied", "доступ запрещен",
    "доступ ограничен", "доступ заблокирован",
    "доступ заблокирован системой защиты", "системой защиты",
    "checking your browser", "verify you are human",
    "attention required", "error 403",
)
FAILURE_STATUSES = frozenset({
    "blocked", "redirected", "empty_page", "event_not_verified",
    "homepage_not_verified", "source_error",
})
TERMINAL_STATUSES = FAILURE_STATUSES | {"homepage_visible", "event_visible"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_start(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("start_at must contain a timezone")
    return result


def normalized_host(url: str) -> str | None:
    try:
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname:
            return None
        return parsed.hostname.lower().removeprefix("www.")
    except ValueError:
        return None


def valid_source(url: str, bookmaker: str | None = None) -> bool:
    host = normalized_host(url)
    if host is None:
        return False
    if bookmaker is not None:
        return host == BOOKMAKER_DOMAINS.get(bookmaker)
    return host in BOOKMAKER_DOMAINS.values()


def safe_landing_url(url: str, bookmaker: str | None = None) -> str:
    """Omit parameters, fragments and userinfo; never store arbitrary hosts."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        if not host:
            return "unknown"
        if not valid_source(url, bookmaker):
            return "external-domain:" + host[:100]
        return urlunparse(("https", host, parsed.path[:300], "", "", ""))
    except ValueError:
        return "unknown"


def load_targets(path: Path) -> list[dict]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if document.get("schema_version") != 1 or not isinstance(document.get("targets"), list):
        raise ValueError("Invalid targets configuration")
    unique: set[str] = set()
    result = []
    for t in document["targets"]:
        if not isinstance(t, dict):
            raise ValueError("Target must be an object")
        for key in ("id", "bookmaker", "source_url", "probe_mode", "enabled"):
            if key not in t:
                raise ValueError(f"Missing {key}")
        if not isinstance(t["id"], str) or not re.fullmatch(r"[a-z0-9-]+", t["id"]):
            raise ValueError("Invalid target ID")
        if t["id"] in unique:
            raise ValueError("Duplicate target ID")
        unique.add(t["id"])
        if t["bookmaker"] not in BOOKMAKER_DOMAINS:
            raise ValueError("Unknown bookmaker")
        if not isinstance(t["enabled"], bool):
            raise ValueError("Target enabled must be boolean")
        if not valid_source(t["source_url"], t["bookmaker"]):
            raise ValueError("Unsupported or mismatched bookmaker source URL")
        if t["probe_mode"] not in ("event", "homepage"):
            raise ValueError("Unsupported probe_mode")
        if not isinstance(t.get("revision", 1), int) or t.get("revision", 1) < 1:
            raise ValueError("revision must be a positive integer")
        if t["probe_mode"] == "event":
            for key in ("event", "start_at", "market", "teams"):
                if key not in t:
                    raise ValueError(f"Missing {key}")
            parse_start(t["start_at"])
            if not (isinstance(t["teams"], list) and len(t["teams"]) == 2
                    and all(isinstance(v, str) and len(v) >= 3 for v in t["teams"])):
                raise ValueError("Two team names are required")
            aliases = t.get("team_aliases", [[], []])
            if not (isinstance(aliases, list) and len(aliases) == 2
                    and all(isinstance(group, list) and len(group) <= 5
                            and all(isinstance(v, str) and 3 <= len(v) <= 80 for v in group)
                            for group in aliases)):
                raise ValueError("team_aliases must be two lists")
        elif t.get("one_shot") is not True:
            raise ValueError("Homepage diagnosis must be one-shot")
        result.append(t)
    return result


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
    aliases: list[list[str]] | None = None,
    bookmaker: str = "Лига Ставок",
    probe_mode: str = "event",
) -> tuple[str, str]:
    if not valid_source(current_url, bookmaker):
        return "redirected", "Browser left the expected bookmaker domain"
    combined = (title + "\n" + visible_text).casefold()
    if any(marker in combined for marker in BLOCK_MARKERS):
        return "blocked", "Bookmaker security page or access restriction detected"
    if len(visible_text.strip()) < 60:
        return "empty_page", "Insufficient visible page content"
    if probe_mode == "homepage":
        if not any(marker in combined for marker in BRAND_MARKERS[bookmaker]):
            return "homepage_not_verified", "Bookmaker homepage identity not visible"
        return "homepage_visible", "Bookmaker-branded page visible; no event, market or odds verified"
    if not all(team_presence(combined, teams, aliases)):
        return "event_not_verified", "Both participants not visible on rendered page"
    return "event_visible", "Both participants visible; event start, exact market and odds NOT verified"


def page_snapshot(driver: object, target: dict) -> tuple[str, str, str, tuple[str, str]]:
    landing_url = driver.current_url
    title = driver.title or ""
    try:
        visible = driver.execute_script(
            "return (document.body && document.body.innerText || '').slice(0, 200000)"
        ) or ""
    except Exception:
        visible = ""
    result = classify_page(
        title, visible, landing_url,
        target.get("teams", []), target.get("team_aliases"),
        bookmaker=target["bookmaker"], probe_mode=target["probe_mode"],
    )
    return landing_url, title, visible, result


def probe_selenium(target: dict, diagnostics_dir: Path = DEFAULT_DIAGNOSTICS) -> tuple[str, str, dict]:
    """Anonymous navigation only. No login, CAPTCHA bypass or API interception."""
    from selenium import webdriver
    from selenium.common.exceptions import TimeoutException
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.support.ui import WebDriverWait

    opts = Options()
    for flag in (
        "--headless=new", "--incognito", "--disable-extensions",
        "--window-size=1440,900", "--lang=ru-RU",
        "--disable-dev-shm-usage", "--no-sandbox", "--disable-notifications",
    ):
        opts.add_argument(flag)
    driver = webdriver.Chrome(options=opts)
    diagnostics = {}
    try:
        driver.set_page_load_timeout(35)
        try:
            driver.get(target["source_url"])
        except TimeoutException:
            diagnostics["navigation_timeout"] = True

        # Bounded wait for actual site identity or an access denial.
        def wait_condition(browser):
            _, _, _, (status, _) = page_snapshot(browser, target)
            return status in ("blocked", "redirected", "event_visible", "homepage_visible")

        try:
            WebDriverWait(driver, 22, poll_frequency=1.5).until(wait_condition)
        except TimeoutException:
            diagnostics["render_wait_timeout"] = True

        landing, title, visible, (status, reason) = page_snapshot(driver, target)
        diagnostics["landing_url"] = safe_landing_url(landing, target["bookmaker"])
        diagnostics["page_title"] = re.sub(r"[\r\n\t]+", " ", title)[:160]
        diagnostics["visible_characters"] = len(visible)
        if target["probe_mode"] == "event":
            diagnostics["teams_visible"] = team_presence(
                title + "\n" + visible, target["teams"], target.get("team_aliases"))
        diagnostics["screenshot_captured"] = False
        if valid_source(landing, target["bookmaker"]):
            try:
                diagnostics_dir.mkdir(parents=True, exist_ok=True)
                filename = target["id"] + ".png"
                if driver.save_screenshot(str(diagnostics_dir / filename)):
                    diagnostics["screenshot_captured"] = True
                    diagnostics["screenshot_filename"] = filename
            except Exception:
                diagnostics["screenshot_error"] = "Screenshot unavailable"
        return status, reason, diagnostics
    finally:
        driver.quit()


def observation(target: dict, status: str, reason: str, checked_at: str,
                diagnostic: dict | None = None) -> dict:
    row = {
        "id": target["id"],
        "probe_mode": target["probe_mode"],
        "revision": target.get("revision", 1),
        "event": target.get("event", f'{target["bookmaker"]} — homepage access test'),
        "bookmaker": target["bookmaker"],
        "competition": target.get("competition"),
        "expected_start_at": target.get("start_at"),
        "start_at_verified": False,
        "market": target.get("market", "Homepage access only, not a betting market"),
        "market_verified": False,
        "odds": None,
        "price_verified": False,
        "source_url": target["source_url"],
        "checked_at": checked_at,
        "status": status,
        "reason": reason,
    }
    if diagnostic is not None:
        row["diagnostic"] = diagnostic
    return row


def run(targets: list[dict], now: datetime, probe=probe_selenium,
        previous: dict | None = None) -> dict:
    checked_at = now.astimezone(timezone.utc).isoformat(timespec="seconds")
    previous_rows = {x["id"]: x for x in (previous or {}).get("observations", [])
                     if isinstance(x, dict) and isinstance(x.get("id"), str)}
    rows = []
    probed = False
    for target in targets:
        prior = previous_rows.get(target["id"])
        if not target["enabled"]:
            if (prior is not None and prior.get("status") == "paused"
                    and prior.get("source_url") == target["source_url"]
                    and prior.get("revision") == target.get("revision", 1)):
                rows.append(prior)
            else:
                rows.append(observation(
                    target, "paused",
                    "Disabled after confirmed access denial; manual review required before re-enabling",
                    checked_at,
                ))
            continue
        if target["probe_mode"] == "event" and parse_start(target["start_at"]) <= now:
            rows.append(observation(
                target, "expired", "Scheduled event already started; not a live-price check", checked_at))
            continue
        if (target.get("one_shot") is True and prior is not None
                and prior.get("status") in TERMINAL_STATUSES
                and prior.get("source_url") == target["source_url"]
                and prior.get("revision") == target.get("revision", 1)):
            # One-shot means exactly one browser contact per approved config revision.
            rows.append(prior)
            continue
        probed = True
        try:
            response = probe(target)
            if len(response) == 3:
                status, reason, diagnostic = response
            else:
                status, reason = response
                diagnostic = None
        except Exception as exc:
            status = "source_error"
            reason = "Could not render bookmaker page: " + type(exc).__name__
            diagnostic = None
        rows.append(observation(target, status, reason, checked_at, diagnostic))

    # A no-op hourly cycle must not forge a fresh bookmaker check or commit.
    old = previous or {}
    unchanged = rows == old.get("observations")
    return {
        "schema_version": 1,
        "collector": "BKliz Selenium pilot",
        "generated_at": old.get("generated_at") if unchanged and not probed else checked_at,
        "status": "no_targets" if not targets else (
            "no_new_probes" if not probed else "checked"),
        "note": "Diagnostic accessibility only. Odds=null, and no bookmaker market or event start is verified.",
        "observations": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--targets", type=Path, default=DEFAULT_TARGETS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        targets = load_targets(args.targets)
        previous = json.loads(args.output.read_text(encoding="utf-8")) if args.output.exists() else None
        data = run(targets, utc_now(), previous=previous)
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print("Collector configuration error: " + str(exc), file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    statuses = {x["status"] for x in data["observations"]}
    print("Odds pilot: " + data["status"] + "; statuses: " +
          ",".join(sorted(statuses)) + "; verified prices: 0")
    for row in data["observations"]:
        diag = row.get("diagnostic") or {}
        print(row["bookmaker"] + ": " + row["status"] +
              (" — " + str(diag.get("landing_url")) if diag else ""))
    if data["status"] == "checked" and statuses & FAILURE_STATUSES:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
