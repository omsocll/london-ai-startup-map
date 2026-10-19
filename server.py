#!/usr/bin/env python3
"""Static server plus Parallel-backed startup news endpoint."""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / "data" / "news-cache"
CACHE_TTL_SECONDS = 6 * 60 * 60
PARALLEL_URL = "https://api.parallel.ai/v1/search"
STARTUPS_FILE = ROOT / "data" / "startups.json"
# Cost guards: refresh=1 can't bypass a cache younger than this, and uncached
# Parallel calls are capped per hour so the endpoint can't burn API credits.
MIN_REFRESH_SECONDS = 15 * 60
MAX_SEARCHES_PER_HOUR = int(os.environ.get("NEWS_MAX_SEARCHES_PER_HOUR", "30"))
_search_times: list[float] = []
_search_lock = threading.Lock()
# Only these files are served as static content (no server.py, .env, .git, notes, cache).
STATIC_ALLOWLIST = {
    "/",
    "/index.html",
    "/styles.css",
    "/app.js",
    "/data/startups.json",
    "/data/investor-overlays.json",
}
BAD_SNIPPET_TERMS = (
    "obfuscated",
    "_next/image",
    "wp-content/uploads",
    "sign up",
    "you might also like",
    "view financial",
    "cookie",
    "privacy policy",
    "all locations:",
    "special flags:",
    "people background flags:",
    "achievements:",
    "company performance metrics",
    "funding rounds investors total",
    "market {",
)
NEWS_TERMS = (
    "raised",
    "raises",
    "funding",
    "series",
    "seed",
    "pre-seed",
    "investor",
    "led by",
    "participation",
    "launch",
    "announced",
    "partnership",
    "acquisition",
    "acquired",
    "revenue",
    "arr",
)


def load_env() -> None:
    for path in (ROOT / ".env",):
        if not path.exists():
            continue
        for raw_line in path.read_text().splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def cache_key(name: str, website: str | None) -> str:
    raw = f"{name}|{website or ''}".lower().encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:20]


def load_startups() -> dict[str, str | None]:
    """Map of known startup names (lower-case) to their website, from the local dataset."""
    data = json.loads(STARTUPS_FILE.read_text())
    return {s["name"].strip().lower(): s.get("website") for s in data.get("startups", []) if s.get("name")}


def allow_search() -> bool:
    now = time.time()
    with _search_lock:
        _search_times[:] = [t for t in _search_times if now - t < 3600]
        if len(_search_times) >= MAX_SEARCHES_PER_HOUR:
            return False
        _search_times.append(now)
        return True


def read_cache(name: str, website: str | None, force: bool) -> dict | None:
    path = CACHE_DIR / f"{cache_key(name, website)}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError:
        return None
    age = time.time() - data.get("fetched_at_unix", 0)
    if age > CACHE_TTL_SECONDS or (force and age > MIN_REFRESH_SECONDS):
        return None
    data["cached"] = True
    return data


def write_cache(name: str, website: str | None, data: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{cache_key(name, website)}.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def clean_excerpt(text: str) -> str:
    if not text:
        return ""

    text = re.sub(r"!\[[^\]]*]\([^)]*\)", " ", text)
    text = re.sub(r"\[[^\]]*]\([^)]*\)", lambda match: match.group(0).split("](", 1)[0].lstrip("["), text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"/_next/\S+", " ", text)
    text = re.sub(r"#+\s*", "", text)
    text = re.sub(r"\*{1,3}", "", text)
    text = re.sub(r"[_`~]", "", text)
    text = re.sub(r"[\U0001F300-\U0001FAFF\U00002700-\U000027BF]", "", text)
    text = re.sub(r"\|+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\b(obfuscated|View Financials?|Sign up and start mastering AI)\b.*", "", text, flags=re.I)

    sentences = re.split(r"(?<=[.!?])\s+", text)
    useful = []
    for sentence in sentences:
        sentence = sentence.strip(" -•")
        if len(sentence) < 35:
            continue
        lower = sentence.lower()
        if any(term in lower for term in BAD_SNIPPET_TERMS):
            continue
        useful.append(sentence)
        if len(useful) >= 3:
            break

    cleaned = " ".join(useful) if useful else text
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:520].rstrip()


def score_result(title: str, excerpt: str) -> int:
    lower = f"{title} {excerpt}".lower()
    score = 0
    score += sum(3 for term in NEWS_TERMS if term in lower)
    score -= sum(5 for term in BAD_SNIPPET_TERMS if term in lower)
    if "crunchbase" in lower or "tracxn" in lower:
        score -= 5
    if "funding" in lower or "series" in lower or "raised" in lower:
        score += 6
    return score


def normalize_results(items: list[dict]) -> list[dict]:
    cleaned = []
    seen_urls = set()
    for item in items:
        url = item.get("url")
        if url and url in seen_urls:
            continue
        if url:
            seen_urls.add(url)
        title = item.get("title") or url or "Untitled"
        excerpt = clean_excerpt(" ".join(item.get("excerpts") or []))
        if not excerpt:
            continue
        lower_blob = f"{title} {url or ''} {excerpt}".lower()
        if any(term in lower_blob for term in BAD_SNIPPET_TERMS):
            continue
        result = {
            "title": title,
            "url": url,
            "publish_date": item.get("publish_date"),
            "excerpt": excerpt,
        }
        result["_score"] = score_result(title, excerpt)
        if result["_score"] < 6:
            continue
        cleaned.append(result)

    cleaned.sort(key=lambda row: row["_score"], reverse=True)
    return [{k: v for k, v in row.items() if k != "_score"} for row in cleaned[:6]]


def sanitize_cached_data(data: dict) -> dict:
    results = data.get("results") or []
    raw_items = []
    for result in results:
        raw_items.append(
            {
                "title": result.get("title"),
                "url": result.get("url"),
                "publish_date": result.get("publish_date"),
                "excerpts": [result.get("excerpt", "")],
            }
        )
    data["results"] = normalize_results(raw_items)
    return data


def parallel_search(name: str, website: str | None) -> dict:
    load_env()
    api_key = os.environ.get("PARALLEL_API_KEY")
    if not api_key:
        raise RuntimeError("PARALLEL_API_KEY is not set")

    domain = ""
    if website:
        try:
            domain = urllib.parse.urlparse(website).netloc.replace("www.", "")
        except Exception:
            domain = ""

    queries = [
        f"{name} funding round",
        f"{name} startup news",
        f"{name} {domain} investors" if domain else f"{name} investors",
    ]
    objective = (
        f"Find recent, source-backed news about {name}, a London startup. "
        "Prioritize funding rounds, investor announcements, product launches, hiring/growth signals, "
        "partnerships, acquisitions, and major company updates. Return concise, relevant excerpts."
    )

    payload = {
        "objective": objective,
        "search_queries": queries,
        "mode": "advanced",
        "max_chars_total": 12000,
        "advanced_settings": {
            "source_policy": {
                "after_date": "2024-01-01",
            }
        },
    }
    req = urllib.request.Request(
        PARALLEL_URL,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            search = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Parallel API error {exc.code}") from exc

    results = normalize_results(search.get("results", []))

    data = {
        "name": name,
        "website": website,
        "fetched_at_unix": int(time.time()),
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cached": False,
        "queries": queries,
        "results": results,
        "usage": search.get("usage"),
        "session_id": search.get("session_id"),
    }
    write_cache(name, website, data)
    return data


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, code: int, data: dict) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/startup-news":
            if urllib.parse.unquote(parsed.path) not in STATIC_ALLOWLIST:
                self.send_error(404)
                return
            return super().do_GET()

        params = urllib.parse.parse_qs(parsed.query)
        name = (params.get("name") or [""])[0].strip()[:120]
        force = (params.get("refresh") or [""])[0] == "1"
        if not name:
            self.send_json(400, {"error": "name is required"})
            return

        # Only look up companies that are in the dataset, using the dataset's website,
        # so the endpoint can't be used as a general-purpose paid search proxy.
        startups = load_startups()
        key = name.lower()
        if key not in startups:
            self.send_json(404, {"error": "Unknown startup"})
            return
        website = startups[key]

        try:
            cached = read_cache(name, website, force)
            if cached:
                data = sanitize_cached_data(cached)
            elif not allow_search():
                self.send_json(429, {"error": "News lookup limit reached. Try again later."})
                return
            else:
                data = parallel_search(name, website)
            self.send_json(200, data)
        except Exception as exc:
            self.log_error("news lookup failed: %s", exc)
            self.send_json(500, {"error": "Could not load startup news.", "name": name})

    def do_HEAD(self) -> None:
        if urllib.parse.urlparse(self.path).path not in STATIC_ALLOWLIST:
            self.send_error(404)
            return
        super().do_HEAD()


def main() -> None:
    port = int(os.environ.get("PORT", "8123"))
    # Local-only by default. Set HOST=0.0.0.0 to expose it on your network (not recommended).
    host = os.environ.get("HOST", "127.0.0.1")
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Serving London AI map with news API at http://localhost:{port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()
