const axios = require('axios');

// In-memory conversation history storage
const conversationHistory = new Map();

/**
 * ChatGPT AI Chat using SurfSense API
 * @param {string} prompt - User message
 * @param {string} sessionId - Optional session ID for conversation continuity
 * @returns {Object} - Response object with success flag
 */
async function chatgptai(prompt, sessionId = null) {
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

        // Build messages array with conversation history
        let messages = [];

        if (sessionId && conversationHistory.has(sessionId)) {
            messages = [...conversationHistory.get(sessionId)];
        }

        // Add current user message
        messages.push({
            role: "user",
            content: prompt
        });

        const payload = {
            model_slug: "gpt-5.4-mini-no-login",
            messages: messages
        };

        const response = await axios.post(url, payload, {
            headers: headers,
            responseType: 'stream'
        });

        // Collect stream data
        let fullResponse = '';
        let buffer = '';

        return new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                const chunkStr = chunk.toString('utf8');
                buffer += chunkStr;

                // Process SSE format lines
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.trim().startsWith('data: ')) {
                        const dataStr = line.trim().substring(6);

                        if (dataStr === '[DONE]') {
                            continue;
                        }

                        try {
                            const data = JSON.parse(dataStr);

                            // Handle text-delta type
                            if (data.type === 'text-delta' && data.delta) {
                                fullResponse += data.delta;
                            }

                            // Handle text-start
                            if (data.type === 'text-start') {
                                // Text generation started
                            }

                            // Handle text-end
                            if (data.type === 'text-end') {
                                // Text generation ended
                            }

                        } catch (e) {
                            // Not valid JSON, might be raw text
                            if (dataStr && dataStr !== '[DONE]') {
                                // Try to extract text from non-JSON responses
                            }
                        }
                    }
                }
            });

            response.data.on('end', () => {
                // Process any remaining buffer
                if (buffer.trim().startsWith('data: ')) {
                    const dataStr = buffer.trim().substring(6);
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.type === 'text-delta' && data.delta) {
                            fullResponse += data.delta;
                        }
                    } catch (e) {
                        // Ignore parse errors for remaining buffer
                    }
                }

                // Store conversation history if sessionId provided
                if (sessionId) {
                    messages.push({
                        role: "assistant",
                        content: fullResponse
                    });

                    // Keep only last 20 messages to prevent memory issues
                    if (messages.length > 20) {
                        messages = messages.slice(-20);
                    }

                    conversationHistory.set(sessionId, messages);
                }

                resolve({
                    success: true,
                    response: fullResponse.trim(),
                    model: "gpt-5.4-mini",
                    sessionId: sessionId
                });
            });

            response.data.on('error', (error) => {
                reject(error);
            });
        });

    } catch (error) {
        console.error('[ChatGPT AI] Error:', error.message);

        // Handle rate limit errors
        if (error.response && error.response.status === 429) {
            return {
                success: false,
                error: "Rate limit reached. Anonymous users can perform up to 0 operations per day. Please try again later.",
                model: "gpt-5.4-mini"
            };
        }

        return {
            success: false,
            error: error.message || "Failed to get response from AI",
            model: "gpt-5.4-mini"
        };
    }
}

/**
 * Clear conversation history for a session
 * @param {string} sessionId - Session ID to clear
 * @returns {Object} - Result object
 */
chatgptai.clearHistory = function(sessionId) {
    if (sessionId && conversationHistory.has(sessionId)) {
        conversationHistory.delete(sessionId);
        return {
            success: true,
            message: `Conversation history cleared for session: ${sessionId}`
        };
    }

    // Clear all history if no sessionId
    if (!sessionId) {
        const count = conversationHistory.size;
        conversationHistory.clear();
        return {
            success: true,
            message: `All conversation history cleared (${count} sessions removed)`
        };
    }

    return {
        success: false,
        message: `No conversation history found for session: ${sessionId}`
    };
};

module.exports = chatgptai;
