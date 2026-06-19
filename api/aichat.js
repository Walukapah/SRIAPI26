// aichat.js - SurfSense with session handling (less reliable)
const axios = require('axios');

// Store session data
let sessionData = {
    cookie: null,
    lastUsed: 0
};

async function aichat(prompt) {
    if (!prompt || typeof prompt !== 'string') {
        return { success: false, error: 'Please provide a prompt parameter' };
    }

    try {
        const url = "https://api.surfsense.com/api/v1/public/anon-chat/stream";
        
        // Try to get fresh session first (this simulates browser visit)
        // NOTE: This won't fully work without actual browser automation
        const headers = {
            "authority": "api.surfsense.com",
            "accept": "*/*",
            "content-type": "application/json",
            "origin": "https://www.surfsense.com",
            "referer": "https://www.surfsense.com/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "x-requested-with": "XMLHttpRequest"
        };

        const payload = {
            "model_slug": "gpt-5.4-mini-no-login",
            "messages": [{ "role": "user", "content": prompt }]
        };

        const response = await axios.post(url, payload, {
            headers: headers,
            responseType: 'stream',
            timeout: 30000
        });

        // ... (same stream parsing code as before)
        let fullResponse = '';
        let messageId = null;
        let tokenUsage = null;
        let quotaInfo = null;

        return new Promise((resolve, reject) => {
            let buffer = '';
            
            response.data.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop();
                
                for (const line of lines) {
                    if (!line.trim() || !line.startsWith('data: ')) continue;
                    const dataStr = line.substring(6).trim();
                    if (dataStr === '[DONE]') continue;
                    
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.type === 'start' && data.messageId) messageId = data.messageId;
                        if (data.type === 'text-delta' && data.delta) fullResponse += data.delta;
                        if (data.type === 'data-token-usage' && data.data) tokenUsage = data.data;
                        if (data.type === 'data-anon-quota' && data.data) quotaInfo = data.data;
                    } catch (e) {}
                }
            });
            
            response.data.on('end', () => {
                resolve({
                    success: true,
                    response: fullResponse.trim(),
                    messageId: messageId,
                    model: "gpt-5.4-mini-no-login",
                    usage: tokenUsage,
                    quota: quotaInfo
                });
            });
            
            response.data.on('error', reject);
        });

    } catch (error) {
        console.error('[AICHAT] Error:', error.message);
        
        // CAPTCHA error handling
        if (error.response?.status === 403) {
            const errorData = error.response?.data;
            if (typeof errorData === 'string' && errorData.includes('CAPTCHA_REQUIRED')) {
                return {
                    success: false,
                    error: 'CAPTCHA required. The SurfSense API now requires browser verification. Please switch to an alternative API.',
                    statusCode: 403,
                    suggestion: 'Use Pollinations AI or another captcha-free API instead.'
                };
            }
        }
        
        if (error.response?.status === 429) {
            return {
                success: false,
                error: 'Rate limit reached. Please try again later.',
                statusCode: 429
            };
        }
        
        if (error.response) {
            return {
                success: false,
                error: `API Error: ${error.response.status} - ${error.response.statusText}`,
                statusCode: error.response.status
            };
        }
        
        return { success: false, error: error.message || 'Failed to get AI response' };
    }
}

module.exports = aichat;
