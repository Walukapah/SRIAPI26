// server.js - Updated with GitHub storage for stats
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { Octokit } = require('@octokit/rest');

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
const GITHUB_CONFIG = {
  owner: 'Walukapaha',
  repo: 'SRI-API-STORE',
  path: 'stats.json',
  branch: 'main'
};

// Initialize Octokit with GitHub token from environment
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

// In-memory stats cache
let statsCache = {
  apiCalls: 0,
  visitors: new Set(),
  endpointCalls: {},
  lastSync: null
};

// ============================================
// GITHUB STATS MANAGEMENT
// ============================================

// Load stats from GitHub
async function loadStatsFromGitHub() {
  try {
    console.log('[GITHUB] Loading stats from GitHub...');
    
    const { data } = await octokit.repos.getContent({
      owner: GITHUB_CONFIG.owner,
      repo: GITHUB_CONFIG.repo,
      path: GITHUB_CONFIG.path,
      ref: GITHUB_CONFIG.branch
    });

    const content = Buffer.from(data.content, 'base64').toString('utf8');
    const savedStats = JSON.parse(content);
    
    // Restore stats
    statsCache.apiCalls = savedStats.apiCalls || 0;
    statsCache.endpointCalls = savedStats.endpointCalls || {};
    
    // Restore visitors (convert array back to Set)
    if (savedStats.visitors && Array.isArray(savedStats.visitors)) {
      statsCache.visitors = new Set(savedStats.visitors);
    }
    
    statsCache.lastSync = new Date().toISOString();
    
    console.log(`[GITHUB] Stats loaded: ${statsCache.apiCalls} API calls, ${statsCache.visitors.size} visitors`);
    return true;
  } catch (error) {
    if (error.status === 404) {
      console.log('[GITHUB] Stats file not found, creating new one...');
      await saveStatsToGitHub(true);
      return true;
    }
    console.error('[GITHUB] Error loading stats:', error.message);
    return false;
  }
}

// Save stats to GitHub
async function saveStatsToGitHub(isNew = false) {
  try {
    const statsData = {
      apiCalls: statsCache.apiCalls,
      visitors: Array.from(statsCache.visitors),
      endpointCalls: statsCache.endpointCalls,
      lastUpdated: new Date().toISOString(),
      serverVersion: '3.0.0'
    };

    const content = JSON.stringify(statsData, null, 2);
    const contentEncoded = Buffer.from(content).toString('base64');

    if (isNew) {
      // Create new file
      await octokit.repos.createOrUpdateFileContents({
        owner: GITHUB_CONFIG.owner,
        repo: GITHUB_CONFIG.repo,
        path: GITHUB_CONFIG.path,
        message: 'Initialize stats tracking',
        content: contentEncoded,
        branch: GITHUB_CONFIG.branch
      });
    } else {
      // Update existing file - need SHA
      const { data: existingFile } = await octokit.repos.getContent({
        owner: GITHUB_CONFIG.owner,
        repo: GITHUB_CONFIG.repo,
        path: GITHUB_CONFIG.path,
        ref: GITHUB_CONFIG.branch
      });

      await octokit.repos.createOrUpdateFileContents({
        owner: GITHUB_CONFIG.owner,
        repo: GITHUB_CONFIG.repo,
        path: GITHUB_CONFIG.path,
        message: `Update stats - API Calls: ${statsCache.apiCalls}, Visitors: ${statsCache.visitors.size}`,
        content: contentEncoded,
        sha: existingFile.sha,
        branch: GITHUB_CONFIG.branch
      });
    }

    statsCache.lastSync = new Date().toISOString();
    console.log(`[GITHUB] Stats saved: ${statsCache.apiCalls} calls, ${statsCache.visitors.size} visitors`);
    return true;
  } catch (error) {
    console.error('[GITHUB] Error saving stats:', error.message);
    return false;
  }
}

// Auto-save stats every 5 minutes
function startAutoSave() {
  setInterval(async () => {
    if (statsCache.lastSync) {
      await saveStatsToGitHub();
    }
  }, 5 * 60 * 1000); // 5 minutes
}

// Rate limiting
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
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '3.0.0',
    stats: {
      apiCalls: statsCache.apiCalls,
      visitors: statsCache.visitors.size,
      lastSync: statsCache.lastSync
    }
  });
});

// ============================================
// STATS ENDPOINTS (with GitHub persistence)
// ============================================

// Get stats
app.get('/stats', async (req, res) => {
  res.json({
    apiCalls: statsCache.apiCalls,
    visitors: statsCache.visitors.size,
    endpointCalls: statsCache.endpointCalls,
    lastSync: statsCache.lastSync,
    timestamp: new Date().toISOString()
  });
});

// Increment stats
app.post('/stats/increment', async (req, res) => {
  const { type, endpoint } = req.body;
  
  if (type === 'visitor') {
    const visitorId = req.headers['x-forwarded-for'] || req.ip;
    const wasNew = !statsCache.visitors.has(visitorId);
    statsCache.visitors.add(visitorId);
    
    // Save immediately if new visitor
    if (wasNew) {
      await saveStatsToGitHub();
    }
  } else if (type === 'apiCall') {
    statsCache.apiCalls++;
    if (endpoint) {
      statsCache.endpointCalls[endpoint] = (statsCache.endpointCalls[endpoint] || 0) + 1;
    }
    
    // Batch save - every 10 API calls
    if (statsCache.apiCalls % 10 === 0) {
      await saveStatsToGitHub();
    }
  }
  
  res.json({ 
    success: true, 
    stats: {
      apiCalls: statsCache.apiCalls,
      visitors: statsCache.visitors.size
    }
  });
});

// Force sync stats to GitHub (admin endpoint)
app.post('/stats/sync', async (req, res) => {
  const success = await saveStatsToGitHub();
  res.json({
    success,
    stats: {
      apiCalls: statsCache.apiCalls,
      visitors: statsCache.visitors.size,
      lastSync: statsCache.lastSync
    }
  });
});

// ============================================
// API ROUTES (with stats increment)
// ============================================

app.get('/download/youtubedl', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
      return res.status(400).json({ 
        status: false, 
        message: "Please provide a valid YouTube URL" 
      });
    }
    const youtubeData = await youtubedl(url);
    statsCache.apiCalls++;
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
    statsCache.apiCalls++;
    res.json({ status: true, creator: "WALUKA🇱🇰", result: youtubeData });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
});

app.get('/download/tiktokdl', async (req, res) => {
  try {
    if (!req.query.url) {
      return res.status(400).json({ success: false, message: "Please provide a valid Tiktok URL" });
    }
    const tiktokData = await tiktokdl(req.query.url);
    statsCache.apiCalls++;
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
    statsCache.apiCalls++;
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
    statsCache.apiCalls++;
    res.json({ status: true, creator: "WALUKA🇱🇰", result: playerData });
  } catch (error) {
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
    statsCache.apiCalls++;
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

async function initializeServer() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║       SRI API V3.0 - GitHub Sync         ║');
  console.log('╚══════════════════════════════════════════╝\n');
  
  await loadStatsFromGitHub();
  startAutoSave();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════╗
║           SRI API V3.0                   ║
║       Server running on port ${PORT}        ║
║                                          ║
║  📊 Stats synced to GitHub               ║
║  📁 Repo: Walukapaha/SRI-API-STORE       ║
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
║  Sync:    POST /stats/sync               ║
╚══════════════════════════════════════════╝
    `);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n[SIGTERM] Saving stats before shutdown...');
  await saveStatsToGitHub();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n[SIGINT] Saving stats before shutdown...');
  await saveStatsToGitHub();
  process.exit(0);
});

initializeServer();

module.exports = app;
