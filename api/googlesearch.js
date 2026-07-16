// api/googlesearch.js - DuckDuckGo HTML Search Scraper
const https = require('https');
const { URL } = require('url');

function searchDuckDuckGo(query) {
    return new Promise((resolve, reject) => {
        const encodedQuery = encodeURIComponent(query);
        const url = new URL(`https://html.duckduckgo.com/html/?q=${encodedQuery}`);

        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
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

            res.on('data', (chunk) => {
                htmlContent += chunk;
            });

            res.on('end', () => {
                try {
                    const results = parseResults(htmlContent);
                    resolve(results);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Failed to fetch results: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

function parseResults(htmlContent) {
    const results = [];
    
    // Parse result blocks from HTML
    const resultPattern = /<div class="result results_links results_links_deep web-result ">(.*?)<\/div>\s*<\/div>\s*<\/div>/gs;
    const resultBlocks = htmlContent.match(resultPattern) || [];

    for (const block of resultBlocks) {
        const result = {};

        // Extract title and URL
        const titleMatch = block.match(/<h2 class="result__title">.*?<a[^>]*class="result__a"[^>]*href="([^"]*)">(.*?)<\/a>/s);
        if (titleMatch) {
            const rawUrl = titleMatch[1];
            // Extract actual URL from DuckDuckGo redirect
            const actualUrlMatch = rawUrl.match(/uddg=([^&]+)/);
            if (actualUrlMatch) {
                result.url = decodeURIComponent(actualUrlMatch[1]);
            } else {
                result.url = rawUrl;
            }

            // Clean title HTML
            let title = titleMatch[2].replace(/<[^>]+>/g, '');
            result.title = unescapeHtml(title.trim());
        }

        // Extract snippet/description
        const snippetMatch = block.match(/<a class="result__snippet"[^>]*href="[^"]*">(.*?)<\/a>/s);
        if (snippetMatch) {
            let snippet = snippetMatch[1].replace(/<[^>]+>/g, '');
            result.snippet = unescapeHtml(snippet.trim());
        } else {
            result.snippet = '';
        }

        // Extract display URL
        const displayUrlMatch = block.match(/<a class="result__url"[^>]*>(.*?)<\/a>/s);
        if (displayUrlMatch) {
            let displayUrl = displayUrlMatch[1].replace(/<[^>]+>/g, '');
            result.display_url = unescapeHtml(displayUrl.trim());
        } else {
            result.display_url = '';
        }

        if (result.title && result.url) {
            results.push(result);
        }
    }

    return results;
}

function unescapeHtml(text) {
    const htmlEntities = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&#x27;': "'",
        '&#x2F;': '/',
        '&#x60;': '`',
        '&#61;': '=',
        '&#43;': '+',
        '&#45;': '-',
        '&#47;': '/',
        '&#58;': ':',
        '&#59;': ';',
        '&#95;': '_',
        '&#8211;': '–',
        '&#8212;': '—',
        '&#8216;': ''',
        '&#8217;': ''',
        '&#8220;': '"',
        '&#8221;': '"',
        '&#8230;': '…',
        '&#x2013;': '–',
        '&#x2014;': '—',
        '&#x2018;': ''',
        '&#x2019;': ''',
        '&#x201C;': '"',
        '&#x201D;': '"',
        '&#x2026;': '…',
        '&nbsp;': ' ',
        '&ndash;': '–',
        '&mdash;': '—',
        '&lsquo;': ''',
        '&rsquo;': ''',
        '&ldquo;': '"',
        '&rdquo;': '"',
        '&hellip;': '…',
        '&bull;': '•',
        '&copy;': '©',
        '&reg;': '®',
        '&trade;': '™',
        '&euro;': '€',
        '&pound;': '£',
        '&yen;': '¥',
        '&cent;': '¢'
    };

    return text.replace(/&[a-zA-Z0-9#]+;/g, (match) => {
        return htmlEntities[match] || match;
    });
}

async function googleSearch(query) {
    if (!query || query.trim().length === 0) {
        return {
            success: false,
            message: "Please provide a search query"
        };
    }

    try {
        const results = await searchDuckDuckGo(query);

        if (results.length === 0) {
            return {
                success: false,
                message: "No results found for the given query"
            };
        }

        return {
            success: true,
            query: query,
            total_results: results.length,
            results: results
        };

    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
}

module.exports = googleSearch;
