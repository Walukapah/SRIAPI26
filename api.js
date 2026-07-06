// api.js - API Registration System
// ඔයාට API එකක් add කරන්න මේ file එකේ විතරක් edit කරන්න

const apis = [
    {
        name: "YouTube Downloader",
        path: "/download/youtubedl",
        method: "GET",
        category: "download",
        description: "Download YouTube videos in multiple formats and qualities using ytsave.to API integration.",
        params: [
            { name: "url", type: "string", required: true, description: "YouTube video URL (youtube.com or youtu.be)", placeholder: "https://youtube.com/watch?v=dQw4w9WgXcQ" }
        ],
        handler: "youtubedl",
        importPath: "./api/youtubedl",
        validate: (req) => {
            const url = req.query.url;
            if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
                return { status: false, message: "Please provide a valid YouTube URL" };
            }
            return null;
        },
        transformResponse: (data) => ({ status: true, creator: "WALUKA🇱🇰", result: data })
    },
    {
        name: "YouTube Downloader V2",
        path: "/download/youtubedl2",
        method: "GET",
        category: "download",
        description: "Alternative YouTube downloader using ytdown.to API with enhanced format support.",
        params: [
            { name: "url", type: "string", required: true, description: "YouTube video URL", placeholder: "https://youtube.com/watch?v=dQw4w9WgXcQ" }
        ],
        handler: "youtubedl2",
        importPath: "./api/youtubedl2",
        validate: (req) => {
            const url = req.query.url;
            if (!url || !url.includes('youtu')) {
                return { status: false, message: "Please provide a valid YouTube URL" };
            }
            return null;
        },
        transformResponse: (data) => ({ status: true, creator: "WALUKA🇱🇰", result: data })
    },
    {
        name: "TikTok Downloader",
        path: "/download/tiktokdl",
        method: "GET",
        category: "download",
        description: "Download TikTok videos without watermark, with metadata and music extraction support.",
        params: [
            { name: "url", type: "string", required: true, description: "TikTok video URL (tiktok.com or vm.tiktok.com)", placeholder: "https://vt.tiktok.com/ZSuYLQkMm/" }
        ],
        handler: "tiktokdl",
        importPath: "./api/tiktokdl",
        validate: (req) => {
            if (!req.query.url) {
                return { success: false, message: "Please provide a valid Tiktok URL" };
            }
            return null;
        },
        transformResponse: (data) => ({ status: true, creator: "WALUKA🇱🇰", result: data })
    },
    {
        name: "Instagram Downloader",
        path: "/download/instagramdl",
        method: "GET",
        category: "download",
        description: "Download Instagram videos, reels, and images with thumbnail extraction.",
        params: [
            { name: "url", type: "string", required: true, description: "Instagram post/reel URL", placeholder: "https://www.instagram.com/reel/DKR-FW1yo_p/" }
        ],
        handler: "instagramdl",
        importPath: "./api/instagramdl",
        validate: (req) => {
            if (!req.query.url) {
                return { success: false, message: "Please provide a valid Instagram URL" };
            }
            return null;
        },
        transformResponse: (data) => ({ status: true, creator: "WALUKA🇱🇰", result: data })
    },
    {
        name: "Text to Photo",
        path: "/download/textphoto",
        method: "GET",
        category: "download",
        description: "Generate stylized text images using ephoto360, photooxy, and textpro templates.",
        params: [
            { name: "url", type: "string", required: true, description: "Template URL from ephoto360.com, photooxy.com, or textpro.me", placeholder: "https://textpro.me/create-naruto-logo-style-text-effect-online-1125.html" },
            { name: "text", type: "string", required: true, description: "First text parameter", placeholder: "SRI API W" }
        ],
        handler: "maker",
        importPath: "./api/textphoto",
        validate: (req) => {
            if (!req.query.url) return { status: false, message: "Please provide a URL parameter" };
            if (!req.query.text) return { status: false, message: "Please provide a text parameter" };
            return null;
        },
        transformResponse: (data) => ({ status: true, creator: "WALUKA🇱🇰", result: data })
    },
    {
        name: "Modrinth Plugin Download",
        path: "/download/modrithpl",
        method: "GET",
        category: "download",
        description: "Get full plugin details and all download links from Modrinth. Supports URLs, project IDs, and slugs.",
        params: [
            { name: "url", type: "string", required: true, description: "Modrinth plugin URL, project ID, or slug", placeholder: "https://modrinth.com/plugin/veinminer" }
        ],
        handler: "modrithpldownload",
        importPath: "./api/modrithpldownload",
        validate: (req) => {
            const id = req.query.url || req.query.id || req.query.slug || req.query.project;
            if (!id) {
                return { status: false, creator: "WALUKA🇱🇰", message: "Please provide a plugin identifier. Use ?url=, ?id=, ?slug=, or ?project=" };
            }
            return null;
        },
        transformResponse: (data) => ({ status: true, creator: "WALUKA🇱🇰", result: data })
    },
    {
        name: "PornPics Gallery Downloader",
        path: "/download/pornpicdl",
        method: "GET",
        category: "download",
        description: "Scrape and download gallery images from PornPics.",
        params: [
            { name: "url", type: "string", required: true, description: "PornPics gallery URL", placeholder: "https://www.pornpics.com/galleries/busty-asian-wife-spreads-her-hot-legs-wearing-thin-red-lacy-undies-58142926/" }
        ],
        handler: "pornpicdl",
        importPath: "./api/pornpicdl",
        validate: (req) => {
            if (!req.query.url) {
                return { status: false, creator: "WALUKA🇱🇰", message: "Please provide a gallery URL parameter (url)" };
            }
            return null;
        },
        transformResponse: (data) => ({ status: true, creator: "WALUKA🇱🇰", result: data })
    },
    {
        name: "Free Fire Player Info",
        path: "/search/freefire",
        method: "GET",
        category: "search",
        description: "Retrieve detailed player statistics, clan info, and profile data from Free Fire game.",
        params: [
            { name: "region", type: "string", required: true, description: "Game server region (e.g., SG, ID, BR, US)", placeholder: "SG" },
            { name: "uid", type: "string", required: true, description: "Player unique ID number", placeholder: "2326343985" }
        ],
        handler: "freefireinfo",
        importPath: "./api/freefireinfo",
        validate: (req) => {
            if (!req.query.region || !req.query.uid) {
                return { status: false, message: "Please provide both region and uid parameters" };
            }
            return null;
        },
        transformResponse: (data) => ({ status: true, creator: "WALUKA🇱🇰", result: data })
    },
    {
        name: "Modrinth Plugin Search",
        path: "/search/modrithpl",
        method: "GET",
        category: "search",
        description: "Search for Minecraft plugins/mods on Modrinth.",
        params: [
            { name: "query", type: "string", required: true, description: "Search query", placeholder: "veinminer" }
        ],
        handler: "modrithplsearch",
        importPath: "./api/modrithplsearch",
        validate: (req) => {
            const q = req.query.query || req.query.q;
            if (!q) {
                return { status: false, creator: "WALUKA🇱🇰", message: "Please provide a search query (use ?query= or ?q= parameter)" };
            }
            return null;
        },
        transformResponse: (data) => ({ status: true, creator: "WALUKA🇱🇰", result: data })
    },
    {
        name: "PornPics Search",
        path: "/search/pornpicsearch",
        method: "GET",
        category: "search",
        description: "Search PornPics for galleries, categories, tags, and pornstar pages.",
        params: [
            { name: "q", type: "string", required: false, description: "Search query (e.g., 'mia khalifa', 'latina')", placeholder: "mia khalifa" }
        ],
        handler: "pornpicsearch",
        importPath: "./api/pornpicsearch",
        validate: (req) => {
            if (!req.query.q) {
                return { status: false, creator: "WALUKA🇱🇰", message: "Please provide a query parameter (q)" };
            }
            return null;
        },
        transformResponse: (data) => ({ status: true, creator: "WALUKA🇱🇰", result: data.result || data })
    },
    {
        name: "AI Chat",
        path: "/ai/aichat",
        method: "GET",
        category: "ai",
        description: "Advanced AI chat powered by GPT-5.4-mini via SurfSense API.",
        params: [
            { name: "prompt", type: "string", required: true, description: "Your message or question to the AI", placeholder: "Hello, how are you?" }
        ],
        handler: "chatgptai",
        importPath: "./api/aichat",
        validate: (req) => {
            if (!req.query.prompt) {
                return { status: false, message: "Please provide a prompt parameter" };
            }
            return null;
        },
        transformResponse: (data) => {
            if (data.success) {
                return {
                    status: true,
                    creator: "WALUKA🇱🇰",
                    result: {
                        query: data.query || data.prompt,
                        response: data.response,
                        model: data.model,
                        messageId: data.messageId,
                        usage: data.usage,
                        quota: data.quota
                    }
                };
            }
            return { status: false, message: data.error };
        }
    },
    {
        name: "AI Art Generator",
        path: "/ai/aiart",
        method: "GET",
        category: "ai",
        description: "Generate AI art images using MagicStudio.",
        params: [
            { name: "prompt", type: "string", required: true, description: "Text description of the image you want to generate", placeholder: "a dragon sitting on castle wall at sunset" },
            { name: "format", type: "string", required: false, description: "Response format: 'image' for direct image, 'json' for base64 JSON", placeholder: "json" }
        ],
        handler: "aiart",
        importPath: "./api/aiart",
        isImageEndpoint: true,
        validate: (req) => {
            if (!req.query.prompt) {
                return { status: false, message: "Please provide a prompt parameter" };
            }
            return null;
        },
        transformResponse: (data, format) => {
            if (!data.success) {
                return { status: false, creator: "WALUKA🇱🇰", message: data.message || data.error };
            }
            if (format === 'json') {
                return { status: true, creator: "WALUKA🇱🇰", result: data.result };
            }
            // For image format, return special marker
            return { __IMAGE_RESPONSE__: true, buffer: data.buffer, size: data.size, result: data.result };
        }
    }
];

// Special endpoints that need custom routes
const specialEndpoints = {
    aiartJson: {
        path: "/ai/aiart/json",
        method: "GET",
        parentPath: "/ai/aiart",
        description: "AI Art Generator (JSON format)",
        forceFormat: "json"
    }
};

// Health check endpoints configuration
const healthCheckEndpoints = [
    { name: 'YouTube Downloader', path: '/download/youtubedl', method: 'GET', testParams: { url: 'https://youtube.com/watch?v=dQw4w9WgXcQ' } },
    { name: 'YouTube Downloader V2', path: '/download/youtubedl2', method: 'GET', testParams: { url: 'https://youtube.com/watch?v=dQw4w9WgXcQ' } },
    { name: 'TikTok Downloader', path: '/download/tiktokdl', method: 'GET', testParams: { url: 'https://vt.tiktok.com/ZSuYLQkMm/' } },
    { name: 'Instagram Downloader', path: '/download/instagramdl', method: 'GET', testParams: { url: 'https://www.instagram.com/reel/DKR-FW1yo_p/' } },
    { name: 'Text to Photo', path: '/download/textphoto', method: 'GET', testParams: { url: 'https://textpro.me/create-naruto-logo-style-text-effect-online-1125.html', text: 'Test' } },
    { name: 'Free Fire Player Info', path: '/search/freefire', method: 'GET', testParams: { region: 'SG', uid: '2326343985' } },
    { name: 'AI Chat', path: '/ai/aichat', method: 'GET', testParams: { prompt: 'Hello' } },
    { name: 'AI Art Generator', path: '/ai/aiart', method: 'GET', testParams: { prompt: 'a beautiful sunset', format: 'json' } },
    { name: 'Modrinth Plugin Search', path: '/search/modrithpl', method: 'GET', testParams: { query: 'veinminer' } },
    { name: 'Modrinth Plugin Download', path: '/download/modrithpl', method: 'GET', testParams: { url: 'https://modrinth.com/plugin/veinminer' } },
    { name: 'PornPics Search', path: '/search/pornpicsearch', method: 'GET', testParams: { q: 'latina' } },
    { name: 'PornPics Gallery Downloader', path: '/download/pornpicdl', method: 'GET', testParams: { url: 'https://www.pornpics.com/galleries/busty-asian-wife-spreads-her-hot-legs-wearing-thin-red-lacy-undies-58142926/' } }
];

// Endpoint name mapping for stats
const endpointNameMap = {
    'youtubedl': 'YouTube Downloader',
    'youtubedl2': 'YouTube Downloader V2',
    'tiktokdl': 'TikTok Downloader',
    'instagramdl': 'Instagram Downloader',
    'textphoto': 'Text to Photo',
    'freefire': 'Free Fire Player Info',
    'chatgpt': 'ChatGPT AI Chat',
    'aiart': 'AI Art Generator',
    'modrithpl': 'Modrinth Plugin Search',
    'modrithpldownload': 'Modrinth Plugin Download',
    'pornpicsearch': 'PornPics Search',
    'pornpicdl': 'PornPics Gallery Downloader'
};

// Valid endpoints for API call tracking
const validEndpoints = [
    '/youtubedl', '/youtubedl2', '/tiktokdl',
    '/instagramdl', '/textphoto', '/freefire',
    '/chatgpt', '/aiart', '/modrithpl',
    '/pornpicsearch', '/pornpicdl'
];

module.exports = {
    apis,
    specialEndpoints,
    healthCheckEndpoints,
    endpointNameMap,
    validEndpoints
};
