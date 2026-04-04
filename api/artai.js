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
        throw new Error(`MagicStudio API error: ${response.status}`);
    }

    // Check content-type to determine response format
    const contentType = response.headers.get('content-type') || '';
    
    // If response is JSON (contains status field), parse it
    if (contentType.includes('application/json')) {
        const jsonData = await response.json();
        
        // If JSON contains base64 image data
        if (jsonData.image || jsonData.result || jsonData.data) {
            const base64Data = jsonData.image || jsonData.result || jsonData.data;
            const buffer = Buffer.from(base64Data, 'base64');
            const mimeType = 'image/png';
            
            return {
                buffer: buffer,
                base64: base64Data,
                mimeType: mimeType,
                dataUri: `data:${mimeType};base64,${base64Data}`,
                prompt: prompt
            };
        }
        
        // If JSON contains URL
        if (jsonData.url || jsonData.imageUrl) {
            const imageUrl = jsonData.url || jsonData.imageUrl;
            // Fetch the actual image
            const imageResponse = await fetch(imageUrl);
            const buffer = await imageResponse.buffer();
            const mimeType = imageResponse.headers.get('content-type') || 'image/png';
            const base64Image = buffer.toString('base64');
            
            return {
                buffer: buffer,
                base64: base64Image,
                mimeType: mimeType,
                dataUri: `data:${mimeType};base64,${base64Image}`,
                prompt: prompt
            };
        }
        
        throw new Error('Unexpected JSON response format from MagicStudio API');
    }
    
    // If response is direct image binary data (JFIF, JPEG, PNG, etc.)
    const buffer = await response.buffer();
    
    // Detect MIME type from content-type header or buffer magic numbers
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
        // Try to detect from buffer magic numbers
        if (buffer.length > 2) {
            // JPEG starts with FF D8
            if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
                mimeType = 'image/jpeg';
            }
            // PNG starts with 89 50 4E 47
            else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                mimeType = 'image/png';
            }
            // WebP starts with RIFF....WEBP
            else if (buffer.length > 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
                mimeType = 'image/webp';
            }
        }
    }
    
    // Convert to base64 for JSON response
    const base64Image = buffer.toString('base64');
    
    return {
        buffer: buffer,
        base64: base64Image,
        mimeType: mimeType,
        dataUri: `data:${mimeType};base64,${base64Image}`,
        prompt: prompt
    };
}

module.exports = generateAIArt;
