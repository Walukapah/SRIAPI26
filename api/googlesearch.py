#!/usr/bin/env python3
"""
DuckDuckGo HTML Search Scraper - JSON Output
Usage: python app.py <search_query>
Example: python app.py "python tutorial"
"""

import sys
import re
import json
import urllib.request
import urllib.parse
import html


def search_duckduckgo(query):
    """Search DuckDuckGo HTML version and return parsed results."""

    # Encode the query for URL
    encoded_query = urllib.parse.quote_plus(query)
    url = f"https://html.duckduckgo.com/html/?q={encoded_query}"

    # Set headers to mimic a browser
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
    }

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as response:
            html_content = response.read().decode('utf-8', errors='replace')
    except Exception as e:
        return {
            "success": False,
            "error": f"Error fetching results: {str(e)}",
            "query": query,
            "results": [],
            "total_results": 0
        }

    results = []

    # Parse results from the HTML using regex patterns
    result_pattern = r'<div class="result results_links results_links_deep web-result ">(.*?)</div>\s*</div>\s*</div>'
    result_blocks = re.findall(result_pattern, html_content, re.DOTALL)

    for block in result_blocks:
        result = {}

        # Extract title
        title_match = re.search(r'<h2 class="result__title">.*?<a[^>]*class="result__a"[^>]*href="([^"]*)">(.*?)</a>', block, re.DOTALL)
        if title_match:
            raw_url = title_match.group(1)
            # DuckDuckGo redirects through their own URL, extract the actual URL
            actual_url_match = re.search(r'uddg=([^&]+)', raw_url)
            if actual_url_match:
                result['url'] = urllib.parse.unquote(actual_url_match.group(1))
            else:
                result['url'] = raw_url

            title = re.sub(r'<[^>]+>', '', title_match.group(2))
            result['title'] = html.unescape(title.strip())

        # Extract snippet/description
        snippet_match = re.search(r'<a class="result__snippet"[^>]*href="[^"]*">(.*?)</a>', block, re.DOTALL)
        if snippet_match:
            snippet = re.sub(r'<[^>]+>', '', snippet_match.group(1))
            result['snippet'] = html.unescape(snippet.strip())
        else:
            result['snippet'] = ''

        # Extract display URL
        display_url_match = re.search(r'<a class="result__url"[^>]*>(.*?)</a>', block, re.DOTALL)
        if display_url_match:
            display_url = re.sub(r'<[^>]+>', '', display_url_match.group(1))
            result['display_url'] = html.unescape(display_url.strip())
        else:
            result['display_url'] = ''

        if result.get('title') and result.get('url'):
            results.append(result)

    return {
        "success": True,
        "query": query,
        "total_results": len(results),
        "results": results
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: python app.py <search_query>",
            "query": "",
            "results": [],
            "total_results": 0
        }, indent=2, ensure_ascii=False))
        sys.exit(1)

    # Join all arguments as the search query
    query = ' '.join(sys.argv[1:])

    response = search_duckduckgo(query)
    print(json.dumps(response, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
