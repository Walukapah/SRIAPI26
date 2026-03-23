// server.js - Koyeb Optimized with GitHub-Based Health Check System
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { Octokit } = require('@octokit/rest');
const crypto = require('crypto');

// Import API modules
const youtubedl = require('./api/youtubedl');
const tiktokdl = require('./api/tiktokdl');
const instagramdl = require('./api/instagramdl');
const freefireinfo = require('./api/freefireinfo');
const maker = require('./api/textphoto');
const youtubedl2 = require('./api/youtubedl2');

const app = express();

app.set('trust proxy', 1);
app.set('json spaces', 2);

app.use(cors());
app.use(express.json());

// ============================================
// GITHUB CONFIGURATION
// ============================================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'Walukapah';
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || 'SRI-API-STORE';

console.log('[GITHUB] Environment check:');
console.log('[GITHUB] GITHUB_TOKEN exists:', !!GITHUB_TOKEN);
console.log('[GITHUB] GITHUB_TOKEN length:', GITHUB_TOKEN ? GITHUB_TOKEN.length : 0);

let octokit = null;
let githubEnabled = false;

if (GITHUB_TOKEN && GITHUB_TOKEN.length > 10 && !GITHUB_TOKEN.includes('your')) {
    try {
        octokit = new Octokit({ auth: GITHUB_TOKEN });
        githubEnabled = true;
        console.log('[GITHUB] Octokit initialized successfully');
    } catch (error) {
        console.error('[GITHUB] Failed to initialize Octokit:', error.message);
    }
}

const STATS_FILE = 'api_stats1.json';
const HEALTH_FILE = 'api_health.json'; // NEW: Separate health status file

// ============================================
// ENDPOINT CONFIGURATION
// ============================================

const ENDPOINTS_CONFIG = [
    { name: "YouTube Downloader", path: "/download/youtubedl", category: "download", method: "GET", description: "Download YouTube videos" },
    { name: "YouTube Downloader V2", path: "/download/youtubedl2", category: "download", method: "GET", description: "Alternative YouTube downloader" },
    { name: "TikTok Downloader", path: "/download/tiktokdl", category: "download", method: "GET", description: "Download TikTok videos" },
    { name: "Instagram Downloader", path: "/download/instagramdl", category: "download", method: "GET", description: "Download Instagram content" },
    { name: "Text to Photo", path: "/download/textphoto", category: "download", method: "GET", description: "Generate text images" },
    { name: "Free Fire Player Info", path: "/search/freefire", category: "search", method: "GET", description: "Free Fire player stats" }
];

// ============================================
// STATS SYSTEM
// ============================================

let stats = {
    apiCalls: 0,
    visitors: {},
    endpointCalls: {},
    lastUpdated: new Date().toISOString()
};

// ============================================
// HEALTH CHECK SYSTEM - GITHUB BASED
// ============================================

let healthStatus = {
    lastCheck: null,
    nextCheck: null,
    timezone: 'Asia/Colombo',
    endpoints: {},
    summary: { online: 0, offline: 0, total: 0 },
    isChecking: false
};

// Initialize endpoints health status
ENDPOINTS_CONFIG.forEach(ep => {
    healthStatus.endpoints[ep.path] = {
        name: ep.name,
        category: ep.category,
        status: 'unknown', // unknown, online, offline
        lastChecked: null,
        responseTime: null
    };
});

// Get Sri Lankan time
function getSriLankanTime() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: healthStatus.timezone }));
}

function formatSriLankanTime(date) {
    return date.toLocaleString('en-US', { 
        timeZone: healthStatus.timezone,
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
}

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

// ============================================
// GITHUB FUNCTIONS - STATS
// ============================================

async function loadStatsFromGitHub() {
    if (!githubEnabled || !octokit) return false;

    try {
        const { data } = await octokit.repos.getContent({
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME,
            path: STATS_FILE
        });

        const content = Buffer.from(data.content, 'base64').toString('utf8');
        const parsedStats = JSON.parse(content);
        
        stats.apiCalls = parsedStats.apiCalls || 0;
        stats.visitors = parsedStats.visitors || {};
        stats.endpointCalls = parsedStats.endpointCalls || {};
        stats.lastUpdated = parsedStats.lastUpdated || new Date().toISOString();
        
        saveStatsToLocal();
        console.log(`[STATS] Loaded from GitHub: ${stats.apiCalls} calls`);
        return true;
    } catch (error) {
        if (error.status === 404) {
            console.log('[STATS] No existing stats file on GitHub');
            return true;
        }
        console.error('[STATS] Failed to load from GitHub:', error.message);
        return false;
    }
}

async function saveStatsToGitHub() {
    if (!githubEnabled || !octokit) return false;

    try {
        let sha = null;
        try {
            const { data } = await octokit.repos.getContent({
                owner: GITHUB_REPO_OWNER,
                repo: GITHUB_REPO_NAME,
                path: STATS_FILE
            });
            sha = data.sha;
        } catch (err) {
            if (err.status !== 404) throw err;
        }

        const contentEncoded = Buffer.from(JSON.stringify(stats, null, 2)).toString('base64');

        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME,
            path: STATS_FILE,
            message: `Update API stats - ${stats.apiCalls} calls`,
            content: contentEncoded,
            sha: sha || undefined,
        });

        console.log(`[STATS] Saved to GitHub: ${stats.apiCalls} calls`);
        return true;
    } catch (error) {
        console.error('[STATS] Failed to save to GitHub:', error.message);
        return false;
    }
}

function saveStatsToLocal() {
    try {
        fs.writeFileSync(`./${STATS_FILE}`, JSON.stringify(stats, null, 2));
    } catch (error) {
        console.error('[STATS] Failed to save locally:', error.message);
    }
}

function loadStatsFromLocal() {
    try {
        if (fs.existsSync(`./${STATS_FILE}`)) {
            const content = fs.readFileSync(`./${STATS_FILE}`, 'utf8');
            const parsedStats = JSON.parse(content);
            stats = { ...stats, ...parsedStats };
            console.log(`[STATS] Loaded from local: ${stats.apiCalls} calls`);
            return true;
        }
    } catch (error) {
        console.error('[STATS] Failed to load from local:', error.message);
    }
    return false;
}

// ============================================
// GITHUB FUNCTIONS - HEALTH STATUS
// ============================================

async function loadHealthFromGitHub() {
    if (!githubEnabled || !octokit) {
        console.log('[HEALTH] GitHub not enabled, using local health data');
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
        
        healthStatus.lastCheck = parsedHealth.lastCheck;
        healthStatus.nextCheck = parsedHealth.nextCheck;
        healthStatus.endpoints = parsedHealth.endpoints || healthStatus.endpoints;
        healthStatus.summary = parsedHealth.summary || { online: 0, offline: 0, total: 0 };
        
        saveHealthToLocal();
        
        const checkTime = healthStatus.lastCheck ? formatSriLankanTime(new Date(healthStatus.lastCheck)) : 'Never';
        console.log(`[HEALTH] Loaded from GitHub: Last check ${checkTime}`);
        console.log(`[HEALTH] Status: ${healthStatus.summary.online}/${healthStatus.summary.total} online`);
        return true;
    } catch (error) {
        if (error.status === 404) {
            console.log('[HEALTH] No existing health file on GitHub, creating new');
            await saveHealthToGitHub();
            return true;
        }
        console.error('[HEALTH] Failed to load from GitHub:', error.message);
        return loadHealthFromLocal();
    }
}

async function saveHealthToGitHub() {
    if (!githubEnabled || !octokit) {
        console.log('[HEALTH] GitHub not enabled, saving locally only');
        return saveHealthToLocal();
    }

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
            if (err.status !== 404) throw err;
        }

        const contentEncoded = Buffer.from(JSON.stringify(healthStatus, null, 2)).toString('base64');

        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME,
            path: HEALTH_FILE,
            message: `Update health status - ${healthStatus.summary.online}/${healthStatus.summary.total} online`,
            content: contentEncoded,
            sha: sha || undefined,
        });

        console.log(`[HEALTH] Saved to GitHub: ${healthStatus.summary.online}/${healthStatus.summary.total} online`);
        return true;
    } catch (error) {
        console.error('[HEALTH] Failed to save to GitHub:', error.message);
        return saveHealthToLocal();
    }
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
            healthStatus = { ...healthStatus, ...parsedHealth };
            console.log(`[HEALTH] Loaded from local file`);
            return true;
        }
    } catch (error) {
        console.error('[HEALTH] Failed to load from local:', error.message);
    }
    return false;
}

// ============================================
// HEALTH CHECK LOGIC
// ============================================

async function checkSingleEndpoint(endpointConfig) {
    const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
    let testUrl = `${baseUrl}${endpointConfig.path}`;

    // Add dummy params if needed
    if (endpointConfig.path === '/download/youtubedl' || endpointConfig.path === '/download/youtubedl2') {
        testUrl += '?url=https://youtube.com/watch?v=dQw4w9WgXcQ';
    } else if (endpointConfig.path === '/download/tiktokdl') {
        testUrl += '?url=https://vt.tiktok.com/ZSuYLQkMm/';
    } else if (endpointConfig.path === '/download/instagramdl') {
        testUrl += '?url=https://www.instagram.com/reel/test/';
    } else if (endpointConfig.path === '/download/textphoto') {
        testUrl += '?url=https://textpro.me/test.html&text=test';
    } else if (endpointConfig.path === '/search/freefire') {
        testUrl += '?region=SG&uid=123456';
    }

    const startTime = Date.now();

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        const response = await fetch(testUrl, { 
            method: 'GET', 
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });

        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;

        let isOnline = false;
        let apiStatus = null;

        if (response.ok) {
            try {
                const data = await response.json();
                apiStatus = data.status;

                // ✅ FIXED: API is ONLINE only if response has {"status": true}
                // OFFLINE if {"status": false}, null, undefined, or any other value
                if (data && data.status === true) {
                    isOnline = true;
                    console.log(`[HEALTH] ✅ ${endpointConfig.name}: ONLINE (status: true)`);
                } else {
                    isOnline = false;
                    console.log(`[HEALTH] ❌ ${endpointConfig.name}: OFFLINE (status: ${data?.status})`);
                }
            } catch (e) {
                // Invalid JSON = OFFLINE
                isOnline = false;
                console.log(`[HEALTH] ❌ ${endpointConfig.name}: OFFLINE (invalid JSON response)`);
            }
        } else {
            // HTTP error = OFFLINE
            isOnline = false;
            console.log(`[HEALTH] ❌ ${endpointConfig.name}: OFFLINE (HTTP ${response.status})`);
        }

        return {
            status: isOnline ? 'online' : 'offline',
            responseTime: responseTime,
            error: null,
            apiStatus: apiStatus
        };

    } catch (error) {
        console.log(`[HEALTH] ❌ ${endpointConfig.name}: OFFLINE (error: ${error.message})`);
        return {
            status: 'offline',
            responseTime: Date.now() - startTime,
            error: error.message,
            apiStatus: null
        };
    }
}

async function performHealthCheck(force = false) {
    if (healthStatus.isChecking && !force) {
        console.log('[HEALTH] Check already in progress, skipping...');
        return;
    }

    const now = getSriLankanTime();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Check if already checked today at 12 AM (unless forced)
    if (!force && healthStatus.lastCheck) {
        const lastCheck = new Date(healthStatus.lastCheck);
        const lastCheckSL = new Date(lastCheck.toLocaleString("en-US", { timeZone: healthStatus.timezone }));
        
        // If last check was today after 12:00 AM, skip
        if (lastCheckSL.getDate() === now.getDate() && 
            lastCheckSL.getMonth() === now.getMonth() &&
            lastCheckSL.getFullYear() === now.getFullYear() &&
            lastCheckSL.getHours() >= 0) {
            console.log('[HEALTH] Already checked today, skipping...');
            return;
        }
    }

    console.log('[HEALTH] Starting health check at', formatSriLankanTime(now));
    healthStatus.isChecking = true;

    let onlineCount = 0;
    let offlineCount = 0;

    // Check all endpoints
    for (const endpoint of ENDPOINTS_CONFIG) {
        console.log(`[HEALTH] Checking ${endpoint.name}...`);
        
        const result = await checkSingleEndpoint(endpoint);
        
        healthStatus.endpoints[endpoint.path] = {
            name: endpoint.name,
            category: endpoint.category,
            status: result.status,
            lastChecked: new Date().toISOString(),
            responseTime: result.responseTime
        };

        if (result.status === 'online') {
            onlineCount++;
        } else {
            offlineCount++;
        }

        // Small delay between checks to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    healthStatus.lastCheck = new Date().toISOString();
    healthStatus.summary = {
        online: onlineCount,
        offline: offlineCount,
        total: ENDPOINTS_CONFIG.length
    };
    healthStatus.isChecking = false;

    // Calculate next check (tomorrow 12:00 AM)
    const nextCheck = new Date(now);
    nextCheck.setDate(nextCheck.getDate() + 1);
    nextCheck.setHours(0, 0, 0, 0);
    healthStatus.nextCheck = nextCheck.toISOString();

    console.log(`[HEALTH] Check completed: ${onlineCount}/${ENDPOINTS_CONFIG.length} online`);
    
    // Save to GitHub
    await saveHealthToGitHub();
    
    return healthStatus.summary;
}

// ============================================
// SCHEDULER - 12:00 AM DAILY CHECK
// ============================================

function startHealthCheckScheduler() {
    console.log('[HEALTH] Starting scheduler...');

    // Check immediately on startup if needed
    checkAndRunHealthCheck();

    // Run every minute to check if it's time
    setInterval(() => {
        checkAndRunHealthCheck();
    }, 60000); // Every minute

    console.log('[HEALTH] Scheduler started - checks daily at 12:00 AM SL time');
}

async function checkAndRunHealthCheck() {
    const now = getSriLankanTime();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Only run at 12:00 AM (00:00)
    if (currentHour === 0 && currentMinute === 0) {
        // Double check we haven't already run today
        if (healthStatus.lastCheck) {
            const lastCheck = new Date(healthStatus.lastCheck);
            const lastCheckSL = new Date(lastCheck.toLocaleString("en-US", { timeZone: healthStatus.timezone }));
            
            if (lastCheckSL.getDate() === now.getDate()) {
                return; // Already checked today
            }
        }
        
        console.log('[HEALTH] 12:00 AM - Starting daily health check');
        await performHealthCheck();
    }
}

// ============================================
// SERVER STARTUP CHECK
// ============================================

async function checkHealthOnStartup() {
    console.log('[STARTUP] Checking if health check is needed...');
    
    const now = getSriLankanTime();
    
    if (!healthStatus.lastCheck) {
        console.log('[STARTUP] No previous health check found, running now...');
        await performHealthCheck(true);
        return;
    }

    const lastCheck = new Date(healthStatus.lastCheck);
    const lastCheckSL = new Date(lastCheck.toLocaleString("en-US", { timeZone: healthStatus.timezone }));
    
    // Check if last check was today
    const isToday = lastCheckSL.getDate() === now.getDate() && 
                    lastCheckSL.getMonth() === now.getMonth() &&
                    lastCheckSL.getFullYear() === now.getFullYear();

    if (!isToday) {
        // Check if it's past 12:00 AM
        if (now.getHours() >= 0) {
            console.log('[STARTUP] New day, health check not run yet, running now...');
            await performHealthCheck(true);
        } else {
            console.log('[STARTUP] Waiting for 12:00 AM to run health check');
        }
    } else {
        console.log('[STARTUP] Health check already completed today at', formatSriLankanTime(lastCheckSL));
    }
}

// ============================================
// API ROUTES - HEALTH
// ============================================

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// NEW: Health status endpoint for frontend
app.get('/health/status', async (req, res) => {
    // Reload from GitHub to get latest
    if (githubEnabled) {
        await loadHealthFromGitHub();
    }
    
    res.json({
        lastCheck: healthStatus.lastCheck,
        nextCheck: healthStatus.nextCheck,
        timezone: healthStatus.timezone,
        summary: healthStatus.summary,
        endpoints: healthStatus.endpoints,
        isChecking: healthStatus.isChecking,
        timestamp: new Date().toISOString()
    });
});

// NEW: Force health check (for admin use)
app.post('/health/check', async (req, res) => {
    // Optional: Add authentication here
    const result = await performHealthCheck(true);
    res.json({
        success: true,
        result: result,
        timestamp: new Date().toISOString()
    });
});

// ============================================
// EXISTING API ROUTES
// ============================================

const recentRequests = new Map();
const REQUEST_CACHE_TIMEOUT = 5000;

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

function getEndpointName(path) {
    const parts = path.split('/').filter(p => p);
    const lastPart = parts[parts.length - 1] || path;
    return lastPart
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .replace(/dl$/i, ' Downloader');
}

// Stats tracking middleware
app.use(['/download', '/search'], async (req, res, next) => {
    const path = req.path;
    const validEndpoints = ['/youtubedl', '/youtubedl2', '/tiktokdl', 
        '/instagramdl', '/textphoto', '/freefire'];
    const isValidEndpoint = validEndpoints.some(endpoint => path.includes(endpoint));

    if (isValidEndpoint) {
        const endpointName = getEndpointName(path);
        const clientIp = req.headers['x-forwarded-for'] || req.ip || 'unknown';
        const fingerprint = getRequestFingerprint(clientIp, endpointName);
        
        if (wasRecentlyCounted(fingerprint)) {
            console.log(`[API CALL] ➜ ${endpointName} | SKIPPED (duplicate)`);
            return next();
        }

        stats.apiCalls++;
        stats.endpointCalls[endpointName] = (stats.endpointCalls[endpointName] || 0) + 1;
        stats.lastUpdated = new Date().toISOString();

        const today = getTodayString();
        if (!stats.visitors[today]) stats.visitors[today] = {};
        const visitorHash = crypto.createHash('sha256').update(clientIp).digest('hex').substring(0, 16);
        stats.visitors[today][visitorHash] = new Date().toISOString();

        console.log(`[API CALL] ➜ ${endpointName} | Total: ${stats.apiCalls}`);

        saveStatsToLocal();
        if (githubEnabled) saveStatsToGitHub().catch(() => {});
    }
    next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { status: false, message: "Too many requests" }
});
app.use('/download', limiter);
app.use('/search', limiter);

// Stats endpoints
app.get('/stats', (req, res) => {
  const today = getTodayString();
  const todayVisitors = stats.visitors[today] ? Object.keys(stats.visitors[today]).length : 0;
  
  let totalUniqueVisitors = 0;
  Object.values(stats.visitors).forEach(dayVisitors => {
    totalUniqueVisitors += Object.keys(dayVisitors).length;
  });
  
  res.json({
    apiCalls: stats.apiCalls,
    visitors: todayVisitors,
    totalVisitors: totalUniqueVisitors,
    endpointCalls: stats.endpointCalls,
    lastUpdated: stats.lastUpdated,
    githubBackup: githubEnabled
  });
});

app.post('/stats/increment', (req, res) => {
  const { type, visitorId } = req.body;
  const today = getTodayString();
  
  if (type === 'visitor') {
    const clientIp = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    const vid = visitorId || clientIp;
    const visitorHash = crypto.createHash('sha256').update(vid).digest('hex').substring(0, 16);
    
    if (!stats.visitors[today]) stats.visitors[today] = {};
    const isNewVisitor = !stats.visitors[today][visitorHash];
    stats.visitors[today][visitorHash] = new Date().toISOString();
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    Object.keys(stats.visitors).forEach(date => {
        if (new Date(date) < thirtyDaysAgo) delete stats.visitors[date];
    });
    
    const todayCount = Object.keys(stats.visitors[today]).length;
    res.json({ success: true, isNewVisitor, stats: { apiCalls: stats.apiCalls, visitors: todayCount } });
  } else {
    res.status(400).json({ success: false, message: 'Invalid type' });
  }
});

// API Routes
app.get('/download/youtubedl', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
      return res.status(400).json({ status: false, message: "Valid YouTube URL required" });
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
      return res.status(400).json({ status: false, message: "Valid YouTube URL required" });
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
      return res.status(400).json({ success: false, message: "TikTok URL required" });
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
      return res.status(400).json({ success: false, message: "Instagram URL required" });
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
      return res.status(400).json({ status: false, message: "Region and UID required" });
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
    if (!url || !text) {
      return res.status(400).json({ status: false, message: "URL and text required" });
    }
    const result = await maker(url, text);
    res.json({ status: true, creator: "WALUKA🇱🇰", result: result });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

// Static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// Error handling
app.use((req, res) => {
  res.status(404).json({
    status: false,
    message: "Endpoint not found",
    availableEndpoints: ENDPOINTS_CONFIG.map(e => e.path)
  });
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    status: false,
    message: "Internal server error"
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

async function startServer() {
    console.log('[STARTUP] Starting SRI API V3.0...');
    
    // Load stats
    const githubLoaded = await loadStatsFromGitHub();
    if (!githubLoaded) loadStatsFromLocal();
    
    // Load health status
    await loadHealthFromGitHub();
    
    // Check if health check needed on startup
    await checkHealthOnStartup();
    
    // Start scheduler
    startHealthCheckScheduler();
    
    // Auto-save stats
    setInterval(async () => {
        saveStatsToLocal();
        if (githubEnabled) await saveStatsToGitHub();
    }, 60000);
    
    app.listen(PORT, '0.0.0.0', () => {
        const today = getTodayString();
        const todayVisitors = stats.visitors[today] ? Object.keys(stats.visitors[today]).length : 0;
        
        console.log(`
╔══════════════════════════════════════════╗
║           SRI API V3.0                   ║
║       Server running on port ${PORT}        ║
║                                          ║
║  Stats: ${stats.apiCalls} calls, ${todayVisitors} visitors    ║
║  Health: ${healthStatus.summary.online}/${healthStatus.summary.total} endpoints online    ║
║  GitHub: ${githubEnabled ? 'ENABLED ✅' : 'DISABLED ❌'}      ║
╚══════════════════════════════════════════╝
        `);
    });
}

startServer();

module.exports = app;
