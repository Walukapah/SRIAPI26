const axios = require('axios');
const cheerio = require('cheerio');

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

const RETRY_DELAY = 2000;
const CONCURRENT_REQUESTS = 3;
const DOWNLOAD_BASE_URL = "https://sriconvert.onrender.com/video?url=";

function getHeaders(useMobile = false) {
    const ua = useMobile ? MOBILE_UA : DESKTOP_UA;
    return {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
        "sec-ch-ua": '"Not)A;Brand";v="99", "Google Chrome";v="138", "Chromium";v="138"',
        "sec-ch-ua-mobile": useMobile ? "?1" : "?0",
        "sec-ch-ua-platform": useMobile ? '"Android"' : '"Windows"',
        "Cookie": "accessAge=1; accessDate=1; platform=pc; bs=px0g0g0g0g; ss=69420269420269420; il=v1; expiredEnterModalShown=1"
    };
}

function fetchPage(url, useMobile = false) {
    return axios.get(url, {
        headers: getHeaders(useMobile),
        timeout: 30000,
        responseType: 'text',
        maxRedirects: 5
    }).then(r => r.data);
}

function extractJsonLd(html) {
    const scripts = html.match(/<script[^>]*type="application\\/ld\\+json"[^>]*>([\\s\\S]*?)<\\/script>/gi) || [];
    for (const script of scripts) {
        const content = script.replace(/<script[^>]*>/i, '').replace(/<\\/script>/i, '').trim();
        try {
            return JSON.parse(content);
        } catch (e) {}
    }
    return {};
}

function convertDuration(value) {
    if (!value) return null;
    if (/^\\d+:\\d+$/.test(value)) return value;
    const match = value.match(/PT(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+)S)?/);
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
    const raw = script.substring(start, end).replace(/\\\\\\//g, "/");
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function findHls(html) {
    const scripts = html.match(/<script[^>]*>([\\s\\S]*?)<\\/script>/gi) || [];
    const output = {};
    for (const scriptTag of scripts) {
        const script = scriptTag.replace(/<script[^>]*>/i, '').replace(/<\\/script>/i, '');
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
        pornstars: [],
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
            info.pornstars.push({
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

async function singleRequest(url, useMobile = false) {
    try {
        const html = await fetchPage(url, useMobile);
        const hls = findHls(html);
        if (hls) {
            const meta = extractJsonLd(html);
            return { success: true, hls, meta };
        }
    } catch (e) {
        console.log(`Request failed: ${e.message}`);
    }
    return { success: false };
}

async function extractHlsWithRetry(url) {
    let count = 0;
    const strategies = [
        { mobile: false, desc: "Desktop" },
        { mobile: true, desc: "Mobile" },
        { mobile: false, desc: "Desktop retry" }
    ];
    
    while (count < 10) {
        count++;
        console.log(`Attempt ${count}...`);
        
        const strategy = strategies[count % strategies.length];
        
        const promises = [];
        for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
            promises.push(singleRequest(url, strategy.mobile));
        }
        
        try {
            const results = await Promise.all(promises);
            for (const result of results) {
                if (result.success) {
                    return { request_count: count, hls: result.hls, meta: result.meta };
                }
            }
        } catch (e) {
            console.log(`Batch error: ${e.message}`);
        }
        
        await new Promise(r => setTimeout(r, RETRY_DELAY + (count * 500)));
    }
    
    return { request_count: count, hls: null, meta: null };
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
    console.log(`Fetching video info for: ${url}`);
    
    let html;
    try {
        html = await fetchPage(url, false);
    } catch (e) {
        console.log(`Desktop fetch failed, trying mobile...`);
        html = await fetchPage(url, true);
    }
    
    const metadata = getVideoMetadata(html);
    console.log(`Title: ${metadata.title || "N/A"}`);
    
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
        pornstars: metadata.pornstars,
        tags: metadata.tags,
        m3u8: m3u8Data,
        download: downloadUrls,
        request_count: hlsResult.request_count || 0
    };
}

module.exports = async function phubdl(videoUrl) {
    try {
        const result = await getVideoInfo(videoUrl);
        if (Object.keys(result.m3u8).length === 0) {
            return { 
                success: false, 
                error: "Could not extract video streams. The site may be blocking requests." 
            };
        }
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
};
