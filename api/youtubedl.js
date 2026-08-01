// api/youtubedl.js - YouTube Downloader API
// https://sriyoutube.onrender.com/youtube?url=URL

const axios = require('axios');

/**
 * Fetch YouTube video info from sriyoutube API
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} - Full API response with video_details, formats, channel
 */
async function youtubedl(url) {
    try {
        const apiUrl = `https://sriyoutube.onrender.com/youtube?url=${encodeURIComponent(url)}`;
        
        const response = await axios.get(apiUrl, {
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0'
            }
        });

        const data = response.data;

        // Validate response structure
        if (!data || !data.video_details || !data.formats) {
            return {
                status: false,
                message: 'Invalid response from upstream API'
            };
        }

        // Return full response as-is
        return {
            status: true,
            video_details: data.video_details,
            formats: data.formats,
            channel: data.channel
        };

    } catch (error) {
        console.error('[YouTubeDL] Error:', error.message);
        
        if (error.response) {
            return {
                status: false,
                message: error.response.data?.message || error.response.data?.error || `Upstream API error: ${error.response.status}`,
                statusCode: error.response.status
            };
        }
        
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return {
                status: false,
                message: 'Request timed out. The upstream API is taking too long to respond.'
            };
        }

        return {
            status: false,
            message: error.message || 'Failed to fetch YouTube video info'
        };
    }
}

module.exports = youtubedl;
