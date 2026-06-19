// aichat.js - AI Chat using SurfSense API with IP Rotation
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Free proxy list - these are public proxies (update regularly)
const PROXY_LIST = [
    // Format: "protocol://ip:port" or "protocol://user:pass@ip:port"
    // You can add your own paid proxies here for better reliability
];

// Fetch free proxies from a public API
async function fetchFreeProxies() {
    try {
        // Multiple free proxy sources for redundancy
        const proxySources = [
            'https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all',
            'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt',
            'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt'
        ];

        const proxies = [];

        for (const source of proxySources) {
            try {
                const response = await axios.get(source, { timeout: 5000 });
                const lines = response.data.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && trimmed.includes(':')) {
                        // Handle different formats
                        if (trimmed.startsWith('http')) {
                            proxies.push(trimmed);
                        } else {
                            proxies.push(`http://${trimmed}`);
                        }
                    }
                }
            } catch (e) {
                // Skip failed sources
            }
        }

        return [...new Set(proxies)]; // Remove duplicates
    } catch (error) {
        console.error('[AICHAT] Failed to fetch proxies:', error.message);
        return [];
    }
}

// Get a random proxy from the list
function getRandomProxy(proxyList) {
    if (!proxyList || proxyList.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * proxyList.length);
    return proxyList[randomIndex];
}

// Test if a proxy is working
async function testProxy(proxyUrl) {
    try {
        const agent = new HttpsProxyAgent(proxyUrl);
        const response = await axios.get('https://api.surfsense.com/api/v1/public/health', {
            httpsAgent: agent,
            timeout: 8000,
            validateStatus: () => true
        });
        return response.status < 500;
    } catch (error) {
        return false;
    }
}

// Get working proxy with retry
async function getWorkingProxy(proxyList, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        const proxy = getRandomProxy(proxyList);
        if (!proxy) return null;

        const isWorking = await testProxy(proxy);
        if (isWorking) {
            console.log(`[AICHAT] Using proxy: ${proxy.split('@').pop() || proxy}`); // Hide credentials if any
            return proxy;
        }
    }
    return null;
}

// Cache for working proxies
let workingProxiesCache = [];
let lastProxyFetch = 0;
const PROXY_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * AI Chat using SurfSense API with IP Rotation
 * @param {string} prompt - User's message/prompt
 * @param {Object} options - Optional settings
 * @param {string} options.proxy - Specific proxy to use (optional)
 * @param {boolean} options.useProxy - Whether to use proxy rotation (default: true)
 * @returns {Promise<Object>} - AI response
 */
async function aichat(prompt, options = {}) {
    if (!prompt || typeof prompt !== 'string') {
        return {
            success: false,
            error: 'Please provide a prompt parameter'
        };
    }

    const useProxy = options.useProxy !== false;
    let proxyUrl = options.proxy || null;

    // Fetch working proxies if needed
    if (useProxy && !proxyUrl) {
        const now = Date.now();
        if (now - lastProxyFetch > PROXY_CACHE_DURATION || workingProxiesCache.length === 0) {
            console.log('[AICHAT] Fetching fresh proxy list...');
            const freshProxies = await fetchFreeProxies();
            // Test a subset to find working ones
            const testSubset = freshProxies.slice(0, 20); // Test first 20 for speed
            const working = [];
            for (const proxy of testSubset) {
                if (await testProxy(proxy)) {
                    working.push(proxy);
                }
            }
            workingProxiesCache = working.length > 0 ? working : freshProxies;
            lastProxyFetch = now;
            console.log(`[AICHAT] Found ${working.length} working proxies out of ${testSubset.length} tested`);
        }

        proxyUrl = await getWorkingProxy(workingProxiesCache, 10);
    }

    try {
        const url = "https://api.surfsense.com/api/v1/public/anon-chat/stream";

        const headers = {
            "authority": "api.surfsense.com",
            "accept": "*/*",
            "content-type": "application/json",
            "origin": "https://www.surfsense.com",
            "referer": "https://www.surfsense.com/",
            "user-agent": getRandomUserAgent(),
            "x-forwarded-for": generateRandomIP(),
            "cf-connecting-ip": generateRandomIP(),
            "x-real-ip": generateRandomIP()
        };

        const payload = {
            "model_slug": "gpt-5.4-mini-no-login",
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        };

        const requestConfig = {
            headers: headers,
            responseType: 'stream',
            timeout: 30000
        };

        // Add proxy if available
        if (proxyUrl) {
            requestConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
            requestConfig.proxy = false; // Disable axios default proxy
        }

        const response = await axios.post(url, payload, requestConfig);

        // Collect the streaming response
        let fullResponse = '';
        let messageId = null;
        let tokenUsage = null;
        let quotaInfo = null;

        return new Promise((resolve, reject) => {
            let buffer = '';

            response.data.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.trim()) continue;

                    // Parse SSE format: data: {...}
                    if (line.startsWith('data: ')) {
                        const dataStr = line.substring(6).trim();

                        if (dataStr === '[DONE]') {
                            // Stream ended
                            continue;
                        }

                        try {
                            const data = JSON.parse(dataStr);

                            // Extract message ID
                            if (data.type === 'start' && data.messageId) {
                                messageId = data.messageId;
                            }

                            // Extract text chunks (the actual AI response)
                            if (data.type === 'text-delta' && data.delta) {
                                fullResponse += data.delta;
                            }

                            // Extract token usage
                            if (data.type === 'data-token-usage' && data.data) {
                                tokenUsage = data.data;
                            }

                            // Extract quota info
                            if (data.type === 'data-anon-quota' && data.data) {
                                quotaInfo = data.data;
                            }

                        } catch (e) {
                            // Skip non-JSON lines
                        }
                    }
                }
            });

            response.data.on('end', () => {
                // Process any remaining buffer
                if (buffer.trim()) {
                    const lines = buffer.split('\n');
                    for (const line of lines) {
                        if (!line.trim() || !line.startsWith('data: ')) continue;
                        const dataStr = line.substring(6).trim();
                        if (dataStr === '[DONE]') continue;
                        try {
                            const data = JSON.parse(dataStr);
                            if (data.type === 'text-delta' && data.delta) {
                                fullResponse += data.delta;
                            }
                        } catch (e) {}
                    }
                }

                resolve({
                    success: true,
                    response: fullResponse.trim(),
                    messageId: messageId,
                    model: "gpt-5.4-mini-no-login",
                    usage: tokenUsage,
                    quota: quotaInfo,
                    proxyUsed: proxyUrl ? true : false
                });
            });

            response.data.on('error', (error) => {
                reject(error);
            });
        });

    } catch (error) {
        console.error('[AICHAT] Error:', error.message);

        // If proxy failed, retry without proxy once
        if (useProxy && proxyUrl && !options.proxy) {
            console.log('[AICHAT] Proxy failed, retrying without proxy...');
            // Remove failed proxy from cache
            workingProxiesCache = workingProxiesCache.filter(p => p !== proxyUrl);
            return aichat(prompt, { ...options, useProxy: false });
        }

        // Handle rate limit error (HTTP 429)
        if (error.response && error.response.status === 429) {
            return {
                success: false,
                error: 'Rate limit reached. Anonymous users can perform up to 0 operations per day. Please try again later.',
                statusCode: 429
            };
        }

        // Handle Cloudflare/blocking errors
        if (error.response && (error.response.status === 403 || error.response.status === 1020)) {
            return {
                success: false,
                error: 'Access blocked by Cloudflare. Try again with a different proxy or wait a moment.',
                statusCode: error.response.status
            };
        }

        // Handle other HTTP errors
        if (error.response) {
            return {
                success: false,
                error: `API Error: ${error.response.status} - ${error.response.statusText}`,
                statusCode: error.response.status
            };
        }

        return {
            success: false,
            error: error.message || 'Failed to get AI response'
        };
    }
}

// Generate random User-Agent
function getRandomUserAgent() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Generate random IP address
function generateRandomIP() {
    const octets = [];
    // Use common IP ranges to look more realistic
    const ranges = [
        [1, 126],   // Class A
        [128, 191], // Class B
        [192, 223]  // Class C
    ];
    const range = ranges[Math.floor(Math.random() * ranges.length)];
    octets.push(Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0]);
    octets.push(Math.floor(Math.random() * 256));
    octets.push(Math.floor(Math.random() * 256));
    octets.push(Math.floor(Math.random() * 256));
    return octets.join('.');
}

module.exports = aichat;
