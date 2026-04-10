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
    // 🔧 FIXED: Changed from 'bytes' to 'url' - returns JSON with image URL
    formData.append('output_format', 'url');
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

    // 🔧 FIXED: Always expect JSON response now
    let jsonData;
    try {
        jsonData = await response.json();
    } catch (e) {
        throw new Error('Invalid JSON response from MagicStudio API');
    }

    // Extract image URL from various possible response formats
    let imageUrl = null;
    
    if (jsonData.url) {
        imageUrl = jsonData.url;
    } else if (jsonData.image_url) {
        imageUrl = jsonData.image_url;
    } else if (jsonData.imageUrl) {
        imageUrl = jsonData.imageUrl;
    } else if (jsonData.result && jsonData.result.url) {
        imageUrl = jsonData.result.url;
    } else if (jsonData.data && jsonData.data.url) {
        imageUrl = jsonData.data.url;
    }

    if (!imageUrl) {
        console.log('MagicStudio response:', JSON.stringify(jsonData, null, 2));
        throw new Error('No image URL found in MagicStudio API response');
    }

    // 🔧 FIXED: Fetch image from URL and convert to base64
    const imageResponse = await fetch(imageUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from URL: ${imageResponse.status}`);
    }

    const buffer = await imageResponse.buffer();
    
    // Detect MIME type
    const contentType = imageResponse.headers.get('content-type') || '';
    let mimeType = 'image/png';
    
    if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
        mimeType = 'image/jpeg';
    } else if (contentType.includes('image/png')) {
        mimeType = 'image/png';
    } else if (contentType.includes('image/webp')) {
        mimeType = 'image/webp';
    } else if (contentType.includes('image/gif')) {
        mimeType = 'image/gif';
    } else {
        // Detect from buffer magic numbers
        if (buffer.length > 2) {
            if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
                mimeType = 'image/jpeg';
            } else if (buffer[0] === 0x89 && buffer[1] === 0x50) {
                mimeType = 'image/png';
            } else if (buffer.length > 12 && buffer[8] === 0x57 && buffer[9] === 0x45) {
                mimeType = 'image/webp';
            }
        }
    }

    // Convert to base64 for consistent JSON response
    const base64Image = buffer.toString('base64');
    
    return {
        buffer: buffer,
        base64: base64Image,
        mimeType: mimeType,
        dataUri: `data:${mimeType};base64,${base64Image}`,
        prompt: prompt,
        imageUrl: imageUrl // Include original URL for reference
    };
}

module.exports = generateAIArt;
