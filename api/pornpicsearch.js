const https = require('https');
const { URL } = require('url');

/**
 * PornPics Search / Category / Tag / Pornstar Scraper
 * Supports: search pages, category pages, tag pages, pornstar pages
 * 
 * @param {string} query - Search query or full PornPics URL
 * @returns {Promise<Object>} - Scraped results
 */
async function pornpicsearch(query) {
    if (!query || typeof query !== 'string') {
        return {
            success: false,
            error: 'Please provide a search query or PornPics URL'
        };
    }

    let url;
    if (query.startsWith('http')) {
        url = query;
    } else {
        const encodedQuery = encodeURIComponent(query);
        url = `https://www.pornpics.com/?q=${encodedQuery}`;
    }

    try {
        const html = await fetchHtml(url);
        const response = buildJsonResponse(url, html, query);
        return {
            success: true,
            creator: "WALUKA🇱🇰",
            result: response
        };
    } catch (error) {
        return {
            success: false,
            creator: "WALUKA🇱🇰",
            error: error.message || 'Unknown error occurred'
        };
    }
}

/**
 * Fetch HTML content from URL
 */
function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.pornpics.com/',
            },
            timeout: 30000,
        };

        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                return;
            }

            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve(data);
            });
        });

        req.on('error', (err) => {
            reject(new Error(`Request failed: ${err.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

/**
 * Detect page type
 */
function extractPageType(html) {
    if (/var PP_PAGE_TYPE = 'search'/.test(html)) return 'search';
    if (/var PP_PAGE_TYPE = 'category_rotator_maps'/.test(html)) return 'category';
    if (/var PP_PAGE_TYPE = 'gallery_gc'/.test(html)) return 'gallery';
    if (/<span class="entity-card-title__name">/.test(html)) return 'pornstar';
    return 'unknown';
}

/**
 * Extract page title
 */
function extractPageTitle(html) {
    const h1Match = html.match(/<h1>([^<]+)<\/h1>/);
    if (h1Match) return h1Match[1].trim();

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1].split(' - ')[0].trim();

    return '';
}

/**
 * Extract related/submenu tags
 */
function extractRelatedTags(html, baseUrl) {
    const tags = [];
    const tagsSection = html.match(/<div class="submenu-section clearfix" id="tags-section">(.*?)<\/div>/s);
    if (tagsSection) {
        const tagRegex = /<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
        let match;
        while ((match = tagRegex.exec(tagsSection[1])) !== null) {
            tags.push({
                name: match[2].trim(),
                url: new URL(match[1], baseUrl).href
            });
        }
    }
    return tags;
}

/**
 * Extract model/profile info
 */
function extractProfile(html, baseUrl) {
    const profile = {};

    const nameMatch = html.match(/<span class="entity-card-title__name">([^<]+)<\/span>/);
    if (!nameMatch) return null;

    profile.name = nameMatch[1].trim();

    // Avatar
    const avatarMatch = html.match(/<img src="(https:\/\/cdni\.pornpics\.com\/models\/[^"]+)" alt="([^"]*)"/);
    if (avatarMatch) {
        profile.avatar = avatarMatch[1];
        if (avatarMatch[2].trim()) {
            profile.name = avatarMatch[2].trim();
        }
    }

    // Stats
    const galleriesMatch = html.match(/<strong>(\d+)<\/strong> galleries/);
    const ageMatch = html.match(/<strong>(\d+)<\/strong> years/);
    const countryMatch = html.match(/flag-icon-([a-z]+)[^>]*><\/i>\s*([^<]+)/);

    if (galleriesMatch) profile.total_galleries = parseInt(galleriesMatch[1]);
    if (ageMatch) profile.age = parseInt(ageMatch[1]);
    if (countryMatch) profile.country = countryMatch[2].trim();

    // Bio details
    const bio = {};
    const aliasesMatch = html.match(/Aliases:<\/div>\s*<div class="item__content">\s*<div class="value">([^<]+)<\/div>/);
    const genderMatch = html.match(/Gender:<\/div>\s*<div class="item__content">\s*<div class="value">([^<]+)<\/div>/);
    const birthdayMatch = html.match(/Birthday:<\/div>\s*<div class="item__content">\s*<div class="value">([^<]+)<\/div>/);
    const heightMatch = html.match(/Height:<\/div>\s*<div class="item__content">\s*<div class="value">([^<]+)<\/div>/);
    const weightMatch = html.match(/Weight:<\/div>\s*<div class="item__content">\s*<div class="value">([^<]+)<\/div>/);
    const hairMatch = html.match(/Hair color:<\/div>\s*<div class="item__content">\s*<div class="value">([^<]+)<\/div>/);
    const breastMatch = html.match(/Breast size:<\/div>\s*<div class="item__content">\s*<div class="value">([^<]+)<\/div>/);
    const breastTypeMatch = html.match(/Breast type:<\/div>\s*<div class="item__content">\s*<div class="value">([^<]+)<\/div>/);

    if (aliasesMatch) bio.aliases = aliasesMatch[1].trim();
    if (genderMatch) bio.gender = genderMatch[1].trim();
    if (birthdayMatch) bio.birthday = birthdayMatch[1].trim();
    if (heightMatch) bio.height = heightMatch[1].trim();
    if (weightMatch) bio.weight = weightMatch[1].trim();
    if (hairMatch) bio.hair_color = hairMatch[1].trim();
    if (breastMatch) bio.breast_size = breastMatch[1].trim();
    if (breastTypeMatch) bio.breast_type = breastTypeMatch[1].trim();

    if (Object.keys(bio).length > 0) {
        profile.bio = bio;
    }

    return profile;
}

/**
 * Extract gallery results from any PornPics page
 */
function extractGalleryResults(html, baseUrl) {
    const results = [];

    // Pattern 1: Search page format (single quotes)
    const galleryPattern1 = new RegExp(
        "<li class='thumbwook'[^>]*>\\s*" +
        "<a class='rel-link' href='([^']+)'" +
        "(?:[^>]*data-gid='(\\d+)')?" +
        "(?:[^>]*data-tid=\"([^\"]+)\")?" +
        "(?:[^>]*data-mid=\"([^\"]+)\")?" +
        "(?:[^>]*title='([^']*)')?" +
        "\\s*>\\s*<img[^>]*data-src='([^']+)'" +
        "(?:[^>]*alt='([^']*)')?" +
        "(?:[^>]*width='(\\d+)'[^>]*height='(\\d+)')?" +
        "[^>]*/>\\s*</a>\\s*</li>",
        'gs'
    );

    // Pattern 2: Category/tag page format (double quotes)
    const galleryPattern2 = new RegExp(
        '<li class="thumbwook"[^>]*>\\s*' +
        '<a class="rel-link" href="([^"]+)"' +
        '(?:[^>]*data-mid="([^"]+)")?' +
        '(?:[^>]*data-gid="([^"]+)")?' +
        '(?:[^>]*data-tid="([^"]+)")?' +
        '(?:[^>]*data-index="([^"]+)")?' +
        '\\s*>\\s*<img[^>]*data-src="([^"]+)"' +
        '(?:[^>]*alt="([^"]*)")?' +
        '(?:[^>]*width="(\\d+)"[^>]*height="(\\d+)")?' +
        '[^>]*>\\s*</a>\\s*</li>',
        'gs'
    );

    let matches = [...html.matchAll(galleryPattern1)];
    let patternUsed = 1;

    if (matches.length === 0) {
        matches = [...html.matchAll(galleryPattern2)];
        patternUsed = 2;
    }

    matches.forEach((match, idx) => {
        let galleryUrl, gid, tid, mid, title, thumbUrl, alt, width, height;

        if (patternUsed === 1) {
            [, galleryUrl, gid, tid, mid, title, thumbUrl, alt, width, height] = match;
        } else {
            [, galleryUrl, mid, gid, tid, , thumbUrl, alt, width, height] = match;
            title = alt;
        }

        const result = {
            index: idx + 1,
            title: title ? title.trim() : (alt ? alt.trim() : ''),
            gallery_url: galleryUrl,
            gallery_id: gid || null,
            thumbnail_url: thumbUrl,
        };

        if (tid) result.thumbnail_id = tid;
        if (mid) result.media_id = mid;
        if (width && height) {
            result.thumbnail_dimensions = {
                width: parseInt(width),
                height: parseInt(height)
            };
        }

        results.push(result);
    });

    return results;
}

/**
 * Build the final JSON response
 */
function buildJsonResponse(url, html, query) {
    const pageType = extractPageType(html);
    const pageTitle = extractPageTitle(html);
    const profile = extractProfile(html, url);
    const results = extractGalleryResults(html, url);
    const relatedTags = extractRelatedTags(html, url);

    return {
        success: true,
        source_url: url,
        page: {
            type: pageType,
            title: pageTitle,
        },
        search: {
            query: query,
            total_results: results.length,
        },
        profile: profile,
        related_tags: relatedTags,
        results: results,
        metadata: {
            scraped_at: new Date().toISOString(),
            method: 'html_parsing',
        }
    };
}

module.exports = pornpicsearch;
