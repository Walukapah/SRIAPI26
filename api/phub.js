const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml"
};

const MOBILE_UA = "Mozilla/5.0 (Linux; Android 11; Redmi Note 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";

const RETRY_DELAY = 2000;
const CONCURRENT_REQUESTS = 3;
const DOWNLOAD_BASE_URL = "https://sriconvert.onrender.com/video?url=";

function fetchPage(url, useMobile = false) {
    const ua = useMobile ? MOBILE_UA : HEADERS["User-Agent"];
    return axios.get(url, {
        headers: {
            "User-Agent": ua,
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml"
        },
        timeout: 30000,
        responseType: 'text'
    }).then(r => r.data);
}

function extractJsonLd(html) {
    const scripts = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const script of scripts) {
        const content = script.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
        try {
            return JSON.parse(content);
        } catch (e) {}
    }
    return {};
}

function convertDuration(value) {
    if (!value) return null;
    if (/^\d+:\d+$/.test(value)) return value;
    const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (match) {
        const h = parseInt(match[1] || 0);
        const m = parseInt(match[2] || 0);
        const s = parseInt(match[3] || 0);
        if (h) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        else return `${m}:${String(s).padStart(2,'0')}`;
    }
    return value;
}

function extractMediaDefinitions(script) {
    const pos = script.indexOf("mediaDefinitions");
    if (pos === -1) return null;
    let start = script.indexOf("[", pos);
    if (start === -1) return null;
    let depth = 0;
    let end = start;
    for (let i = start; i < script.length; i++) {
        if (script[i] === "[") depth++;
        else if (script[i] === "]") {
            depth--;
            if (depth === 0) {
                end = i + 1;
                break;
            }
        }
    }
    const raw = script.substring(start, end).replace(/\\\//g, "/");
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function findHls(html) {
    const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    const output = {};
    for (const scriptTag of scripts) {
        const script = scriptTag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
        if (!script.includes("mediaDefinitions")) continue;
        const media = extractMediaDefinitions(script);
        if (!media) continue;
        for (const item of media) {
            const url = item.videoUrl;
            const quality = item.quality;
            const fmt = item.format;
            if (!url) continue;
            if (!url.startsWith("https://im-h.phncdn.com")) continue;
            if (fmt !== "hls") continue;
            if (!quality) continue;
            output[parseInt(quality)] = {
                quality: `${quality}p`,
                format: "hls",
                url: url
            };
        }
    }
    const sortedOutput = {};
    const keys = Object.keys(output).map(Number).sort((a, b) => b - a);
    for (const q of keys) {
        sortedOutput[`${q}p`] = output[q];
    }
    return Object.keys(sortedOutput).length ? sortedOutput : null;
}

function getVideoMetadata(html) {
    const $ = cheerio.load(html);
    const data = extractJsonLd(html);

    const info = {
        title: null,
        description: null,
        duration: null,
        upload_date: null,
        thumbnail: null,
        author: null,
        views: null,
        likes: null,
        pstars: [],
        tags: []
    };

    if (data) {
        info.title = data.name || null;
        info.description = data.description || null;
        info.duration = convertDuration(data.duration) || null;
        info.upload_date = data.uploadDate || null;
        info.thumbnail = data.thumbnailUrl || null;

        const author = data.author;
        if (author && typeof author === 'object') {
            info.author = author.name || null;
        } else {
            info.author = author || null;
        }

        const stats = data.interactionStatistic || [];
        for (const item of stats) {
            const action = item.interactionType || "";
            const count = item.userInteractionCount;
            if (typeof action === 'string' && action.includes("WatchAction")) info.views = count;
            if (typeof action === 'string' && action.includes("LikeAction")) info.likes = count;
        }
    }

    if (!info.duration) {
        const durationEl = $(".duration").first();
        if (durationEl.length) info.duration = durationEl.text().trim();
    }

    $(".pornstarsWrapper a").each((i, el) => {
        const star = $(el);
        const name = star.text().trim();
        const href = star.attr("href");
        const img = star.find("img");
        const image = img.attr("src") || img.attr("data-src") || null;
        if (name) {
            info.pstars.push({
                name: name,
                url: href && href.startsWith("/") ? "https://www.pornhub.com" + href : href,
                image: image
            });
        }
    });

    $(".tagsWrapper a, .tags a").each((i, el) => {
        const t = $(el).text().trim();
        if (t && !info.tags.includes(t)) info.tags.push(t);
    });

    return info;
}

async function singleRequest(url) {
    try {
        const html = await fetchPage(url, true);
        const hls = findHls(html);
        if (hls) {
            const meta = extractJsonLd(html);
            return { success: true, hls, meta };
        }
    } catch (e) {}
    return { success: false };
}

async function extractHlsWithRetry(url) {
    let count = 0;
    while (true) {
        count++;
        const promises = [];
        for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
            promises.push(singleRequest(url));
        }
        const results = await Promise.all(promises);
        for (const result of results) {
            if (result.success) {
                return { request_count: count, hls: result.hls, meta: result.meta };
            }
        }
        await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
}

function buildDownloadUrls(m3u8Data) {
    const downloadUrls = {};
    for (const [quality, data] of Object.entries(m3u8Data)) {
        const m3u8Url = data.url || "";
        if (m3u8Url) {
            downloadUrls[quality] = `${DOWNLOAD_BASE_URL}${encodeURIComponent(m3u8Url)}&format=mp4`;
        }
    }
    return downloadUrls;
}

async function getVideoInfo(url) {
    const html = await fetchPage(url, false);
    const metadata = getVideoMetadata(html);
    const hlsResult = await extractHlsWithRetry(url);
    const m3u8Data = hlsResult.hls || {};
    const downloadUrls = buildDownloadUrls(m3u8Data);

    return {
        url: url,
        status: 200,
        title: metadata.title,
        description: metadata.description,
        duration: metadata.duration,
        upload_date: metadata.upload_date,
        thumbnail: metadata.thumbnail,
        author: metadata.author,
        views: metadata.views,
        likes: metadata.likes,
        pstars: metadata.pstars,
        tags: metadata.tags,
        m3u8: m3u8Data,
        download: downloadUrls,
        request_count: hlsResult.request_count || 0
    };
}

module.exports = async function phubdl(videoUrl) {
    try {
        const result = await getVideoInfo(videoUrl);
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
};
