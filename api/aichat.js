// aichat.js - AI Chat using SurfSense API (from ai.py)
const axios = require('axios');

/**
 * AI Chat using SurfSense API
 * @param {string} prompt - User's message/prompt
 * @returns {Promise<Object>} - AI response
 */
async function aichat(prompt) {
    if (!prompt || typeof prompt !== 'string') {
        return {
            success: false,
            error: 'Please provide a prompt parameter'
        };
    }

    try {
        const url = "https://api.surfsense.com/api/v1/public/anon-chat/stream";
        
        const headers = {
            "authority": "api.surfsense.com",
            "accept": "*/*",
            "content-type": "application/json",
            "origin": "https://www.surfsense.com",
            "referer": "https://www.surfsense.com/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
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

        const response = await axios.post(url, payload, {
            headers: headers,
            responseType: 'stream'
        });

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
                    quota: quotaInfo
                });
            });
            
            response.data.on('error', (error) => {
                reject(error);
            });
        });

    } catch (error) {
        console.error('[AICHAT] Error:', error.message);
        
        // Handle rate limit error (HTTP 429)
        if (error.response && error.response.status === 429) {
            return {
                success: false,
                error: 'Rate limit reached. Anonymous users can perform up to 0 operations per day. Please try again later.',
                statusCode: 429
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

module.exports = aichat;
