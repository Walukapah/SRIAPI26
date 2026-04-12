// api/aiart.js - AI Art Generator for MagicStudio
const fetch = require('node-fetch');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');

// MagicStudio API endpoint
const MAGIC_STUDIO_API = 'https://ai-api.magicstudio.com/api/ai-art-generator';

/**
 * Generate UUID helper
 */
function generateUUID() {
    return uuidv4();
}

/**
 * Generate AI Art from MagicStudio
 * @param {string} prompt - The image generation prompt
 * @returns {Promise<Buffer>} - Image buffer
 */
async function generateAIArt(prompt) {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('output_format', 'bytes');
    formData.append('user_profile_id', 'null');
    formData.append('anonymous_user_id', generateUUID());
    formData.append('request_timestamp', Date.now() / 1000);
    formData.append('user_is_subscribed', 'false');
    formData.append('client_id', 'pSgX7WgjukXCBoYwDM8G8GLnRRkvAoJlqa5eAVvj95o');

    const response = await fetch(MAGIC_STUDIO_API, {
        method: 'POST',
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://magicstudio.com',
            'Referer': 'https://magicstudio.com/ai-art-generator/',
            'Sec-Ch-Ua': '"Not A(Brand";v="8", "Chromium";v="132"',
            'Sec-Ch-Ua-Mobile': '?1',
            'Sec-Ch-Ua-Platform': '"Android"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
            ...formData.getHeaders()
        },
        body: formData
    });

    if (!response.ok) {
        throw new Error(`MagicStudio API error: ${response.status}`);
    }

    return await response.buffer();
}

/**
 * Main module export - supports both direct image and JSON responses
 */
module.exports = async function aiart(prompt, format = 'image') {
    try {
        if (!prompt || prompt.trim() === '') {
            return {
                success: false,
                error: 'Prompt is required',
                message: 'Please provide a prompt parameter'
            };
        }

        console.log(`[AIART] Generating image for: "${prompt.substring(0, 50)}..."`);

        const imageBuffer = await generateAIArt(prompt);

        if (format === 'json') {
            // Return base64 JSON format
            const base64Image = imageBuffer.toString('base64');
            return {
                success: true,
                status: true,
                creator: "WALUKA🇱🇰",
                result: {
                    prompt: prompt,
                    image: `data:image/jpeg;base64,${base64Image}`,
                    format: 'base64',
                    size: imageBuffer.length
                }
            };
        } else {
            // Return raw buffer for direct image serving
            return {
                success: true,
                status: true,
                creator: "WALUKA🇱🇰",
                buffer: imageBuffer,
                contentType: 'image/jpeg',
                size: imageBuffer.length
            };
        }

    } catch (error) {
        console.error('[AIART] Error:', error.message);
        return {
            success: false,
            status: false,
            creator: "WALUKA🇱🇰",
            error: 'Failed to generate image',
            message: error.message
        };
    }
};
