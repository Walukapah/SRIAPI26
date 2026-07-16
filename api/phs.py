import sys
import json
import requests
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"


def ph_search(query, limit=30):
    url = f"https://www.pornhub.com/video/search?search={requests.utils.quote(query)}"

    headers = {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9"
    }

    r = requests.get(url, headers=headers, timeout=12)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")
    results = []

    for item in soup.select("li[data-video-vkey]"):
        if len(results) >= limit:
            break

        anchor = item.select_one("a.imageLink")
        img = item.select_one("img.videoThumb")
        title_tag = item.select_one(".title a")
        duration_tag = item.select_one(".duration")
        channel_tag = item.select_one("a.uploaderLink")
        views_tag = item.select_one(".videoViews")

        if not anchor or not title_tag:
            continue

        href = anchor.get("href", "")
        if href.startswith("/"):
            href = "https://www.pornhub.com" + href

        views_text = ""
        if views_tag:
            views_text = views_tag.get_text(strip=True).replace("view-on", "").replace("view", "").strip()

        channel_name = ""
        if channel_tag:
            channel_name = channel_tag.get_text(strip=True)

        results.append({
            "title": title_tag.get_text(strip=True),
            "url": href,
            "thumb": img.get("src", "") if img else "",
            "preview": anchor.get("data-webm", ""),
            "channel": channel_name,
            "views": views_text,
            "duration": duration_tag.get_text(strip=True) if duration_tag else "",
            "vkey": item.get("data-video-vkey", "")
        })

    return results


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python phs.py <search> [limit]"}, indent=2))
        sys.exit(1)

    query = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 30

    try:
        results = ph_search(query, limit)

        if not results:
            print(json.dumps({"status": True, "query": query, "count": 0, "results": []}, indent=2))
            sys.exit(0)

        output = {
            "status": True,
            "query": query,
            "count": len(results),
            "results": results
        }

        print(json.dumps(output, indent=2, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"status": False, "error": str(e)}, indent=2))
