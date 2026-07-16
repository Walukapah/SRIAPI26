// api/googlesearch.js - DuckDuckGo HTML Search Scraper
const https = require('https');

function unescapeHtml(text) {
    if (!text) return '';
    const htmlEntities = {
        '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
        '&#x27;': "'", '&#x2F;': '/', '&#x60;': '`', '&#61;': '=', '&#43;': '+',
        '&#45;': '-', '&#47;': '/', '&#58;': ':', '&#59;': ';', '&#95;': '_',
        '&#8211;': '–', '&#8212;': '—', '&#8216;': ''', '&#8217;': ''',
        '&#8220;': '"', '&#8221;': '"', '&#8230;': '…', '&#x2013;': '–',
        '&#x2014;': '—', '&#x2018;': ''', '&#x2019;': ''', '&#x201C;': '"',
        '&#x201D;': '"', '&#x2026;': '…', '&nbsp;': ' ', '&ndash;': '–',
        '&mdash;': '—', '&lsquo;': ''', '&rsquo;': ''', '&ldquo;': '"',
        '&rdquo;': '"', '&hellip;': '…', '&bull;': '•', '&copy;': '©',
        '&reg;': '®', '&trade;': '™', '&euro;': '€', '&pound;': '£',
        '&yen;': '¥', '&cent;': '¢'
    };
    return text.replace(/&[a-zA-Z0-9#]+;/g, (match) => htmlEntities[match] || match);
}

function parseResults(htmlContent) {
    const results = [];
    const resultPattern = /<div class="result results_links results_links_deep web-result ">(.*?)<\/div>\s*<\/div>\s*<\/div>/gs;
    const resultBlocks = htmlContent.match(resultPattern) || [];

    for (const block of resultBlocks) {
        const result = {};
        const titleMatch = block.match(/<h2 class="result__title">.*?<a[^>]*class="result__a"[^>]*href="([^"]*)">(.*?)<\/a>/s);
        if (titleMatch) {
            const rawUrl = titleMatch[1];
            const actualUrlMatch = rawUrl.match(/uddg=([^&]+)/);
            result.url = actualUrlMatch ? decodeURIComponent(actualUrlMatch[1]) : rawUrl;
            result.title = unescapeHtml(titleMatch[2].replace(/<[^>]+>/g, '').trim());
        }

        const snippetMatch = block.match(/<a class="result__snippet"[^>]*href="[^"]*">(.*?)<\/a>/s);
        result.snippet = snippetMatch ? unescapeHtml(snippetMatch[1].replace(/<[^>]+>/g, '').trim()) : '';

        const displayUrlMatch = block.match(/<a class="result__url"[^>]*>(.*?)<\/a>/s);
        result.display_url = displayUrlMatch ? unescapeHtml(displayUrlMatch[1].replace(/<[^>]+>/g, '').trim()) : '';

        if (result.title && result.url) {
            results.push(result);
        }
    }
    return results;
}

function searchDuckDuckGo(query) {
    return new Promise((resolve, reject) => {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

        const options = {
            hostname: 'html.duckduckgo.com',
            path: `/?q=${encodedQuery}`,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'identity',
                'Connection': 'keep-alive',
            },
            timeout: 15000
        };

        const req = https.request(options, (res) => {
            let htmlContent = '';
            res.on('data', (chunk) => { htmlContent += chunk; });
            res.on('end', () => {
                try {
                    const results = parseResults(htmlContent);
                    resolve(results);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => reject(new Error(`Failed to fetch: ${error.message}`)));
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
        req.end();
    });
}

// Main export function - must match api.handler name "googlesearch"
async function googlesearch(query) {
    if (!query || query.trim().length === 0) {
        return { success: false, message: "Please provide a search query" };
    }

    try {
        const results = await searchDuckDuckGo(query);
        if (results.length === 0) {
            return { success: false, message: "No results found" };
        }
        return {
            success: true,
            query: query,
            total_results: results.length,
            results: results
        };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

module.exports = googlesearch;
