// api/aiimage.js - QuillBot AI Image Generator
const axios = require('axios');

const API_URL = 'https://quillbot.com/api/raven/generate/image';

const HEADERS = {
    'authority': 'quillbot.com',
    'method': 'POST',
    'path': '/api/raven/generate/image',
    'scheme': 'https',
    'accept': 'application/json, text/plain, */*',
    'accept-encoding': 'gzip, deflate, br',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    'origin': 'https://quillbot.com',
    'platform-type': 'webapp',
    'qb-product': 'IMAGE-GENERATOR',
    'referer': 'https://quillbot.com/ai-image-generator/',
    'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
    'webapp-version': '42.22.1'
};

/**
 * Generate AI image using QuillBot API
 * @param {string} prompt - Image description/prompt
 * @param {string} category - Image category (default: "Auto")
 * @param {string} aspectRatio - Aspect ratio like "1:1", "16:9", etc.
 * @returns {Promise<Object>} - Result object with success, image URLs, buffer
 */
async function generateImage(prompt, category = 'Auto', aspectRatio = '1:1') {
    try {
        const payload = {
            prompt: prompt,
            category: category,
            aspectRatio: aspectRatio,
            promptId: 'image/generate-image'
        };

        console.log(`[AI IMAGE] Generating: "${prompt}" | Category: ${category} | Ratio: ${aspectRatio}`);

        const response = await axios.post(API_URL, payload, {
            headers: HEADERS,
            timeout: 60000,
            responseType: 'json'
        });

        if (response.status === 201 && response.data?.success && response.data?.data?.images?.length > 0) {
            const images = response.data.data.images;
            const imageUrl = images[0].downloadUrl || images[0].url;

            // Download the image as buffer
            let imageBuffer = null;
            let imageSize = 0;
            if (imageUrl) {
                try {
                    const imgResponse = await axios.get(imageUrl, {
                        responseType: 'arraybuffer',
                        timeout: 30000,
                        headers: {
                            'User-Agent': HEADERS['user-agent'],
                            'Referer': 'https://quillbot.com/ai-image-generator/'
                        }
                    });
                    imageBuffer = Buffer.from(imgResponse.data);
                    imageSize = imageBuffer.length;
                    console.log(`[AI IMAGE] Downloaded: ${imageSize} bytes`);
                } catch (dlErr) {
                    console.error(`[AI IMAGE] Download failed: ${dlErr.message}`);
                }
            }

            return {
                success: true,
                result: {
                    prompt: prompt,
                    category: category,
                    aspectRatio: aspectRatio,
                    images: images.map(img => ({
                        url: img.downloadUrl || img.url,
                        width: img.width,
                        height: img.height
                    })),
                    imageUrl: imageUrl,
                    totalImages: images.length
                },
                buffer: imageBuffer,
                size: imageSize
            };
        } else {
            return {
                success: false,
                message: response.data?.message || 'Failed to generate image',
                error: 'API returned no images or success=false'
            };
        }

    } catch (error) {
        console.error('[AI IMAGE] Error:', error.message);
        if (error.response) {
            console.error('[AI IMAGE] Status:', error.response.status);
            console.error('[AI IMAGE] Data:', JSON.stringify(error.response.data).substring(0, 500));
        }
        return {
            success: false,
            message: error.message,
            error: error.response?.data?.message || 'Request failed'
        };
    }
}

/**
 * Main function for direct usage
 */
module.exports = async function aiimage(prompt, format = 'image') {
    if (!prompt || prompt.trim().length === 0) {
        return {
            success: false,
            message: 'Please provide a prompt parameter'
        };
    }

    const result = await generateImage(prompt.trim());

    if (!result.success) {
        return result;
    }

    // Return based on format
    if (format === 'json') {
        return {
            success: true,
            result: result.result
        };
    }

    // Default: return with buffer for direct image serving
    return {
        success: true,
        result: result.result,
        buffer: result.buffer,
        size: result.size
    };
};

// Also export the generateImage function for advanced usage
module.exports.generateImage = generateImage;
