// api/pornpicdl.js - PornPics Gallery Image Scraper
const https = require('https');
const { URL } = require('url');

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
                'Connection': 'keep-alive',
            },
            timeout: 30000,
        };

        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) {
                reject({
                    success: false,
                    error: {
                        type: 'HTTPError',
                        code: res.statusCode,
                        message: res.statusMessage,
                        url: url
                    }
                });
                return;
            }

            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        });

        req.on('error', (err) => {
            reject({
                success: false,
                error: {
                    type: 'RequestError',
                    message: err.message,
                    url: url
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject({
                success: false,
                error: {
                    type: 'TimeoutError',
                    message: 'Request timed out after 30 seconds',
                    url: url
                }
            });
        });

        req.end();
    });
}

function extractGalleryInfo(html, baseUrl) {
    const info = {
        title: '',
        gallery_id: '',
        channel: {},
        models: [],
        categories: [],
        tags: [],
        stats: {},
    };

    // Extract title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
        info.title = titleMatch[1].split(' - ')[0].trim();
    }

    // Extract gallery ID from JS vars
    const idMatch = html.match(/var ID = '(\d+)'/);
    if (idMatch) {
        info.gallery_id = idMatch[1];
    }

    // Extract channel
    const channelMatch = html.match(/Channel:&nbsp;<\/span><a href='([^']+)'[^>]*>([^<]+)<\/a>/);
    if (channelMatch) {
        info.channel = {
            name: channelMatch[2].trim(),
            url: new URL(channelMatch[1], baseUrl).href
        };
    }

    // Extract models
    const modelsSection = html.match(/Models:<\/span>.*?<div class="gallery-info__content">(.*?)<\/div>/s);
    if (modelsSection) {
        const modelLinks = [...modelsSection[1].matchAll(/<a href="([^"]+)"[^>]*><span>([^<]+)<\/span><\/a>/g)];
        info.models = modelLinks.map(m => ({
            name: m[2].trim(),
            url: new URL(m[1], baseUrl).href
        }));
    }

    // Extract categories
    const catSection = html.match(/Categories:<\/span>.*?<div class="gallery-info__content">(.*?)<\/div>/s);
    if (catSection) {
        const catLinks = [...catSection[1].matchAll(/<a href='([^']+)'[^>]*><span>([^<]+)<\/span><\/a>/g)];
        info.categories = catLinks.map(c => ({
            name: c[2].trim(),
            url: new URL(c[1], baseUrl).href
        }));
    }

    // Extract tags
    const tagsSection = html.match(/Tags List:<\/span>.*?<div class="gallery-info__content">(.*?)<\/div>/s);
    if (tagsSection) {
        const tagLinks = [...tagsSection[1].matchAll(/<a href='([^']+)'[^>]*><span>([^<]+)<\/span><\/a>/g)];
        info.tags = tagLinks.map(t => ({
            name: t[2].trim(),
            url: new URL(t[1], baseUrl).href
        }));
    }

    // Extract stats
    const ratingMatch = html.match(/Rating:\s*<\/span><span class="rate-count">([^<]+)<\/span>/);
    const viewsMatch = html.match(/Views:\s*([\d,]+)/);
    if (ratingMatch) {
        info.stats.rating = ratingMatch[1].trim();
    }
    if (viewsMatch) {
        info.stats.views = viewsMatch[1].trim();
    }

    return info;
}

function extractImages(html, baseUrl) {
    const images = [];

    // Extract from <li class='thumbwook'> elements
    const thumbPattern = /<li class='thumbwook'[^>]*>.*?<a class='rel-link' href='([^']+)'(?:[^>]*data-tid="([^"]+)")?(?:[^>]*data-pswp-width='(\d+)'[^>]*data-pswp-height='(\d+)')?(?:[^>]*data-size="([^"]+)")?.*?<img[^>]*data-src='([^']+)'(?:[^>]*alt='([^']*)')?(?:[^>]*width='(\d+)'[^>]*height='(\d+)')?.*?\/><\/a><\/li>/gs;

    let match;
    let idx = 0;
    while ((match = thumbPattern.exec(html)) !== null) {
        idx++;
        const fullUrl = match[1];
        const tid = match[2] || `${idx.toString().padStart(3, '0')}`;
        const pswpWidth = match[3];
        const pswpHeight = match[4];
        const dataSize = match[5];
        const thumbUrl = match[6];
        const alt = match[7];
        const thumbWidth = match[8];
        const thumbHeight = match[9];

        const imageData = {
            index: idx,
            image_id: tid,
            full_size_url: fullUrl,
            thumbnail_url: thumbUrl,
            alt_text: alt ? alt.trim() : '',
        };

        if (pswpWidth && pswpHeight) {
            imageData.full_size_dimensions = {
                width: parseInt(pswpWidth, 10),
                height: parseInt(pswpHeight, 10)
            };
        }

        if (dataSize) {
            imageData.dimensions_string = dataSize;
        }

        if (thumbWidth && thumbHeight) {
            imageData.thumbnail_dimensions = {
                width: parseInt(thumbWidth, 10),
                height: parseInt(thumbHeight, 10)
            };
        }

        images.push(imageData);
    }

    return images;
}

async function pornpicdl(url) {
    try {
        // Validate URL
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
            return {
                success: false,
                error: 'URL must start with http:// or https://'
            };
        }

        if (!url.includes('pornpics.com')) {
            return {
                success: false,
                error: 'URL must be from pornpics.com domain'
            };
        }

        const html = await fetchHtml(url);

        const galleryInfo = extractGalleryInfo(html, url);
        const images = extractImages(html, url);

        return {
            success: true,
            source_url: url,
            gallery: galleryInfo,
            images: {
                total_count: images.length,
                items: images,
            },
            metadata: {
                scraped_at: new Date().toISOString(),
                method: 'html_parsing',
            }
        };

    } catch (error) {
        if (error.success === false) {
            return error;
        }
        return {
            success: false,
            error: error.message || 'Unknown error occurred'
        };
    }
}

module.exports = pornpicdl;
