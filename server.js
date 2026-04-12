// server.js - Koyeb Optimized with AI Art Support
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// GitHub integration
const { Octokit } = require('@octokit/rest');
const crypto = require('crypto');

// Import API modules from api/ folder
const youtubedl = require('./api/youtubedl');
const tiktokdl = require('./api/tiktokdl');
const instagramdl = require('./api/instagramdl');
const freefireinfo = require('./api/freefireinfo');
const maker = require('./api/textphoto');
const youtubedl2 = require('./api/youtubedl2');
const chatgptai = require('./api/chatgptai');
const aiart = require('./api/aiart'); // AI Art Generator

const app = express();

// Trust proxy (required for Koyeb)
app.set('trust proxy', 1);
app.set('json spaces', 2);

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// WEBSITE URL CONFIGURATION
// ============================================

function getWebsiteUrl() {
    if (process.env.WEBSITE_URL) return process.env.WEBSITE_URL;
    if (process.env.KOYEB_PUBLIC_DOMAIN) return `https://${process.env.KOYEB_PUBLIC_DOMAIN}`;
    if (process.env.KOYEB_APP_NAME) return `https://${process.env.KOYEB_APP_NAME}.koyeb.app`;
    if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
    const port = process.env.PORT || 3000;
    return `http://localhost:${port}`;
}

const WEBSITE_URL = getWebsiteUrl();
console.log(`[CONFIG] Website URL: ${WEBSITE_URL}`);

// ============================================
// GITHUB CONFIGURATION
// ============================================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'Walukapah';
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || 'SRI-API-STORE';

console.log('[GITHUB] Environment check:');
console.log('[GITHUB] GITHUB_TOKEN exists:', !!GITHUB_TOKEN);
console.log('[GITHUB] GITHUB_TOKEN length:', GITHUB_TOKEN ? GITHUB_TOKEN.length : 0);
console.log('[GITHUB] GITHUB_REPO_OWNER:', GITHUB_REPO_OWNER);
console.log('[GITHUB] GITHUB_REPO_NAME:', GITHUB_REPO_NAME);

let octokit = null;
let githubEnabled = false;

if (GITHUB_TOKEN && GITHUB_TOKEN.length > 10 && !GITHUB_TOKEN.includes('your')) {
    try {
        octokit = new Octokit({ auth: GITHUB_TOKEN });
        githubEnabled = true;
        console.log('[GITHUB] Octokit initialized successfully');
    } catch (error) {
        console.error('[GITHUB] Failed to initialize Octokit:', error.message);
        githubEnabled = false;
    }
} else {
    console.warn('[GITHUB] GITHUB_TOKEN not set, too short, or contains placeholder text');
}

const STATS_FILE = 'api_stats1.json';
const HEALTH_FILE = 'api_health.json';

// ============================================
// ENDPOINT NAME MAPPING - Added aiart
// ============================================

const ENDPOINT_NAME_MAP = {
    'youtubedl': 'YouTube Downloader',
    'youtubedl2': 'YouTube Downloader V2',
    'tiktokdl': 'TikTok Downloader',
    'instagramdl': 'Instagram Downloader',
    'textphoto': 'Text to Photo',
    'freefire': 'Free Fire Player Info',
    'chatgpt': 'ChatGPT AI Chat',
    'aiart': 'AI Art Generator'
};

function getEndpointName(path) {
    const parts = path.split('/').filter(p => p);
    const lastPart = parts[parts.length - 1] || path;
    return ENDPOINT_NAME_MAP[lastPart] || lastPart
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .replace(/dl$/i, ' Downloader');
}

// ============================================
// STATS SYSTEM (Same as original)
// ============================================

let stats = {
    apiCalls: 0,
    visitors: 0,
    totalVisitors: 0,
    visitorData: {},
    endpointCalls: {},
    lastUpdated: new Date().toISOString(),
    lastVisitorDate: null
};

const recentRequests = new Map();
const REQUEST_CACHE_TIMEOUT = 5000;
const recentVisitors = new Map();
const VISITOR_COOLDOWN = 60000;

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

function getSriLankanDateString() {
    return new Date().toLocaleDateString('en-CA', { 
        timeZone: 'Asia/Colombo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function getRequestFingerprint(clientIp, endpoint) {
    const minute = Math.floor(Date.now() / 1000 / 60);
    const hash = crypto.createHash('sha256')
        .update(`${clientIp}:${endpoint}:${minute}`)
        .digest('hex')
        .substring(0, 16);
    return hash;
}

function wasRecentlyCounted(fingerprint) {
    const now = Date.now();
    for (const [key, timestamp] of recentRequests.entries()) {
        if (now - timestamp > REQUEST_CACHE_TIMEOUT) {
            recentRequests.delete(key);
        }
    }
    if (recentRequests.has(fingerprint)) return true;
    recentRequests.set(fingerprint, now);
    return false;
}

function checkAndRollVisitors() {
    const today = getTodayString();
    if (stats.lastVisitorDate && stats.lastVisitorDate !== today) {
        const yesterdayCount = Object.keys(stats.visitorData || {}).length;
        stats.totalVisitors += yesterdayCount;
        stats.visitors = 0;
        stats.visitorData = {};
        stats.lastVisitorDate = today;
        console.log(`[STATS] Rolled visitors: ${yesterdayCount} from ${stats.lastVisitorDate} added to total (${stats.totalVisitors})`);
        return true;
    }
    if (!stats.lastVisitorDate) {
        stats.lastVisitorDate = today;
    }
    return false;
}

function addVisitor(visitorHash) {
    checkAndRollVisitors();
    const today = getTodayString();
    if (!stats.visitorData) stats.visitorData = {};
    if (!stats.visitorData[visitorHash]) {
        stats.visitorData[visitorHash] = new Date().toISOString();
        stats.visitors = Object.keys(stats.visitorData).length;
        stats.lastUpdated = new Date().toISOString();
        broadcastStatsUpdate();
        return true;
    }
    return false;
}

// ============================================
// LIVE UPDATE SYSTEM - Server-Sent Events
// ============================================

const sseClients = new Set();

function broadcastStatsUpdate() {
    const todayCount = stats.visitors || 0;
    const totalCount = (stats.totalVisitors || 0) + todayCount;
    const updateData = {
        apiCalls: stats.apiCalls,
        visitors: todayCount,
        totalVisitors: totalCount,
        endpointCalls: stats.endpointCalls,
        lastUpdated: stats.lastUpdated,
        timestamp: new Date().toISOString()
    };
    sseClients.forEach(client => {
        try {
            client.write(`data: ${JSON.stringify(updateData)}\n\n`);
        } catch (e) {}
    });
}

// ============================================
// HEALTH CHECK SYSTEM - Added AI Art
// ============================================

let healthStatus = {
    lastCheckDate: null,
    lastCheckTime: null,
    nextCheckTime: null,
    endpoints: {},
    summary: { online: 0, offline: 0, total: 0 }
};

const ENDPOINTS_TO_CHECK = [
    { name: 'YouTube Downloader', path: '/download/youtubedl', method: 'GET', testParams: { url: 'https://youtube.com/watch?v=dQw4w9WgXcQ' } },
    { name: 'YouTube Downloader V2', path: '/download/youtubedl2', method: 'GET', testParams: { url: 'https://youtube.com/watch?v=dQw4w9WgXcQ' } },
    { name: 'TikTok Downloader', path: '/download/tiktokdl', method: 'GET', testParams: { url: 'https://vt.tiktok.com/ZSuYLQkMm/' } },
    { name: 'Instagram Downloader', path: '/download/instagramdl', method: 'GET', testParams: { url: 'https://www.instagram.com/reel/DKR-FW1yo_p/' } },
    { name: 'Text to Photo', path: '/download/textphoto', method: 'GET', testParams: { url: 'https://textpro.me/create-naruto-logo-style-text-effect-online-1125.html', text: 'Test' } },
    { name: 'Free Fire Player Info', path: '/search/freefire', method: 'GET', testParams: { region: 'SG', uid: '2326343985' } },
    { name: 'ChatGPT AI', path: '/ai/chatgpt', method: 'GET', testParams: { prompt: 'Hello' } },
    { name: 'AI Art Generator', path: '/ai/aiart', method: 'GET', testParams: { prompt: 'a beautiful sunset', format: 'json' } }
];

// ============================================
// GITHUB FUNCTIONS (Same as original)
// ============================================

async function testGitHubConnection() {
    if (!octokit) return false;
    try {
        const { data: user } = await octokit.users.getAuthenticated();
        console.log(`[GITHUB] Authenticated as: ${user.login}`);
        const { data: repo } = await octokit.repos.get({
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME
        });
        console.log(`[GITHUB] Repository access confirmed: ${repo.full_name}`);
        return true;
    } catch (error) {
        console.error('[GITHUB] Connection test failed:', error.message);
        return false;
    }
}

async function loadStatsFromGitHub() {
    if (!githubEnabled || !octokit) {
        console.log('[STATS] GitHub not enabled, skipping GitHub load');
        return false;
    }
    const connected = await testGitHubConnection();
    if (!connected) {
        githubEnabled = false;
        return false;
    }
    try {
        console.log('[STATS] Loading stats from GitHub...');
        const { data } = await octokit.repos.getContent({
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME,
            path: STATS_FILE
        });
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        const parsedStats = JSON.parse(content);

        if (parsedStats.visitors && typeof parsedStats.visitors === 'object' && !Array.isArray(parsedStats.visitors)) {
            if (parsedStats.visitors['2026-03-23'] || parsedStats.visitors['2026-03-24']) {
                console.log('[STATS] Converting from old format to new format...');
                let totalUniqueVisitors = 0;
                Object.values(parsedStats.visitors).forEach(dayVisitors => {
                    totalUniqueVisitors += Object.keys(dayVisitors).length;
                });
                const today = getTodayString();
                const todayData = parsedStats.visitors[today] || {};
                stats = {
                    apiCalls: parsedStats.apiCalls || 0,
                    visitors: Object.keys(todayData).length,
                    totalVisitors: totalUniqueVisitors,
                    visitorData: todayData,
                    endpointCalls: parsedStats.endpointCalls || {},
                    lastUpdated: parsedStats.lastUpdated || new Date().toISOString(),
                    lastVisitorDate: today
                };
            } else {
                stats.apiCalls = parsedStats.apiCalls || 0;
                stats.visitors = parsedStats.visitors || 0;
                stats.totalVisitors = parsedStats.totalVisitors || 0;
                stats.visitorData = parsedStats.visitorData || {};
                stats.endpointCalls = parsedStats.endpointCalls || {};
                stats.lastUpdated = parsedStats.lastUpdated || new Date().toISOString();
                stats.lastVisitorDate = parsedStats.lastVisitorDate || getTodayString();
            }
        } else {
            stats.apiCalls = parsedStats.apiCalls || 0;
            stats.visitors = parsedStats.visitors || 0;
            stats.totalVisitors = parsedStats.totalVisitors || 0;
            stats.visitorData = parsedStats.visitorData || {};
            stats.endpointCalls = parsedStats.endpointCalls || {};
            stats.lastUpdated = parsedStats.lastUpdated || new Date().toISOString();
            stats.lastVisitorDate = parsedStats.lastVisitorDate || getTodayString();
        }
        
        checkAndRollVisitors();
        const cleanedEndpoints = {};
        Object.keys(stats.endpointCalls).forEach(key => {
            const cleanKey = ENDPOINT_NAME_MAP[key] || key;
            cleanedEndpoints[cleanKey] = (cleanedEndpoints[cleanKey] || 0) + stats.endpointCalls[key];
        });
        stats.endpointCalls = cleanedEndpoints;
        saveStatsToLocal();
        console.log(`[STATS] Loaded from GitHub: ${stats.apiCalls} calls, ${stats.visitors} visitors today, ${stats.totalVisitors} total`);
        return true;
    } catch (error) {
        if (error.status === 404) {
            console.log('[STATS] No existing stats file on GitHub, will create new one');
            return true;
        }
        console.error('[STATS] Failed to load from GitHub:', error.message);
        return false;
    }
}

async function saveStatsToGitHub() {
    if (!githubEnabled || !octokit) return false;
    try {
        checkAndRollVisitors();
        const statsData = {
            apiCalls: stats.apiCalls,
            visitors: stats.visitors,
            totalVisitors: stats.totalVisitors,
            visitorData: stats.visitorData,
            endpointCalls: stats.endpointCalls,
            lastUpdated: new Date().toISOString(),
            lastVisitorDate: stats.lastVisitorDate
        };
        let sha = null;
        try {
            const { data } = await octokit.repos.getContent({
                owner: GITHUB_REPO_OWNER,
                repo: GITHUB_REPO_NAME,
                path: STATS_FILE
            });
            sha = data.sha;
        } catch (err) {
            if (err.status !== 404) console.error('[STATS] Error getting file SHA:', err.message);
        }
        const contentEncoded = Buffer.from(JSON.stringify(statsData, null, 2)).toString('base64');
        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME,
            path: STATS_FILE,
            message: `Update API stats - ${stats.apiCalls} calls, ${stats.visitors} today, ${stats.totalVisitors} total`,
            content: contentEncoded,
            sha: sha || undefined,
        });
        console.log(`[STATS] Saved to GitHub: ${stats.apiCalls} calls, ${stats.visitors} visitors today, ${stats.totalVisitors} total`);
        return true;
    } catch (error) {
        console.error('[STATS] Failed to save to GitHub:', error.message);
        if (error.status === 401) {
            console.error('[STATS] Token became invalid, disabling GitHub backup');
            githubEnabled = false;
        }
        return false;
    }
}

async function loadHealthFromGitHub() {
    if (!githubEnabled || !octokit) {
        console.log('[HEALTH] GitHub not enabled, loading from local');
        return loadHealthFromLocal();
    }
    try {
        console.log('[HEALTH] Loading health status from GitHub...');
        const { data } = await octokit.repos.getContent({
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME,
            path: HEALTH_FILE
        });
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        const parsedHealth = JSON.parse(content);
        healthStatus = {
            lastCheckDate: parsedHealth.lastCheckDate || null,
            lastCheckTime: parsedHealth.lastCheckTime || null,
            nextCheckTime: parsedHealth.nextCheckTime || null,
            endpoints: parsedHealth.endpoints || {},
            summary: parsedHealth.summary || { online: 0, offline: 0, total: 0 }
        };
        saveHealthToLocal();
        console.log(`[HEALTH] Loaded from GitHub: ${healthStatus.summary.online}/${healthStatus.summary.total} online`);
        return true;
    } catch (error) {
        if (error.status === 404) {
            console.log('[HEALTH] No existing health file on GitHub');
            return loadHealthFromLocal();
        }
        console.error('[HEALTH] Failed to load from GitHub:', error.message);
        return loadHealthFromLocal();
    }
}

async function saveHealthToGitHub() {
    if (!githubEnabled || !octokit) return false;
    try {
        let sha = null;
        try {
            const { data } = await octokit.repos.getContent({
                owner: GITHUB_REPO_OWNER,
                repo: GITHUB_REPO_NAME,
                path: HEALTH_FILE
            });
            sha = data.sha;
        } catch (err) {
            if (err.status !== 404) console.error('[HEALTH] Error getting file SHA:', err.message);
        }
        const contentEncoded = Buffer.from(JSON.stringify(healthStatus, null, 2)).toString('base64');
        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME,
            path: HEALTH_FILE,
            message: `Update API health - ${healthStatus.summary.online}/${healthStatus.summary.total} online - ${new Date().toISOString()}`,
            content: contentEncoded,
            sha: sha || undefined,
        });
        console.log(`[HEALTH] Saved to GitHub: ${healthStatus.summary.online}/${healthStatus.summary.total} online`);
        return true;
    } catch (error) {
        console.error('[HEALTH] Failed to save to GitHub:', error.message);
        return false;
    }
}

function saveStatsToLocal() {
    try {
        checkAndRollVisitors();
        const statsData = {
            apiCalls: stats.apiCalls,
            visitors: stats.visitors,
            totalVisitors: stats.totalVisitors,
            visitorData: stats.visitorData,
            endpointCalls: stats.endpointCalls,
            lastUpdated: new Date().toISOString(),
            lastVisitorDate: stats.lastVisitorDate
        };
        fs.writeFileSync(`./${STATS_FILE}`, JSON.stringify(statsData, null, 2));
        return true;
    } catch (error) {
        console.error('[STATS] Failed to save locally:', error.message);
        return false;
    }
}

function loadStatsFromLocal() {
    try {
        if (fs.existsSync(`./${STATS_FILE}`)) {
            const content = fs.readFileSync(`./${STATS_FILE}`, 'utf8');
            const parsedStats = JSON.parse(content);
            if (parsedStats.visitors && typeof parsedStats.visitors === 'object' && !Array.isArray(parsedStats.visitors)) {
                if (parsedStats.visitors['2026-03-23'] || parsedStats.visitors['2026-03-24']) {
                    console.log('[STATS] Converting local file from old format...');
                    let totalUniqueVisitors = 0;
                    Object.values(parsedStats.visitors).forEach(dayVisitors => {
                        totalUniqueVisitors += Object.keys(dayVisitors).length;
                    });
                    const today = getTodayString();
                    const todayData = parsedStats.visitors[today] || {};
                    stats = {
                        apiCalls: parsedStats.apiCalls || 0,
                        visitors: Object.keys(todayData).length,
                        totalVisitors: totalUniqueVisitors,
                        visitorData: todayData,
                        endpointCalls: parsedStats.endpointCalls || {},
                        lastUpdated: parsedStats.lastUpdated || new Date().toISOString(),
                        lastVisitorDate: today
                    };
                } else {
                    stats.apiCalls = parsedStats.apiCalls || 0;
                    stats.visitors = parsedStats.visitors || 0;
                    stats.totalVisitors = parsedStats.totalVisitors || 0;
                    stats.visitorData = parsedStats.visitorData || {};
                    stats.endpointCalls = parsedStats.endpointCalls || {};
                    stats.lastUpdated = parsedStats.lastUpdated || new Date().toISOString();
                    stats.lastVisitorDate = parsedStats.lastVisitorDate || getTodayString();
                }
            } else {
                stats.apiCalls = parsedStats.apiCalls || 0;
                stats.visitors = parsedStats.visitors || 0;
                stats.totalVisitors = parsedStats.totalVisitors || 0;
                stats.visitorData = parsedStats.visitorData || {};
                stats.endpointCalls = parsedStats.endpointCalls || {};
                stats.lastUpdated = parsedStats.lastUpdated || new Date().toISOString();
                stats.lastVisitorDate = parsedStats.lastVisitorDate || getTodayString();
            }
            checkAndRollVisitors();
            const cleanedEndpoints = {};
            Object.keys(stats.endpointCalls).forEach(key => {
                const cleanKey = ENDPOINT_NAME_MAP[key] || key;
                cleanedEndpoints[cleanKey] = (cleanedEndpoints[cleanKey] || 0) + stats.endpointCalls[key];
            });
            stats.endpointCalls = cleanedEndpoints;
            console.log(`[STATS] Loaded from local: ${stats.apiCalls} calls, ${stats.visitors} today, ${stats.totalVisitors} total`);
            return true;
        }
    } catch (error) {
        console.error('[STATS] Failed to load from local:', error.message);
    }
    return false;
}

function saveHealthToLocal() {
    try {
        fs.writeFileSync(`./${HEALTH_FILE}`, JSON.stringify(healthStatus, null, 2));
        return true;
    } catch (error) {
        console.error('[HEALTH] Failed to save locally:', error.message);
        return false;
    }
}

function loadHealthFromLocal() {
    try {
        if (fs.existsSync(`./${HEALTH_FILE}`)) {
            const content = fs.readFileSync(`./${HEALTH_FILE}`, 'utf8');
            const parsedHealth = JSON.parse(content);
            healthStatus = {
                lastCheckDate: parsedHealth.lastCheckDate || null,
                lastCheckTime: parsedHealth.lastCheckTime || null,
                nextCheckTime: parsedHealth.nextCheckTime || null,
                endpoints: parsedHealth.endpoints || {},
                summary: parsedHealth.summary || { online: 0, offline: 0, total: 0 }
            };
            console.log(`[HEALTH] Loaded from local: ${healthStatus.summary.online}/${healthStatus.summary.total} online`);
            return true;
        }
    } catch (error) {
        console.error('[HEALTH] Failed to load from local:', error.message);
    }
    return false;
}

function startAutoSave() {
    setInterval(async () => {
        saveStatsToLocal();
        if (githubEnabled) {
            await saveStatsToGitHub();
            await saveHealthToGitHub();
        }
    }, 60000);
    console.log('[SYSTEM] Auto-save started (every 1 minute)');
}

// ============================================
// DAILY HEALTH CHECK SYSTEM
// ============================================

function getSriLankanTime() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: 'Asia/Colombo' }));
}

function formatSriLankanTime(date) {
    return date.toLocaleString('en-US', { 
        timeZone: 'Asia/Colombo',
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });
}

function getNextCheckTime() {
    const now = getSriLankanTime();
    const nextCheck = new Date(now);
    nextCheck.setHours(0, 0, 0, 0);
    if (now.getHours() > 0 || (now.getHours() === 0 && now.getMinutes() > 0)) {
        nextCheck.setDate(nextCheck.getDate() + 1);
    }
    return nextCheck;
}

async function checkSingleEndpoint(endpoint) {
    let testUrl = `${WEBSITE_URL}${endpoint.path}`;
    if (endpoint.testParams) {
        const params = new URLSearchParams(endpoint.testParams);
        testUrl += '?' + params.toString();
    }
    console.log(`[HEALTH CHECK] Testing: ${endpoint.name} at ${testUrl}`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(testUrl, { 
            method: 'GET', 
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);
        let isOnline = false;
        let responseData = null;
        if (response.ok) {
            try {
                const data = await response.json();
                responseData = data;
                if (data && data.status === true) {
                    isOnline = true;
                }
            } catch (e) {
                isOnline = false;
            }
        }
        console.log(`[HEALTH CHECK] ${endpoint.name}: ${isOnline ? 'ONLINE ✅' : 'OFFLINE ❌'} (status: ${response.status})`);
        return {
            name: endpoint.name,
            path: endpoint.path,
            status: isOnline ? 'online' : 'offline',
            lastChecked: new Date().toISOString(),
            responseStatus: response.status,
            hasStatusTrue: responseData ? responseData.status === true : false
        };
    } catch (error) {
        console.log(`[HEALTH CHECK] ${endpoint.name}: OFFLINE ❌ (${error.message})`);
        return {
            name: endpoint.name,
            path: endpoint.path,
            status: 'offline',
            lastChecked: new Date().toISOString(),
            error: error.message
        };
    }
}

async function performDailyHealthCheck(force = false) {
    const now = getSriLankanTime();
    const today = getSriLankanDateString();
    console.log(`[HEALTH CHECK] Starting check at ${formatSriLankanTime(now)}`);
    console.log(`[HEALTH CHECK] Today: ${today}, Last check: ${healthStatus.lastCheckDate}`);
    if (!force && healthStatus.lastCheckDate === today) {
        console.log(`[HEALTH CHECK] Already completed today at ${healthStatus.lastCheckTime}`);
        return healthStatus.summary;
    }
    const results = [];
    for (const endpoint of ENDPOINTS_TO_CHECK) {
        const result = await checkSingleEndpoint(endpoint);
        results.push(result);
    }
    const online = results.filter(r => r.status === 'online').length;
    const offline = results.filter(r => r.status === 'offline').length;
    healthStatus = {
        lastCheckDate: today,
        lastCheckTime: formatSriLankanTime(now),
        nextCheckTime: formatSriLankanTime(getNextCheckTime()),
        endpoints: results.reduce((acc, curr) => {
            acc[curr.name] = curr;
            return acc;
        }, {}),
        summary: {
            online: online,
            offline: offline,
            total: results.length
        }
    };
    saveHealthToLocal();
    if (githubEnabled) {
        await saveHealthToGitHub();
    }
    console.log(`[HEALTH CHECK] Completed: ${online}/${results.length} online, ${offline} offline`);
    return healthStatus.summary;
}

function checkMissedHealthCheck() {
    const now = getSriLankanTime();
    const today = getSriLankanDateString();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    console.log(`[HEALTH CHECK] Checking missed check: today=${today}, lastCheck=${healthStatus.lastCheckDate}, hour=${currentHour}`);
    if (healthStatus.lastCheckDate !== today) {
        if (currentHour >= 0 && currentHour < 2) {
            console.log(`[HEALTH CHECK] Missed 12:00 AM check detected, running now...`);
            performDailyHealthCheck(true);
            return true;
        }
    }
    return false;
}

let healthCheckInterval = null;
let nextCheckUpdateInterval = null;

function startDailyHealthCheckScheduler() {
    const missed = checkMissedHealthCheck();
    if (!missed) {
        console.log(`[HEALTH CHECK] Scheduler started. Last check: ${healthStatus.lastCheckDate || 'Never'}`);
    }
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    if (nextCheckUpdateInterval) clearInterval(nextCheckUpdateInterval);
    healthCheckInterval = setInterval(() => {
        const now = getSriLankanTime();
        const today = getSriLankanDateString();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            if (healthStatus.lastCheckDate !== today) {
                console.log('[HEALTH CHECK] 12:00 AM - Starting daily check...');
                performDailyHealthCheck();
            }
        }
    }, 60000);
    nextCheckUpdateInterval = setInterval(() => {
        healthStatus.nextCheckTime = formatSriLankanTime(getNextCheckTime());
        if (githubEnabled) saveHealthToGitHub();
    }, 60000);
    console.log('[HEALTH CHECK] Scheduler active - checking every minute for 12:00 AM');
}

// ============================================
// RATE LIMITING
// ============================================

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    status: false,
    message: "Too many requests from this IP, please try again later."
  }
});
app.use('/download', limiter);
app.use('/search', limiter);
app.use('/ai', limiter);

// ============================================
// API CALL TRACKING MIDDLEWARE
// ============================================

app.use(['/download', '/search', '/ai'], async (req, res, next) => {
    const path = req.path;
    const validEndpoints = ['/youtubedl', '/youtubedl2', '/tiktokdl', 
        '/instagramdl', '/textphoto', '/freefire', '/chatgpt', '/aiart'];
    const isValidEndpoint = validEndpoints.some(endpoint => path.includes(endpoint));

    if (isValidEndpoint) {
        const endpointName = getEndpointName(path);
        const clientIp = req.headers['x-forwarded-for'] || req.ip || 'unknown';
        const fingerprint = getRequestFingerprint(clientIp, endpointName);
        
        if (wasRecentlyCounted(fingerprint)) {
            console.log(`[API CALL] ➜ ${endpointName} | SKIPPED (duplicate within 5s)`);
            return next();
        }

        stats.apiCalls++;
        stats.endpointCalls[endpointName] = (stats.endpointCalls[endpointName] || 0) + 1;
        stats.lastUpdated = new Date().toISOString();

        console.log(`[API CALL] ➜ ${endpointName} | Total: ${stats.apiCalls}`);

        broadcastStatsUpdate();

        saveStatsToLocal();
        if (githubEnabled) saveStatsToGitHub().catch(() => {});
    }
    next();
});

// ============================================
// HEALTH CHECK - Koyeb Optimized
// ============================================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================
// STATS ENDPOINTS (Updated for Live Updates)
// ============================================

app.get('/stats', (req, res) => {
  checkAndRollVisitors();
  const todayCount = stats.visitors || 0;
  const totalCount = (stats.totalVisitors || 0) + todayCount;
  res.json({
    apiCalls: stats.apiCalls,
    visitors: todayCount,
    totalVisitors: totalCount,
    endpointCalls: stats.endpointCalls,
    lastUpdated: stats.lastUpdated,
    githubBackup: githubEnabled,
    timestamp: new Date().toISOString()
  });
});

app.get('/stats/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const todayCount = stats.visitors || 0;
    const totalCount = (stats.totalVisitors || 0) + todayCount;
    const sendData = () => {
        const data = {
            apiCalls: stats.apiCalls,
            visitors: todayCount,
            totalVisitors: totalCount,
            endpointCalls: stats.endpointCalls,
            timestamp: new Date().toISOString()
        };
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    sendData();
    sseClients.add(res);
    const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
    }, 30000);
    req.on('close', () => {
        clearInterval(heartbeat);
        sseClients.delete(res);
        console.log(`[LIVE] Client disconnected. Total clients: ${sseClients.size}`);
    });
    console.log(`[LIVE] New client connected. Total clients: ${sseClients.size}`);
});

app.get('/health/status', (req, res) => {
    res.json({
        lastCheckDate: healthStatus.lastCheckDate,
        lastCheckTime: healthStatus.lastCheckTime,
        nextCheckTime: healthStatus.nextCheckTime,
        summary: healthStatus.summary,
        endpoints: healthStatus.endpoints,
        githubBackup: githubEnabled,
        websiteUrl: WEBSITE_URL
    });
});

// ============================================
// VISITOR TRACKING - IMMEDIATE ON PAGE LOAD
// ============================================

app.post('/stats/visitor', async (req, res) => {
    try {
        const { visitorId, fingerprint, userAgent, referrer } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.ip || 'unknown';
        const vid = visitorId || fingerprint || clientIp;
        const visitorKey = `${clientIp}:${vid}`;
        const now = Date.now();
        const lastVisit = recentVisitors.get(visitorKey);
        if (lastVisit && (now - lastVisit) < VISITOR_COOLDOWN) {
            console.log(`[VISITOR] Skipped (cooldown): ${vid.substring(0, 16)}...`);
            const todayCount = stats.visitors || 0;
            const totalCount = (stats.totalVisitors || 0) + todayCount;
            return res.json({ 
                success: true, 
                isNewVisitor: false,
                skipped: true,
                reason: 'cooldown',
                stats: { 
                    apiCalls: stats.apiCalls, 
                    visitors: todayCount,
                    totalVisitors: totalCount
                } 
            });
        }
        recentVisitors.set(visitorKey, now);
        if (recentVisitors.size > 1000) {
            const cutoff = now - VISITOR_COOLDOWN;
            for (const [key, timestamp] of recentVisitors.entries()) {
                if (timestamp < cutoff) {
                    recentVisitors.delete(key);
                }
            }
        }
        const visitorHash = crypto.createHash('sha256').update(vid).digest('hex').substring(0, 16);
        const isNewVisitor = addVisitor(visitorHash);
        const todayCount = stats.visitors || 0;
        const totalCount = (stats.totalVisitors || 0) + todayCount;
        console.log(`[VISITOR] Tracked: ${vid.substring(0, 16)}... | New: ${isNewVisitor} | Total: ${totalCount}`);
        res.json({ 
            success: true, 
            isNewVisitor: isNewVisitor,
            stats: { 
                apiCalls: stats.apiCalls, 
                visitors: todayCount,
                totalVisitors: totalCount
            } 
        });
    } catch (error) {
        console.error('[VISITOR] Error:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to track visitor',
            error: error.message
        });
    }
});

app.post('/stats/increment', (req, res) => {
  const { type, visitorId } = req.body;
  if (type === 'visitor') {
    const clientIp = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    const vid = visitorId || clientIp;
    const visitorHash = crypto.createHash('sha256').update(vid).digest('hex').substring(0, 16);
    const isNewVisitor = addVisitor(visitorHash);
    const todayCount = stats.visitors || 0;
    const totalCount = (stats.totalVisitors || 0) + todayCount;
    res.json({ 
        success: true, 
        isNewVisitor, 
        stats: { 
            apiCalls: stats.apiCalls, 
            visitors: todayCount,
            totalVisitors: totalCount
        } 
    });
  } else {
    res.status(400).json({ success: false, message: 'Invalid type' });
  }
});

app.post('/health/check', async (req, res) => {
    const result = await performDailyHealthCheck(true);
    res.json({
        success: true,
        message: 'Health check completed',
        result: result
    });
});

// ============================================
// API ROUTES - Original Endpoints
// ============================================

app.get('/download/youtubedl', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
      return res.status(400).json({ status: false, message: "Please provide a valid YouTube URL" });
    }
    const youtubeData = await youtubedl(url);
    res.json({ status: true, creator: "WALUKA🇱🇰", result: youtubeData });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ status: false, message: error.message });
  }
});

app.get('/download/youtubedl2', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || !url.includes('youtu')) {
      return res.status(400).json({ status: false, message: "Please provide a valid YouTube URL" });
    }
    const youtubeData = await youtubedl2(url);
    res.json({ status: true, creator: "WALUKA🇱🇰", result: youtubeData });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ status: false, message: error.message });
  }
});

app.get('/download/tiktokdl', async (req, res) => {
  try {
    if (!req.query.url) {
      return res.status(400).json({ success: false, message: "Please provide a valid Tiktok URL" });
    }
    const tiktokData = await tiktokdl(req.query.url);
    res.json({ status: true, creator: "WALUKA🇱🇰", result: tiktokData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/download/instagramdl', async (req, res) => {
  try {
    if (!req.query.url) {
      return res.status(400).json({ success: false, message: "Please provide a valid Instagram URL" });
    }
    const instagramData = await instagramdl(req.query.url);
    res.json({ status: true, creator: "WALUKA🇱🇰", result: instagramData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/search/freefire', async (req, res) => {
  try {
    const { region, uid } = req.query;
    if (!region || !uid) {
      return res.status(400).json({ status: false, message: "Please provide both region and uid parameters" });
    }
    const playerData = await freefireinfo(region, uid);
    res.json({ status: true, creator: "WALUKA🇱🇰", result: playerData });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ status: false, message: error.message });
  }
});

app.get('/download/textphoto', async (req, res) => {
  try {
    const { url, text } = req.query;
    if (!url) {
      return res.status(400).json({ status: false, message: "Please provide a URL parameter" });
    }
    if (!text) {
      return res.status(400).json({ status: false, message: "Please provide a text parameter" });
    }
    const result = await maker(url, text);
    res.json({ status: true, creator: "WALUKA🇱🇰", result: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.get('/ai/chatgpt', async (req, res) => {
  try {
    const { prompt, sessionId } = req.query;
    if (!prompt) {
      return res.status(400).json({ 
        status: false, 
        message: "Please provide a prompt parameter" 
      });
    }
    const result = await chatgptai(prompt, sessionId);
    if (result.success) {
      res.json({ 
        status: true, 
        creator: "WALUKA🇱🇰", 
        result: {
          query: prompt,
          response: result.response,
          model: result.model,
          sessionId: result.sessionId
        }
      });
    } else {
      res.status(500).json({ 
        status: false, 
        message: result.error 
      });
    }
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      status: false, 
      message: error.message 
    });
  }
});

app.get('/ai/chatgpt/clear', (req, res) => {
  try {
    const { sessionId } = req.query;
    const result = chatgptai.clearHistory(sessionId);
    res.json({ 
      status: true, 
      creator: "WALUKA🇱🇰", 
      result: result 
    });
  } catch (error) {
    res.status(500).json({ 
      status: false, 
      message: error.message 
    });
  }
});

// ============================================
// AI ART ENDPOINTS - MagicStudio Integration
// ============================================

app.get('/ai/aiart', async (req, res) => {
  try {
    const { prompt, format } = req.query;
    
    if (!prompt) {
      return res.status(400).json({ 
        status: false, 
        message: "Please provide a prompt parameter" 
      });
    }

    const result = await aiart(prompt, format || 'image');

    if (!result.success) {
      return res.status(500).json({
        status: false,
        creator: "WALUKA🇱🇰",
        message: result.message || result.error
      });
    }

    if (format === 'json') {
      return res.json({
        status: true,
        creator: "WALUKA🇱🇰",
        result: result.result
      });
    }

    if (result.buffer) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Length', result.size);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.end(result.buffer);
    }

    res.json({
      status: true,
      creator: "WALUKA🇱🇰",
      result: result.result
    });

  } catch (error) {
    console.error('AI Art API Error:', error);
    res.status(500).json({ 
      status: false, 
      message: error.message 
    });
  }
});

app.get('/ai/aiart/json', async (req, res) => {
  try {
    const { prompt } = req.query;
    
    if (!prompt) {
      return res.status(400).json({ 
        status: false, 
        message: "Please provide a prompt parameter" 
      });
    }

    const result = await aiart(prompt, 'json');

    if (result.success) {
      res.json({
        status: true,
        creator: "WALUKA🇱🇰",
        result: result.result
      });
    } else {
      res.status(500).json({
        status: false,
        message: result.message || result.error
      });
    }

  } catch (error) {
    console.error('AI Art JSON API Error:', error);
    res.status(500).json({ 
      status: false, 
      message: error.message 
    });
  }
});

// ============================================
// STATIC FILES
// ============================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// ERROR HANDLING - Added aiart endpoints
// ============================================

app.use((req, res) => {
  res.status(404).json({
    status: false,
    message: "Endpoint not found",
    availableEndpoints: [
      "/download/youtubedl",
      "/download/youtubedl2", 
      "/download/tiktokdl",
      "/download/instagramdl",
      "/download/textphoto",
      "/search/freefire",
      "/ai/chatgpt",
      "/ai/chatgpt/clear",
      "/ai/aiart",
      "/ai/aiart/json"
    ]
  });
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    status: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================
// START SERVER - Added AI Art
// ============================================

const PORT = process.env.PORT || 3000;

async function startServer() {
    console.log('[STARTUP] Starting SRI API V3.0 with AI Art Support...');
    console.log(`[CONFIG] Environment: ${process.env.NODE_ENV || 'development'}`);
    
    const githubLoaded = await loadStatsFromGitHub();
    if (!githubLoaded) loadStatsFromLocal();
    
    await loadHealthFromGitHub();
    
    startAutoSave();
    
    app.listen(PORT, '0.0.0.0', async () => {
        checkAndRollVisitors();
        
        const now = getSriLankanTime();
        const todaySL = getSriLankanDateString();
        
        if (!healthStatus.lastCheckDate || healthStatus.lastCheckDate !== todaySL) {
            console.log('[STARTUP] Running initial health check...');
            await performDailyHealthCheck(true);
        }
        
        startDailyHealthCheckScheduler();
        
        const todayCount = stats.visitors || 0;
        const totalCount = (stats.totalVisitors || 0) + todayCount;
        
        console.log(`
╔══════════════════════════════════════════╗
║           SRI API V3.0 + AI ART          ║
║       Server running on port ${PORT}        ║
║   URL: ${WEBSITE_URL.padEnd(28)}      ║
║                                          ║
║  Stats: ${stats.apiCalls} calls, ${todayCount} today, ${totalCount} total    ║
║  Health: ${healthStatus.summary.online}/${healthStatus.summary.total} online              ║
║  GitHub Backup: ${githubEnabled ? 'ENABLED ✅' : 'DISABLED ❌'}      ║
║  Local Backup: ENABLED ✅                ║
║  Live Updates: ENABLED ✅              ║
║                                          ║
║  Endpoints:                              ║
║  • /download/youtubedl                   ║
║  • /download/youtubedl2                  ║
║  • /download/tiktokdl                    ║
║  • /download/instagramdl                 ║
║  • /download/textphoto                   ║
║  • /search/freefire                      ║
║  • /ai/chatgpt                           ║
║  • /ai/aiart  ← NEW! 🎨                  ║
║  • /ai/aiart/json                        ║
║                                          ║
║  Health: /health                         ║
║  Stats:   /stats                         ║
║  Live:    /stats/stream                  ║
╚══════════════════════════════════════════╝
        `);
    });
}

startServer();

module.exports = app;
