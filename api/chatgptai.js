// api/chatgptai.js - ChatGPT AI Chat API
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
    }

    generateId() {
        return uuidv4();
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
                    'Cookie': Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ')
                },
                timeout: 60000,
                responseType: 'text'
            });

            let fullResponse = '';
            
            if (response.status === 200) {
                const lines = response.data.split('\n');
                
                for (const line of lines) {
                    if (line.trim() && line.startsWith('data: ')) {
                        const dataContent = line.slice(6);
                        
                        if (dataContent.trim() === '[DONE]') break;
                        
                        try {
                            const jsonData = JSON.parse(dataContent);
                            
                            // Extract content from various formats
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
                            if (dataContent && dataContent !== '[DONE]') {
                                fullResponse += dataContent;
                            }
                        }
                    }
                }

                // Fallback: regex extraction
                if (!fullResponse && response.data) {
                    const matches = response.data.match(/"content":"([^"]+)"/g);
                    if (matches) {
                        fullResponse = matches.map(m => {
                            const content = m.match(/"content":"([^"]+)"/);
                            return content ? content[1] : '';
                        }).join('');
                    }
                }

                // Clean response
                fullResponse = fullResponse.replace(/^GPT\s*4\.1\s*nano/i, '').trim();

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
            return {
                success: false,
                error: error.response ? `HTTP ${error.response.status}` : error.message,
                response: null
            };
        }
    }

    clearHistory() {
        this.messagesHistory = [];
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
