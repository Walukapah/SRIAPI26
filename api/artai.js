const fetch = require('node-fetch');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');

const MAGIC_STUDIO_API = 'https://ai-api.magicstudio.com/api/ai-art-generator';

function generateUUID() {
    return uuidv4();
}

async function generateAIArt(prompt) {
    if (!prompt) {
        throw new Error('Prompt is required');
    }

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
        const errorText = await response.text();
        throw new Error(`MagicStudio API error: ${response.status} - ${errorText}`);
    }

    // Get content type to determine response format
    const contentType = response.headers.get('content-type') || '';

    // If response is JSON (error message or metadata), parse it
    if (contentType.includes('application/json')) {
        const jsonData = await response.json();
        if (jsonData.error) {
            throw new Error(jsonData.error);
        }
        // If JSON contains image data
        if (jsonData.image_data || jsonData.result) {
            const base64Data = jsonData.image_data || jsonData.result;
            const buffer = Buffer.from(base64Data, 'base64');
            return {
                buffer: buffer,
                base64: base64Data,
                mimeType: 'image/png',
                dataUri: `data:image/png;base64,${base64Data}`
            };
        }
        throw new Error('Unexpected JSON response from API');
    }

    // If response is binary image data (normal case)
    const buffer = await response.buffer();

    // Detect mime type from content-type header or buffer
    let mimeType = 'image/png';
    if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
        mimeType = 'image/jpeg';
    } else if (contentType.includes('image/webp')) {
        mimeType = 'image/webp';
    } else if (contentType.includes('image/png')) {
        mimeType = 'image/png';
    }

    // Validate that we actually got image data (check magic bytes)
    if (buffer.length < 100) {
        throw new Error('Received empty or invalid image data');
    }

    // Check for JPEG magic bytes
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
        mimeType = 'image/jpeg';
    }
    // Check for PNG magic bytes
    else if (buffer[0] === 0x89 && buffer[1] === 0x50) {
        mimeType = 'image/png';
    }
    // Check for WebP magic bytes
    else if (buffer[0] === 0x52 && buffer[1] === 0x49) {
        mimeType = 'image/webp';
    }

    // Convert to base64 for JSON response
    const base64Image = buffer.toString('base64');

    return {
        buffer: buffer,
        base64: base64Image,
        mimeType: mimeType,
        dataUri: `data:${mimeType};base64,${base64Image}`
    };
}

module.exports = generateAIArt;
