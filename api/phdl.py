#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
PornHub Video Info & M3U8 Extractor
Usage: python app.py <video_url>
"""

import sys
import json
import re
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from bs4 import BeautifulSoup

# ─── Config ───────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml"
}

MOBILE_UA = (
    "Mozilla/5.0 (Linux; Android 11; Redmi Note 8) "
    "AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"
)

RETRY_DELAY = 2
CONCURRENT_REQUESTS = 3
DOWNLOAD_BASE_URL = "https://sriconvert.onrender.com/video?url="

# ─── Helper Functions ─────────────────────────────────────────────────

def fetch_page(url, use_mobile=False):
    """Fetch page HTML with proper headers"""
    ua = MOBILE_UA if use_mobile else HEADERS["User-Agent"]
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": ua,
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml"
        }
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="ignore")

def extract_json_ld(html):
    """Extract JSON-LD data from HTML"""
    scripts = re.findall(
        r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
        html,
        re.DOTALL | re.IGNORECASE
    )
    for script in scripts:
        try:
            return json.loads(script.strip())
        except:
            pass
    return {}

def convert_duration(value):
    """Convert ISO 8601 duration to readable format"""
    if not value:
        return None
    if re.match(r"^\d+:\d+$", value):
        return value
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value)
    if match:
        h = int(match.group(1) or 0)
        m = int(match.group(2) or 0)
        s = int(match.group(3) or 0)
        if h:
            return f"{h}:{m:02d}:{s:02d}"
        else:
            return f"{m}:{s:02d}"
    return value

def extract_media_definitions(script):
    """Extract mediaDefinitions array from script"""
    pos = script.find("mediaDefinitions")
    if pos == -1:
        return None
    start = script.find("[", pos)
    if start == -1:
        return None
    depth = 0
    end = start
    for i in range(start, len(script)):
        if script[i] == "[":
            depth += 1
        elif script[i] == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    raw = script[start:end]
    try:
        raw = raw.replace("\\/", "/")
        return json.loads(raw)
    except:
        return None

def find_hls(html):
    """Find HLS/m3u8 URLs from page scripts"""
    scripts = re.findall(r"<script[^>]*>(.*?)</script>", html, re.DOTALL | re.IGNORECASE)
    output = {}
    for script in scripts:
        if "mediaDefinitions" not in script:
            continue
        media = extract_media_definitions(script)
        if not media:
            continue
        for item in media:
            url = item.get("videoUrl")
            quality = item.get("quality")
            fmt = item.get("format")
            if not url:
                continue

            # Accept any valid HTTPS URL (phncdn.com, pornhub.com, etc.)
            if not url.startswith("https://im-h.phncdn.com"):
                continue
            if fmt != "hls":
                continue
            if not quality:
                continue

            # Quality අනුපිලිවෙලට sort කිරීම සඳහා integer එකක් ලෙස ගබඩා කරමු
            output[int(quality)] = {
                "quality": f"{quality}p",
                "format": "hls",
                "url": url
            }

    # Quality අනුපිලිවෙලට (ඉහළ සිට පහළට) sort කරමු
    sorted_output = {}
    for q in sorted(output.keys(), reverse=True):
        sorted_output[f"{q}p"] = output[q]

    return sorted_output if sorted_output else None

def parse_duration(value):
    """Parse duration from various formats"""
    if not value:
        return None
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value)
    if not m:
        return value
    h = int(m.group(1) or 0)
    mn = int(m.group(2) or 0)
    s = int(m.group(3) or 0)
    if h:
        return f"{h}:{mn:02d}:{s:02d}"
    return f"{mn}:{s:02d}"

# ─── Main Extraction Functions ────────────────────────────────────────

def get_video_metadata(html):
    """Extract video metadata from HTML using JSON-LD and BeautifulSoup"""
    soup = BeautifulSoup(html, "html.parser")
    data = extract_json_ld(html)

    info = {
        "title": None,
        "description": None,
        "duration": None,
        "upload_date": None,
        "thumbnail": None,
        "author": None,
        "views": None,
        "likes": None,
        "pornstars": [],
        "tags": []
    }

    # JSON-LD data
    if data:
        info["title"] = data.get("name")
        info["description"] = data.get("description")
        info["duration"] = convert_duration(data.get("duration"))
        info["upload_date"] = data.get("uploadDate")
        info["thumbnail"] = data.get("thumbnailUrl")

        author = data.get("author")
        if isinstance(author, dict):
            info["author"] = author.get("name")
        else:
            info["author"] = author

        stats = data.get("interactionStatistic", [])
        for item in stats:
            action = item.get("interactionType", "")
            count = item.get("userInteractionCount")
            if "WatchAction" in action:
                info["views"] = count
            if "LikeAction" in action:
                info["likes"] = count

    # Duration HTML fallback
    if not info["duration"]:
        duration = soup.select_one(".duration")
        if duration:
            info["duration"] = duration.get_text(strip=True)

    # Pornstars
    for star in soup.select(".pornstarsWrapper a"):
        name = star.get_text(" ", strip=True)
        href = star.get("href")
        img = star.find("img")
        image = None
        if img:
            image = img.get("src") or img.get("data-src")
        if name:
            info["pornstars"].append({
                "name": name,
                "url": "https://www.pornhub.com" + href if href and href.startswith("/") else href,
                "image": image
            })

    # Tags
    for tag in soup.select(".tagsWrapper a, .tags a"):
        t = tag.get_text(" ", strip=True)
        if t and t not in info["tags"]:
            info["tags"].append(t)

    return info

def single_request(url):
    """Single request attempt for HLS extraction"""
    try:
        html = fetch_page(url, use_mobile=True)
        hls = find_hls(html)
        if hls:
            meta = extract_json_ld(html)
            return {
                "success": True,
                "hls": hls,
                "meta": meta
            }
    except Exception as e:
        pass
    return {"success": False}

def extract_hls_with_retry(url):
    """Extract HLS URLs with retry logic and concurrent requests"""
    count = 0
    while True:
        count += 1
        results = []
        with ThreadPoolExecutor(max_workers=CONCURRENT_REQUESTS) as executor:
            futures = [executor.submit(single_request, url) for _ in range(CONCURRENT_REQUESTS)]
            for future in as_completed(futures):
                results.append(future.result())

        for result in results:
            if result.get("success"):
                return {
                    "request_count": count,
                    "hls": result["hls"],
                    "meta": result["meta"]
                }

        time.sleep(RETRY_DELAY)

def build_download_urls(m3u8_data):
    """Build download URLs for each quality"""
    download_urls = {}
    for quality, data in m3u8_data.items():
        m3u8_url = data.get("url", "")
        if m3u8_url:
            download_urls[quality] = f"{DOWNLOAD_BASE_URL}{urllib.parse.quote(m3u8_url, safe='')}&format=mp4"
    return download_urls

# ─── Main Function ────────────────────────────────────────────────────

def get_video_info(url):
    """Get complete video info including metadata and HLS URLs"""

    # Fetch page with desktop headers for metadata
    html = fetch_page(url, use_mobile=False)

    # Get metadata
    metadata = get_video_metadata(html)

    # Get HLS URLs with retry
    hls_result = extract_hls_with_retry(url)

    # Build download URLs
    m3u8_data = hls_result.get("hls", {})
    download_urls = build_download_urls(m3u8_data)

    # Build final result
    result = {
        "url": url,
        "status": 200,
        "title": metadata.get("title"),
        "description": metadata.get("description"),
        "duration": metadata.get("duration"),
        "upload_date": metadata.get("upload_date"),
        "thumbnail": metadata.get("thumbnail"),
        "author": metadata.get("author"),
        "views": metadata.get("views"),
        "likes": metadata.get("likes"),
        "pornstars": metadata.get("pornstars", []),
        "tags": metadata.get("tags", []),
        "m3u8": m3u8_data,
        "download": download_urls,
        "request_count": hls_result.get("request_count", 0)
    }

    return result

# ─── Entry Point ──────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python app.py <video_url>")
        sys.exit(1)

    try:
        result = get_video_info(sys.argv[1])
        print(json.dumps(result, indent=4, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=4))
