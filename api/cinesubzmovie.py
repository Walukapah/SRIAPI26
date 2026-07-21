#!/usr/bin/env python3
"""
CineSubz.lk Complete Movie Info Extractor (JSON Response Mode)
Extracts ALL movie details + video URLs + MB/GB sizes + cast pics + thumbnails + views + language
Returns JSON response only (no file saving)
Video URLs merged into downloads array with sizes from page download links

Usage:
    python app.py <movie_url>

Example:
    python app.py https://cinesubz.lk/movies/avatar-fire-and-ash-2025-sinhala-subtitles/
"""

import sys
import re
import json
import urllib.request
from urllib.parse import urlparse, urlencode


def fetch_html(url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        return None


def extract_title(html):
    match = re.search(r'<title>([^<]+)</title>', html)
    if match:
        title = match.group(1).strip()
        title = re.sub(r'\s*\|\s*CineSubz[^|]*$', '', title, flags=re.I)
        title = re.sub(r'\s*\|\s*සිංහල[^|]*$', '', title, flags=re.I)
        return title
    match = re.search(r'<h3>([^<]+)</h3>', html)
    if match:
        return match.group(1).strip()
    return None


def extract_poster(html, base_url):
    match = re.search(r'<img[^>]*class=["\']poster-img["\'][^>]*src=["\']([^"\']+)["\']', html)
    if match:
        return match.group(1)
    match = re.search(r'<meta property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']', html)
    if match:
        return match.group(1)
    match = re.search(r'src=["\'](https?://[^"\']*\.(?:jpg|jpeg|png|webp))["\']', html)
    if match:
        return match.group(1)
    return None


def extract_year(html):
    match = re.search(r'<strong>Year:</strong>\s*<a[^>]*>(\d{4})</a>', html)
    if match:
        return match.group(1)
    match = re.search(r'\((\d{4})\)', html)
    if match:
        return match.group(1)
    return None


def extract_duration(html):
    match = re.search(r'<span[^>]*class=["\']data-views["\'][^>]*>(\d+)\s*min</span>', html)
    if match:
        return match.group(1) + " min"
    match = re.search(r'(\d+)\s*min', html)
    if match:
        return match.group(1) + " min"
    return None


def extract_imdb_rating(html):
    match = re.search(r'IMDb:\s*([\d.]+)', html)
    if match:
        return match.group(1)
    match = re.search(r'itemprop=["\']ratingValue["\'][^>]*>([\d.]+)', html)
    if match:
        return match.group(1)
    return None


def extract_imdb_votes(html):
    match = re.search(r'IMDb:[\s\d.]*<span[^>]*class=["\']data-imdb-votes["\'][^>]*>\(([^)]+)\)</span>', html)
    if match:
        return match.group(1).strip()
    match = re.search(r'IMDb:[\s\d.]*\(([^)]+)\)', html)
    if match:
        return match.group(1).strip()
    match = re.search(r'ratingCount["\'][^>]*content=["\'](\d+)["\']', html)
    if match:
        return match.group(1)
    return None


def extract_quality(html):
    match = re.search(r'<span[^>]*class=["\']data-quality["\'][^>]*>([^<]+)</span>', html)
    if match:
        return match.group(1).strip()
    return None


def extract_genres(html):
    genres = []
    section = re.search(r'<div[^>]*class=["\']details-genre["\'][^>]*>(.*?)</div>', html, re.DOTALL)
    if section:
        matches = re.findall(r'<a[^>]*href=["\'][^"\']*genre/[^"\']*["\'][^>]*>([^<]+)</a>', section.group(1))
        for g in matches:
            g = g.strip()
            if g and g not in genres:
                genres.append(g)
    return genres


def extract_director(html):
    match = re.search(r'<strong>Director:</strong>(.*?)</p>', html, re.DOTALL)
    if match:
        directors = re.findall(r'<a[^>]*>([^<]+)</a>', match.group(1))
        return [d.strip() for d in directors if d.strip()]
    return []


def extract_country(html):
    match = re.search(r'<strong>Country:</strong>\s*<a[^>]*>([^<]+)</a>', html)
    if match:
        return match.group(1).strip()
    match = re.search(r'<strong>Country:</strong>\s*<span>([^<]+)</span>', html)
    if match:
        return match.group(1).strip()
    return None


def extract_description(html):
    match = re.search(r'<div[^>]*class=["\']details-desc["\'][^>]*>(.*?)</div>', html, re.DOTALL)
    if match:
        desc_html = match.group(1)
        desc_html = re.sub(r'<script[^>]*>.*?</script>', '', desc_html, flags=re.DOTALL)
        desc_html = re.sub(r'<style[^>]*>.*?</style>', '', desc_html, flags=re.DOTALL)
        desc_html = re.sub(r'<div[^>]*class=["\']containername["\'][^>]*>.*?</div>\s*</div>', '', desc_html, flags=re.DOTALL)
        desc = re.sub(r'<[^>]+>', '', desc_html)
        desc = re.sub(r'&nbsp;', ' ', desc)
        desc = re.sub(r'&amp;', '&', desc)
        desc = re.sub(r'\s+', ' ', desc).strip()
        return desc
    match = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']', html)
    if match:
        return match.group(1).strip()
    return None



def extract_cast(html):
    cast = []
    section = re.search(r'<div[^>]*class=["\']zt-cast-section["\'][^>]*>(.*?)</div>\s*</div>\s*</div>', html, re.DOTALL)
    if not section:
        section = re.search(r'<div[^>]*class=["\']zt-cast-section["\'][^>]*>(.*?)</div>', html, re.DOTALL)
    if section:
        cards = re.findall(
            r'<div[^>]*class=["\']zt-cast-card["\'][^>]*>.*?'
            r'<a href=["\']([^"\']+)["\'][^>]*title=["\']([^"\']+)["\'][^>]*>.*?'
            r'<img src=["\']([^"\']+)["\'][^>]*alt=["\']([^"\']+)["\'][^>]*>.*?'
            r'<span[^>]*class=["\']zt-cast-name["\'][^>]*>([^<]+)</span>.*?'
            r'<span[^>]*class=["\']zt-cast-role["\'][^>]*>([^<]+)</span>',
            section.group(1), re.DOTALL
        )
        for card in cards:
            link, title, img_url, alt_name, name, role = card
            cast.append({
                'name': name.strip(),
                'role': role.strip(),
                'profile_url': link.strip(),
                'image_url': img_url.strip()
            })
    return cast


def extract_subtitle_by(html):
    match = re.search(r'<strong>Subtitle By:</strong>\s*<a[^>]*>([^<]+)</a>', html)
    if match:
        return match.group(1).strip()
    match = re.search(r'<strong>Subtitle By:</strong>\s*([^<]+)', html)
    if match:
        return match.group(1).strip()
    return None


def extract_post_id(html):
    pattern = r'data-post=["\'](\d+)["\']'
    matches = re.findall(pattern, html)
    if matches:
        return matches[0]
    pattern2 = r'\?p=(\d+)'
    matches2 = re.findall(pattern2, html)
    if matches2:
        return matches2[0]
    return None


def extract_data_type(html):
    pattern = r'<li[^>]*data-type=["\']([^"\']+)["\'][^>]*data-post='
    matches = re.findall(pattern, html)
    valid_types = {'mv', 'ep', 'tv', 'episode', 'movie'}
    for match in matches:
        if match.lower() in valid_types:
            return match
    pattern2 = r'data-type=["\']([^"\']+)["\']'
    matches2 = re.findall(pattern2, html)
    for match in matches2:
        if match.lower() in valid_types:
            return match
    return None


def extract_player_options(html):
    pattern = r'data-nume=["\']([^"\']+)["\']'
    matches = re.findall(pattern, html)
    seen = set()
    unique = []
    for m in matches:
        if m not in seen:
            seen.add(m)
            unique.append(m)
    return unique


def call_player_api(base_url, page_url, post_id, data_type, nume):
    api_url = base_url + "wp-admin/admin-ajax.php"
    post_data = {
        'action': 'zeta_player_ajax',
        'post': post_id,
        'nume': nume,
        'type': data_type
    }
    data = urlencode(post_data).encode('utf-8')
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': base_url.rstrip('/'),
        'Referer': page_url,
        'Connection': 'keep-alive',
    }
    req = urllib.request.Request(api_url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        return None


def parse_api_response(response_text):
    if not response_text:
        return None
    try:
        return json.loads(response_text)
    except:
        return None


def fetch_url_content(url):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://cinesubz.lk/',
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as response:
            return response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        return None


def extract_all_qualities(html_content):
    pattern = r'const\s+ALL_QUALITIES\s*=\s*(\[.*?\]);'
    match = re.search(pattern, html_content, re.DOTALL)
    if match:
        json_str = match.group(1)
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
            try:
                return json.loads(json_str)
            except:
                return None
    return None


def extract_all_qualities_alt(html_content):
    pattern = r'var\s+ALL_QUALITIES\s*=\s*(\[.*?\]);'
    match = re.search(pattern, html_content, re.DOTALL)
    if match:
        json_str = match.group(1)
        try:
            return json.loads(json_str)
        except:
            json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
            try:
                return json.loads(json_str)
            except:
                return None

    pattern = r'let\s+ALL_QUALITIES\s*=\s*(\[.*?\]);'
    match = re.search(pattern, html_content, re.DOTALL)
    if match:
        json_str = match.group(1)
        try:
            return json.loads(json_str)
        except:
            json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)
            try:
                return json.loads(json_str)
            except:
                return None
    return None


def extract_video_urls(html_content):
    urls = []
    qualities = extract_all_qualities(html_content)
    if not qualities:
        qualities = extract_all_qualities_alt(html_content)

    if qualities:
        for q in qualities:
            if isinstance(q, dict) and 'url' in q:
                urls.append({
                    'quality': q.get('html', q.get('name', 'Unknown')),
                    'url': q['url'],
                    'default': q.get('default', False)
                })

    if not urls:
        mp4_pattern = r'https?://[^\s"\'<>]+\.mp4[^\s"\'<>]*'
        mp4_matches = re.findall(mp4_pattern, html_content)
        seen = set()
        for url in mp4_matches:
            if url not in seen:
                seen.add(url)
                urls.append({
                    'quality': 'Unknown',
                    'url': url,
                    'default': False
                })

    if not urls:
        url_pattern = r'url:\s*[\'"](https?://[^\s"\'<>]+)[\'"]'
        url_matches = re.findall(url_pattern, html_content)
        seen = set()
        for url in url_matches:
            if url not in seen:
                seen.add(url)
                urls.append({
                    'quality': 'Default',
                    'url': url,
                    'default': True
                })
    return urls


def extract_views(html):
    match = re.search(r'data-postid=["\'](\d+)["\'][^>]*>([\d,.KMB]*)\s*</i>\s*views', html, re.IGNORECASE)
    if match:
        count = match.group(2).strip()
        if count:
            return count
    match = re.search(r'(\d[\d,.]*(?:K|M|B)?)\s*views', html, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None


def extract_language(html):
    match = re.search(r'<span[^>]*class=["\']data-keywords-inline["\'][^>]*>.*?<a[^>]*>([^<]+)</a>.*?</span>', html, re.DOTALL)
    if match:
        return match.group(1).strip()
    match = re.search(r'<span[^>]*class=["\']movie-download-meta["\'][^>]*>.*?•\s*([^•]+)$', html)
    if match:
        lang = match.group(1).strip()
        if lang and 'GB' not in lang and 'MB' not in lang and 'p' not in lang:
            return lang
    return None


def extract_thumbnail_pics(html):
    thumbnails = []
    gallery_items = re.findall(
        r'<div[^>]*class=["\']gall-item["\'][^>]*>.*?'
        r'<a href=["\']([^"\']+)["\'][^>]*>.*?'
        r'<img src=["\']([^"\']+)["\'][^>]*alt=["\']([^"\']+)["\'][^>]*>',
        html, re.DOTALL
    )
    for item in gallery_items:
        full_url, thumb_url, alt = item
        thumbnails.append({
            'full_url': full_url.strip(),
            'thumbnail_url': thumb_url.strip(),
            'alt': alt.strip()
        })

    og_images = re.findall(r'<meta property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']', html)
    for img in og_images:
        if img not in [t['full_url'] for t in thumbnails]:
            thumbnails.append({
                'full_url': img.strip(),
                'thumbnail_url': img.strip().replace('/original/', '/w300/').replace('/w780/', '/w300/'),
                'alt': 'OG Image'
            })

    return thumbnails


def extract_download_links_with_sizes(html):
    """Extract download links with quality and size (MB/GB) from page."""
    downloads = []
    download_items = re.findall(
        r'<div[^>]*class=["\']movie-download-link-item["\'][^>]*>.*?'
        r'<a href=["\']([^"\']+)["\'][^>]*>.*?'
        r'<span[^>]*class=["\']movie-download-type["\'][^>]*>([^<]+)</span>.*?'
        r'<span[^>]*class=["\']movie-download-meta["\'][^>]*>([^<]+)</span>',
        html, re.DOTALL
    )
    for item in download_items:
        link, link_type, meta = item
        meta_parts = [p.strip() for p in meta.split('•')]
        quality = meta_parts[0] if len(meta_parts) > 0 else 'Unknown'
        size = meta_parts[1] if len(meta_parts) > 1 else 'Unknown'
        language = meta_parts[2] if len(meta_parts) > 2 else 'Unknown'

        downloads.append({
            'url': link.strip(),
            'type': link_type.strip(),
            'quality': quality,
            'size': size,
            'language': language
        })
    return downloads


def get_quality_key(quality_str):
    """Extract quality number for matching (480, 720, 1080, etc.)"""
    q_lower = quality_str.lower()
    if '1080' in q_lower:
        return 1080
    elif '720' in q_lower:
        return 720
    elif '480' in q_lower:
        return 480
    elif '360' in q_lower:
        return 360
    elif '240' in q_lower:
        return 240
    return 0


def extract_movie_info(url):
    parsed = urlparse(url)
    base_url = parsed.scheme + "://" + parsed.netloc + "/"

    html = fetch_html(url)
    if not html:
        return {"error": "Failed to fetch URL"}

    info = {}
    info['title'] = extract_title(html)
    info['poster'] = extract_poster(html, base_url)
    info['year'] = extract_year(html)
    info['duration'] = extract_duration(html)
    info['imdb_rating'] = extract_imdb_rating(html)
    info['imdb_votes'] = extract_imdb_votes(html)
    info['quality'] = extract_quality(html)
    info['genres'] = extract_genres(html)
    info['director'] = extract_director(html)
    info['country'] = extract_country(html)
    info['description'] = extract_description(html)
    info['cast'] = extract_cast(html)
    info['subtitle_by'] = extract_subtitle_by(html)
    info['views'] = extract_views(html)
    info['language'] = extract_language(html)
    info['thumbnails'] = extract_thumbnail_pics(html)

    # Extract video URLs from player API
    post_id = extract_post_id(html)
    data_type = extract_data_type(html)

    all_video_urls = []

    if post_id:
        if not data_type:
            data_type = "mv"

        player_options = extract_player_options(html)
        if not player_options:
            player_options = ["1"]

        for nume in player_options:
            response = call_player_api(base_url, url, post_id, data_type, nume)
            parsed_response = parse_api_response(response)

            if not parsed_response:
                continue

            embed_url = parsed_response.get('embed_url')
            video_type = parsed_response.get('type', 'unknown')

            if not embed_url:
                continue

            if video_type in ('iframe', 'trailer'):
                continue

            if video_type in ('mp4', 'ztshcode') and str(embed_url).startswith('http'):
                player_html = fetch_url_content(str(embed_url))
                if player_html:
                    video_urls = extract_video_urls(player_html)
                    if video_urls:
                        for v in video_urls:
                            all_video_urls.append(v)
                    else:
                        all_video_urls.append({
                            'quality': 'Direct',
                            'url': str(embed_url),
                            'default': True
                        })
                else:
                    all_video_urls.append({
                        'quality': 'Direct',
                        'url': str(embed_url),
                        'default': True
                    })

    # Remove duplicate video URLs
    seen_urls = set()
    unique_video_urls = []
    for v in all_video_urls:
        if v['url'] not in seen_urls:
            seen_urls.add(v['url'])
            unique_video_urls.append(v)

    # Get download links from page (for size matching)
    page_downloads = extract_download_links_with_sizes(html)

    # Build a size map from page downloads by quality
    size_map = {}
    for dl in page_downloads:
        q_key = get_quality_key(dl['quality'])
        if q_key > 0:
            size_map[q_key] = dl['size']

    # Build downloads array from video URLs with matched sizes
    downloads = []

    for v in unique_video_urls:
        url_lower = v['url'].lower()
        q_key = get_quality_key(v['quality'])

        # If quality label is Unknown/Default, try to extract from URL
        if q_key == 0:
            if '1080' in url_lower:
                q_key = 1080
            elif '720' in url_lower:
                q_key = 720
            elif '480' in url_lower:
                q_key = 480
            elif '360' in url_lower:
                q_key = 360
            elif '240' in url_lower:
                q_key = 240

        # Map quality key to label
        if q_key == 1080:
            quality_label = 'FHD 1080P'
        elif q_key == 720:
            quality_label = 'HD 720P'
        elif q_key == 480:
            quality_label = 'SD 480P'
        elif q_key == 360:
            quality_label = 'SD 360P'
        elif q_key == 240:
            quality_label = 'SD 240P'
        else:
            quality_label = 'HD'

        # Get size from page download links by matching quality
        size = size_map.get(q_key, 'Unknown')

        downloads.append({
            'url': v['url'],
            'quality': quality_label,
            'size': size,
            'language': info.get('language', 'Unknown'),
            'default': v.get('default', False)
        })

    info['downloads'] = downloads
    return info


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: python app.py <url>"
        }, indent=2, ensure_ascii=False))
        sys.exit(1)

    url = sys.argv[1]

    if not url.startswith(('http://', 'https://')):
        print(json.dumps({
            "success": False,
            "error": "Please provide a valid URL starting with http:// or https://"
        }, indent=2, ensure_ascii=False))
        sys.exit(1)

    try:
        movie_info = extract_movie_info(url)

        if "error" in movie_info and not movie_info.get('title'):
            result = {
                "success": False,
                "error": movie_info["error"],
                "source_url": url
            }
        else:
            result = {
                "success": True,
                "source_url": url,
                "movie_info": movie_info
            }

        print(json.dumps(result, indent=2, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "source_url": url
        }, indent=2, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
