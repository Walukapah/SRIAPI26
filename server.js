// server.js - Updated with Fixed Stats Tracking & Consistent Endpoint Names
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

const app = express();

// Trust proxy (required for Koyeb)
app.set('trust proxy', 1);
app.set('json spaces', 2);

// Middleware
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

// ============================================
// ENDPOINT NAME MAPPING - Consistent naming
// ============================================

const ENDPOINT_NAME_MAP = {
    'youtubedl': 'YouTube Downloader',
    'youtubedl2': 'YouTube Downloader V2',
    'tiktokdl': 'TikTok Downloader',
    'instagramdl': 'Instagram Downloader',
    'textphoto': 'Text to Photo',
    'freefire': 'Free Fire Player Info'
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
// STATS SYSTEM
// ============================================

let stats = {
    apiCalls: 0,
    visitors: {},
    endpointCalls: {},
    lastUpdated: new Date().toISOString()
};

// Track recently counted requests to prevent double counting
const recentRequests = new Map();
const REQUEST_CACHE_TIMEOUT = 5000; // 5 seconds

function getTodayString() {
    return new Date().toISOString().split('T')[0];
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

// ============================================
// GITHUB FUNCTIONS
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
        
        // Merge with validation
        stats.apiCalls = parsedStats.apiCalls || 0;
        stats.visitors = parsedStats.visitors || {};
        stats.endpointCalls = parsedStats.endpointCalls || {};
        stats.lastUpdated = parsedStats.lastUpdated || new Date().toISOString();
        
        // Clean up old endpoint names if any
        const cleanedEndpoints = {};
        Object.keys(stats.endpointCalls).forEach(key => {
            // Check if this is an old short name
            const cleanKey = ENDPOINT_NAME_MAP[key] || key;
            cleanedEndpoints[cleanKey] = (cleanedEndpoints[cleanKey] || 0) + stats.endpointCalls[key];
        });
        stats.endpointCalls = cleanedEndpoints;
        
        saveStatsToLocal();
        
        const today = getTodayString();
        const todayVisitors = stats.visitors[today] ? Object.keys(stats.visitors[today]).length : 0;
        console.log(`[STATS] Loaded from GitHub: ${stats.apiCalls} calls, ${todayVisitors} visitors today`);
        console.log(`[STATS] Endpoints:`, stats.endpointCalls);
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
        const statsData = {
            apiCalls: stats.apiCalls,
            visitors: stats.visitors,
            endpointCalls: stats.endpointCalls,
            lastUpdated: new Date().toISOString()
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
            message: `Update API stats - ${stats.apiCalls} calls`,
            content: contentEncoded,
            sha: sha || undefined,
        });

        const today = getTodayString();
        const todayVisitors = stats.visitors[today] ? Object.keys(stats.visitors[today]).length : 0;
        console.log(`[STATS] ✅ Saved to GitHub: ${stats.apiCalls} calls, ${todayVisitors} visitors today`);
        return true;
    } catch (error) {
        console.error('[STATS] ❌ Failed to save to GitHub:', error.message);
        if (error.status === 401) {
            console.error('[STATS] Token became invalid, disabling GitHub backup');
            githubEnabled = false;
        }
        return false;
    }
}

function saveStatsToLocal() {
    try {
        const statsData = {
            apiCalls: stats.apiCalls,
            visitors: stats.visitors,
            endpointCalls: stats.endpointCalls,
            lastUpdated: new Date().toISOString()
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
            
            stats.apiCalls = parsedStats.apiCalls || 0;
            stats.visitors = parsedStats.visitors || {};
            stats.endpointCalls = parsedStats.endpointCalls || {};
            stats.lastUpdated = parsedStats.lastUpdated || new Date().toISOString();
            
            // Clean up old endpoint names
            const cleanedEndpoints = {};
            Object.keys(stats.endpointCalls).forEach(key => {
                const cleanKey = ENDPOINT_NAME_MAP[key] || key;
                cleanedEndpoints[cleanKey] = (cleanedEndpoints[cleanKey] || 0) + stats.endpointCalls[key];
            });
            stats.endpointCalls = cleanedEndpoints;
            
            const today = getTodayString();
            const todayVisitors = stats.visitors[today] ? Object.keys(stats.visitors[today]).length : 0;
            console.log(`[STATS] Loaded from local: ${stats.apiCalls} calls, ${todayVisitors} visitors today`);
            return true;
        }
    } catch (error) {
        console.error('[STATS] Failed to load from local:', error.message);
    }
    return false;
}

function startAutoSave() {
    setInterval(async () => {
        saveStatsToLocal();
        if (githubEnabled) await saveStatsToGitHub();
    }, 60000);
    console.log('[STATS] Auto-save started (every 1 minute)');
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

// ============================================
// API CALL TRACKING MIDDLEWARE
// ============================================

app.use(['/download', '/search'], async (req, res, next) => {
    const path = req.path;
    const validEndpoints = ['/youtubedl', '/youtubedl2', '/tiktokdl', 
        '/instagramdl', '/textphoto', '/freefire'];
    const isValidEndpoint = validEndpoints.some(endpoint => path.includes(endpoint));

    if (isValidEndpoint) {
        const endpointName = getEndpointName(path);
        const clientIp = req.headers['x-forwarded-for'] || req.ip || 'unknown';
        const fingerprint = getRequestFingerprint(clientIp, endpointName);
        
        // Prevent double counting
        if (wasRecentlyCounted(fingerprint)) {
            console.log(`[API CALL] ➜ ${endpointName} | SKIPPED (duplicate within 5s)`);
            return next();
        }

        stats.apiCalls++;
        stats.endpointCalls[endpointName] = (stats.endpointCalls[endpointName] || 0) + 1;
        stats.lastUpdated = new Date().toISOString();

        // Track visitor
        const today = getTodayString();
        if (!stats.visitors[today]) stats.visitors[today] = {};
        const visitorHash = crypto.createHash('sha256').update(clientIp).digest('hex').substring(0, 16);
        const isNewVisitor = !stats.visitors[today][visitorHash];
        stats.visitors[today][visitorHash] = new Date().toISOString();

        console.log(`[API CALL] ➜ ${endpointName} | Total: ${stats.apiCalls} | New Visitor: ${isNewVisitor ? 'Yes' : 'No'}`);

        saveStatsToLocal();
        if (githubEnabled) saveStatsToGitHub().catch(() => {});
    }
    next();
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  const today = getTodayString();
  const todayVisitors = stats.visitors[today] ? Object.keys(stats.visitors[today]).length : 0;
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '3.0.0',
    githubBackup: githubEnabled,
    stats: {
        apiCalls: stats.apiCalls,
        visitors: todayVisitors
    }
  });
});

// ============================================
// STATS ENDPOINTS
// ============================================

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
    githubBackup: githubEnabled,
    timestamp: new Date().toISOString()
  });
});

// Frontend visitor tracking only (no API call tracking here)
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
    
    // Clean old data (30 days)
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

// ============================================
// API ROUTES
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

// ============================================
// STATIC FILES
// ============================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// ERROR HANDLING
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
      "/search/freefire"
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
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;

async function startServer() {
    console.log('[STARTUP] Starting SRI API V3.0...');
    
    const githubLoaded = await loadStatsFromGitHub();
    if (!githubLoaded) loadStatsFromLocal();
    
    startAutoSave();
    
    app.listen(PORT, '0.0.0.0', () => {
        const today = getTodayString();
        const todayVisitors = stats.visitors[today] ? Object.keys(stats.visitors[today]).length : 0;
        
        console.log(`
╔══════════════════════════════════════════╗
║           SRI API V3.0                   ║
║       Server running on port ${PORT}        ║
║                                          ║
║  Stats: ${stats.apiCalls} calls, ${todayVisitors} visitors today    ║
║  GitHub Backup: ${githubEnabled ? 'ENABLED ✅' : 'DISABLED ❌'}      ║
║  Local Backup: ENABLED ✅                ║
║                                          ║
║  Endpoints:                              ║
║  • /download/youtubedl                   ║
║  • /download/youtubedl2                  ║
║  • /download/tiktokdl                    ║
║  • /download/instagramdl                 ║
║  • /download/textphoto                   ║
║  • /search/freefire                      ║
║                                          ║
║  Health: /health                         ║
║  Stats:   /stats                         ║
╚══════════════════════════════════════════╝
        `);
    });
}

startServer();

module.exports = app;
