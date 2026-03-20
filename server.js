// server.js - Updated with GitHub Integration for Stats Persistence
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

// Check if GitHub token is available
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
        octokit = new Octokit({
            auth: GITHUB_TOKEN
        });
        githubEnabled = true;
        console.log('[GITHUB] Octokit initialized successfully');
    } catch (error) {
        console.error('[GITHUB] Failed to initialize Octokit:', error.message);
        githubEnabled = false;
    }
} else {
    console.warn('[GITHUB] GITHUB_TOKEN not set, too short, or contains placeholder text');
    console.warn('[GITHUB] Token value preview:', GITHUB_TOKEN ? GITHUB_TOKEN.substring(0, 10) + '...' : 'undefined');
}

const STATS_FILE = 'api_stats.json';

// ============================================
// STATS SYSTEM - GitHub + Local Persistent Storage
// ============================================

// In-memory stats (will be synced with GitHub and local file)
let stats = {
    apiCalls: 0,
    visitors: new Set(),
    endpointCalls: {},
    lastUpdated: new Date().toISOString()
};

// Test GitHub connection
async function testGitHubConnection() {
    if (!octokit) {
        console.log('[GITHUB] No octokit instance, skipping connection test');
        return false;
    }
    
    try {
        console.log('[GITHUB] Testing connection to GitHub...');
        const { data: user } = await octokit.users.getAuthenticated();
        console.log(`[GITHUB] Authenticated as: ${user.login}`);
        
        // Test repo access
        try {
            const { data: repo } = await octokit.repos.get({
                owner: GITHUB_REPO_OWNER,
                repo: GITHUB_REPO_NAME
            });
            console.log(`[GITHUB] Repository access confirmed: ${repo.full_name}`);
            return true;
        } catch (repoError) {
            console.error(`[GITHUB] Cannot access repository ${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}:`, repoError.message);
            if (repoError.status === 404) {
                console.error('[GITHUB] Repository not found. Please create it or check the name.');
            } else if (repoError.status === 403) {
                console.error('[GITHUB] No permission to access repository. Check token scopes.');
            }
            return false;
        }
    } catch (error) {
        console.error('[GITHUB] Authentication test failed:', error.message);
        if (error.status === 401) {
            console.error('[GITHUB] Token is invalid or expired');
        }
        return false;
    }
}

// Load stats from GitHub on startup
async function loadStatsFromGitHub() {
    if (!githubEnabled || !octokit) {
        console.log('[STATS] GitHub not enabled, skipping GitHub load');
        return false;
    }

    // First test connection
    const connected = await testGitHubConnection();
    if (!connected) {
        console.log('[GITHUB] Connection test failed, disabling GitHub backup');
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
        
        // Convert visitors array back to Set
        stats.apiCalls = parsedStats.apiCalls || 0;
        stats.visitors = new Set(parsedStats.visitors || []);
        stats.endpointCalls = parsedStats.endpointCalls || {};
        stats.lastUpdated = parsedStats.lastUpdated || new Date().toISOString();
        
        // Also save locally as backup
        saveStatsToLocal();
        
        console.log(`[STATS] Loaded from GitHub: ${stats.apiCalls} calls, ${stats.visitors.size} visitors`);
        return true;
    } catch (error) {
        if (error.status === 404) {
            console.log('[STATS] No existing stats file on GitHub, will create new one');
            return true; // Return true so we know GitHub is working
        } else {
            console.error('[STATS] Failed to load from GitHub:', error.message);
            return false;
        }
    }
}

// Save stats to GitHub
async function saveStatsToGitHub() {
    if (!githubEnabled || !octokit) {
        return false;
    }

    try {
        const statsData = {
            apiCalls: stats.apiCalls,
            visitors: Array.from(stats.visitors),
            endpointCalls: stats.endpointCalls,
            lastUpdated: new Date().toISOString()
        };

        // Get current file SHA if exists
        let sha = null;
        try {
            const { data } = await octokit.repos.getContent({
                owner: GITHUB_REPO_OWNER,
                repo: GITHUB_REPO_NAME,
                path: STATS_FILE
            });
            sha = data.sha;
        } catch (err) {
            if (err.status !== 404) {
                console.error('[STATS] Error getting file SHA:', err.message);
            }
        }

        const contentEncoded = Buffer.from(JSON.stringify(statsData, null, 2)).toString('base64');

        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME,
            path: STATS_FILE,
            message: `Update API stats - ${stats.apiCalls} calls, ${stats.visitors.size} visitors`,
            content: contentEncoded,
            sha: sha || undefined,
        });

        console.log(`[STATS] ✅ Saved to GitHub: ${stats.apiCalls} calls, ${stats.visitors.size} visitors`);
        return true;
    } catch (error) {
        console.error('[STATS] ❌ Failed to save to GitHub:', error.message);
        if (error.status === 401) {
            console.error('[STATS] Token became invalid, disabling GitHub backup');
            githubEnabled = false;
        } else if (error.status === 403) {
            console.error('[STATS] Rate limit or permission issue');
        } else if (error.status === 404) {
            console.error('[STATS] Repository not found');
        }
        return false;
    }
}

// Save stats to local file
function saveStatsToLocal() {
    try {
        const statsData = {
            apiCalls: stats.apiCalls,
            visitors: Array.from(stats.visitors),
            endpointCalls: stats.endpointCalls,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(`./${STATS_FILE}`, JSON.stringify(statsData, null, 2));
        console.log(`[STATS] Saved locally: ${stats.apiCalls} calls, ${stats.visitors.size} visitors`);
        return true;
    } catch (error) {
        console.error('[STATS] Failed to save locally:', error.message);
        return false;
    }
}

// Load stats from local file
function loadStatsFromLocal() {
    try {
        if (fs.existsSync(`./${STATS_FILE}`)) {
            const content = fs.readFileSync(`./${STATS_FILE}`, 'utf8');
            const parsedStats = JSON.parse(content);
            
            stats.apiCalls = parsedStats.apiCalls || 0;
            stats.visitors = new Set(parsedStats.visitors || []);
            stats.endpointCalls = parsedStats.endpointCalls || {};
            stats.lastUpdated = parsedStats.lastUpdated || new Date().toISOString();
            
            console.log(`[STATS] Loaded from local: ${stats.apiCalls} calls, ${stats.visitors.size} visitors`);
            return true;
        }
    } catch (error) {
        console.error('[STATS] Failed to load from local:', error.message);
    }
    return false;
}

// Auto-save every minute (GitHub + Local)
function startAutoSave() {
    setInterval(async () => {
        // Always save locally
        saveStatsToLocal();
        
        // Try to save to GitHub if enabled
        if (githubEnabled) {
            await saveStatsToGitHub();
        }
    }, 60000); // Every 1 minute
    
    console.log('[STATS] Auto-save started (every 1 minute)');
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
    githubBackup: githubEnabled,
    stats: {
        apiCalls: stats.apiCalls,
        visitors: stats.visitors.size
    }
  });
});

// ============================================
// STATS ENDPOINTS
// ============================================

// Get stats
app.get('/stats', (req, res) => {
  res.json({
    apiCalls: stats.apiCalls,
    visitors: stats.visitors.size,
    endpointCalls: stats.endpointCalls,
    lastUpdated: stats.lastUpdated,
    githubBackup: githubEnabled,
    timestamp: new Date().toISOString()
  });
});

// Increment stats
app.post('/stats/increment', (req, res) => {
  const { type, endpoint } = req.body;
  
  if (type === 'visitor') {
    const visitorId = req.headers['x-forwarded-for'] || req.ip || crypto.randomUUID();
    const isNewVisitor = !stats.visitors.has(visitorId);
    stats.visitors.add(visitorId);
    
    res.json({ 
        success: true, 
        isNewVisitor,
        stats: {
            apiCalls: stats.apiCalls,
            visitors: stats.visitors.size
        }
    });
  } else if (type === 'apiCall') {
    stats.apiCalls++;
    if (endpoint) {
      stats.endpointCalls[endpoint] = (stats.endpointCalls[endpoint] || 0) + 1;
    }
    
    res.json({ 
        success: true, 
        stats: {
            apiCalls: stats.apiCalls,
            visitors: stats.visitors.size
        }
    });
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
      return res.status(400).json({ 
        status: false, 
        message: "Please provide a valid YouTube URL" 
      });
    }
    const youtubeData = await youtubedl(url);
    res.json({
      status: true,
      creator: "WALUKA🇱🇰",
      result: youtubeData
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      status: false, 
      message: error.message
    });
  }
});

app.get('/download/youtubedl2', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || !url.includes('youtu')) {
      return res.status(400).json({ 
        status: false, 
        message: "Please provide a valid YouTube URL" 
      });
    }
    const youtubeData = await youtubedl2(url);
    res.json({
      status: true,
      creator: "WALUKA🇱🇰",
      result: youtubeData
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      status: false, 
      message: error.message
    });
  }
});

app.get('/download/tiktokdl', async (req, res) => {
  try {
    if (!req.query.url) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid Tiktok URL"
      });
    }
    const tiktokData = await tiktokdl(req.query.url);
    res.json({
      status: true,
      creator: "WALUKA🇱🇰",
      result: tiktokData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/download/instagramdl', async (req, res) => {
  try {
    if (!req.query.url) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid Instagram URL"
      });
    }
    const instagramData = await instagramdl(req.query.url);
    res.json({
      status: true,
      creator: "WALUKA🇱🇰",
      result: instagramData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/search/freefire', async (req, res) => {
  try {
    const { region, uid } = req.query;
    if (!region || !uid) {
      return res.status(400).json({ 
        status: false, 
        message: "Please provide both region and uid parameters" 
      });
    }
    const playerData = await freefireinfo(region, uid);
    res.json({
      status: true,
      creator: "WALUKA🇱🇰",
      result: playerData
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ 
      status: false, 
      message: error.message
    });
  }
});

app.get('/download/textphoto', async (req, res) => {
  try {
    const { url, text } = req.query;
    if (!url) {
      return res.status(400).json({
        status: false,
        message: "Please provide a URL parameter"
      });
    }
    if (!text) {
      return res.status(400).json({
        status: false,
        message: "Please provide a text parameter"
      });
    }
    const result = await maker(url, text);
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
    
    // First try to load from GitHub
    const githubLoaded = await loadStatsFromGitHub();
    
    // If GitHub failed, try local
    if (!githubLoaded) {
        loadStatsFromLocal();
    }
    
    // Start auto-save
    startAutoSave();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`
╔══════════════════════════════════════════╗
║           SRI API V3.0                   ║
║       Server running on port ${PORT}        ║
║                                          ║
║  Stats: ${stats.apiCalls} calls, ${stats.visitors.size} visitors    ║
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
