// api/chatgptai.js - ChatGPT AI Chat API (Fixed - No Infinite Loop)
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class TalkAIChat {
    constructor() {
        this.baseURL = 'https://talkai.info/chat/send/';
        this.messagesHistory = [];
        this.settings = {
            model: 'gpt-4.1-nano',
            temperature: 0.7
        };

        // Browser-like headers
        this.headers = {
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/json',
            'Origin': 'https://talkai.info',
            'Referer': 'https://talkai.info/chat/',
            'Sec-Ch-Ua': '"Not A(Brand";v="8", "Chromium";v="132"',
            'Sec-Ch-Ua-Mobile': '?1',
            'Sec-Ch-Ua-Platform': '"Android"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest'
        };

        // Session cookies
        this.cookies = {
            '_csrf-front': '9a6a7e474d538b963de0a21b79f12f96b87a3dacbc0f0b96ce591503bd82d0bda%3A2%3A%7Bi%3A0%3Bs%3A11%3A%22_csrf-front%22%3Bi%3A1%3Bs%3A32%3A%22ORCOPS08hHsSCJ3U_g4BasMGOaeqw-bS%22%3B%7D',
            'talkai-front': '4p9qa90qet46a52ore1l4k58h9'
        };

        this.retryCount = 0;
        this.maxRetries = 1;
    }

    generateId() {
        return uuidv4();
    }

    getCookieString() {
        return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    async sendMessage(message) {
        // Add user message to history
        const userMsg = {
            id: this.generateId(),
            from: 'you',
            content: message,
            model: ''
        };
        this.messagesHistory.push(userMsg);

        // Prepare payload
        const payload = {
            messagesHistory: this.messagesHistory,
            settings: this.settings,
            type: 'chat'
        };

        try {
            const response = await axios.post(this.baseURL, payload, {
                headers: {
                    ...this.headers,
                    'Cookie': this.getCookieString()
                },
                timeout: 60000,
                responseType: 'text'
            });

            let fullResponse = '';

            if (response.status === 200) {
                const responseText = response.data;

                // Parse SSE format properly
                const lines = responseText.split('\n');

                for (const line of lines) {
                    const trimmedLine = line.trim();

                    // Skip empty lines and non-data lines
                    if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

                    const dataContent = trimmedLine.slice(6).trim();

                    // Skip [DONE] marker
                    if (dataContent === '[DONE]') continue;

                    // Skip empty data
                    if (!dataContent) continue;

                    // Skip metadata strings
                    if (dataContent === 'ChatGPT 4.1 nano' || 
                        dataContent === 'botmodel' ||
                        dataContent === 'trylimit') {
                        continue;
                    }

                    // Try to parse as JSON first
                    try {
                        const jsonData = JSON.parse(dataContent);

                        // Skip metadata events (trylimit, etc.)
                        if (jsonData.limit !== undefined || jsonData.actualTries !== undefined) {
                            continue;
                        }

                        // Extract content from delta format
                        if (jsonData.choices && Array.isArray(jsonData.choices)) {
                            for (const choice of jsonData.choices) {
                                if (choice.delta && choice.delta.content) {
                                    fullResponse += choice.delta.content;
                                } else if (choice.text) {
                                    fullResponse += choice.text;
                                }
                            }
                        } else if (jsonData.message && jsonData.message.content) {
                            fullResponse += jsonData.message.content;
                        } else if (jsonData.content) {
                            fullResponse += jsonData.content;
                        }
                    } catch (e) {
                        // Not JSON - this is actual streaming text content
                        fullResponse += dataContent;
                    }
                }

                // Fallback: if no content parsed, extract single-character data lines
                if (!fullResponse && responseText) {
                    const charMatches = responseText.match(/data: ([^\n]{1,2})(?=\n)/g);
                    if (charMatches) {
                        fullResponse = charMatches
                            .map(m => m.replace('data: ', ''))
                            .filter(c => c !== '[DONE]' && c.length > 0 && 
                                   c !== 'ChatGPT 4.1 nano' && c !== 'botmodel' && c !== 'trylimit')
                            .join('');
                    }
                }

                // Clean response
                fullResponse = fullResponse.replace(/^GPT\s*4\.1\s*nano/i, '').trim();
                fullResponse = fullResponse.replace(/^ChatGPT\s*4\.1\s*nano/i, '').trim();

                // Reset retry count on success
                this.retryCount = 0;

                // Add assistant response to history
                if (fullResponse) {
                    const assistantMsg = {
                        id: this.generateId(),
                        from: 'chatGPT',
                        content: fullResponse,
                        model: 'GPT 4.1 nano'
                    };
                    this.messagesHistory.push(assistantMsg);
                }

                return {
                    success: true,
                    response: fullResponse || 'No response received',
                    model: this.settings.model
                };
            } else {
                return {
                    success: false,
                    error: `HTTP ${response.status}`,
                    response: null
                };
            }
        } catch (error) {
            const statusCode = error.response ? error.response.status : null;

            // Retry once on auth errors
            if ((statusCode === 401 || statusCode === 403) && this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`[ChatGPT] Auth failed (HTTP ${statusCode}), retry ${this.retryCount}/${this.maxRetries}...`);

                // Remove the last user message from history before retry
                this.messagesHistory.pop();

                return this.sendMessage(message);
            }

            // Reset retry count
            this.retryCount = 0;

            return {
                success: false,
                error: statusCode ? `HTTP ${statusCode}: ${error.response.statusText || 'Forbidden'}` : error.message,
                response: null
            };
        }
    }

    clearHistory() {
        this.messagesHistory = [];
        this.retryCount = 0;
        return { success: true, message: 'History cleared' };
    }

    getHistory() {
        return this.messagesHistory;
    }
}

// Session storage
const sessions = new Map();

function getSession(sessionId) {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, new TalkAIChat());
    }
    return sessions.get(sessionId);
}

// Main chat function
async function chatgptai(prompt, sessionId = 'default') {
    if (!prompt) {
        return {
            success: false,
            error: 'Prompt is required',
            response: null
        };
    }

    const chat = getSession(sessionId);
    const result = await chat.sendMessage(prompt);

    return {
        ...result,
        sessionId: sessionId,
        historyLength: chat.getHistory().length
    };
}

// Clear history function
function clearHistory(sessionId = 'default') {
    if (sessions.has(sessionId)) {
        sessions.get(sessionId).clearHistory();
        return { success: true, message: 'History cleared', sessionId };
    }
    return { success: false, message: 'No session found', sessionId };
}

// Get history function
function getHistory(sessionId = 'default') {
    if (sessions.has(sessionId)) {
        return {
            success: true,
            sessionId,
            history: sessions.get(sessionId).getHistory()
        };
    }
    return { success: true, sessionId, history: [] };
}

module.exports = chatgptai;
module.exports.clearHistory = clearHistory;
module.exports.getHistory = getHistory;
