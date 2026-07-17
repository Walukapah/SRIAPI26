#!/usr/bin/env python3
"""
yandex_image_scraper.py

Yandex Images (yandex.com/images/search) සර්ච් කරලා
image links (origUrl / thumbnail) extract කරලා JSON විදියට print/save කරන script එකක්.

භාවිතය:
  # Search text එකෙන් කෙලින්ම
  python yandex_image_scraper.py minecraft

  # එකට වඩා word
  python yandex_image_scraper.py "cute cats"

  # URL එකකින්
  python yandex_image_scraper.py --url "https://yandex.com/images/search?text=coc"

  # HTML file එකකින්
  python yandex_image_scraper.py --file page.html

  # JSON file එකකට save කරන්න
  python yandex_image_scraper.py minecraft --out result.json
"""

import argparse
import html
import json
import re
import sys
import urllib.parse


# Yandex, image data serp item එක ඇතුලේ HTML-escaped JSON විදියට
# "origUrl":"https://..."  සහ  "url":"https://..."  (thumbnail) ලෙස embed කරලා තියෙනවා.
ORIG_URL_RE = re.compile(r'&quot;origUrl&quot;:&quot;(.*?)&quot;')
WIDTH_RE = re.compile(r'&quot;origWidth&quot;:(\d+)')
HEIGHT_RE = re.compile(r'&quot;origHeight&quot;:(\d+)')


def unescape(u: str) -> str:
    # &quot; -> " , \/ -> / වගේ escape ටික clean කරනවා
    return html.unescape(u).replace("\\/", "/")


def extract_images(html_text: str):
    orig_urls = [unescape(m) for m in ORIG_URL_RE.findall(html_text)]

    # width/height හම්බුනොත් origUrl ගානට map කරගන්නවා (best-effort, order-based)
    widths = WIDTH_RE.findall(html_text)
    heights = HEIGHT_RE.findall(html_text)

    results = []
    seen = set()
    for i, url in enumerate(orig_urls):
        if url in seen:
            continue
        seen.add(url)
        item = {"image_url": url}
        if i < len(widths):
            item["width"] = int(widths[i])
        if i < len(heights):
            item["height"] = int(heights[i])
        results.append(item)

    return results


def build_yandex_url(search_text: str) -> str:
    """Search text එක Yandex Images URL එකක් විදියට convert කරනවා."""
    encoded = urllib.parse.quote(search_text)
    return f"https://yandex.com/images/search?text={encoded}"


def fetch_html_from_url(url: str) -> str:
    try:
        import requests
    except ImportError:
        sys.exit(
            "requests library එක install වෙලා නෑ. 'pip install requests' කරලා try කරන්න."
        )

    headers = {
        # Yandex bot detection එකට හසු නොවෙන්න browser User-Agent එකක් යවනවා
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }
    resp = requests.get(url, headers=headers, timeout=20)
    resp.raise_for_status()
    return resp.text


def main():
    parser = argparse.ArgumentParser(
        description="Yandex Images link extractor -> JSON",
        usage="%(prog)s [SEARCH_TEXT] [options]\n\nExamples:\n  %(prog)s minecraft\n  %(prog)s \"cute cats\"\n  %(prog)s --url \"https://yandex.com/images/search?text=coc\"\n  %(prog)s --file page.html --out result.json"
    )
    
    # Positional argument: search text (optional)
    parser.add_argument("search", nargs="?", help="Search text (e.g. minecraft, 'cute cats')")
    
    # Optional arguments
    parser.add_argument("--url", help="Yandex Images search URL (e.g. https://yandex.com/images/search?text=coc)")
    parser.add_argument("--file", help="Local HTML file path (Yandex Images search page saved as .html)")
    parser.add_argument("--out", help="Output JSON file path (default: prints to stdout)")

    args = parser.parse_args()

    # Determine source
    if args.url:
        html_text = fetch_html_from_url(args.url)
        search_query = "URL"
    elif args.file:
        with open(args.file, "r", encoding="utf-8", errors="ignore") as f:
            html_text = f.read()
        search_query = "FILE"
    elif args.search:
        url = build_yandex_url(args.search)
        # print(f"Searching Yandex Images for: {args.search}")
        # print(f"URL: {url}")
        html_text = fetch_html_from_url(url)
        search_query = args.search
    else:
        parser.print_help()
        sys.exit(1)

    images = extract_images(html_text)

    output = {
        "search": search_query,
        "count": len(images),
        "images": images,
    }

    json_str = json.dumps(output, indent=2, ensure_ascii=False)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(json_str)
        print(f"\n{len(images)} image links found. Saved to {args.out}")
    else:
        print(json_str)


if __name__ == "__main__":
    main()
