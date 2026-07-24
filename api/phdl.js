// phdl.js
// API එකෙන් results return කරනවා - No timeout issues

const https = require('https');

async function phdl(url) {
    return new Promise((resolve, reject) => {
        // URL encode කරනවා special characters handle කරන්න
        const encodedUrl = encodeURIComponent(url);
        const apiUrl = `https://pornhub-nq7x.onrender.com/api/search?q=${encodedUrl}`;
        
        console.log(`[PHDL] Fetching: ${apiUrl}`);
        
        const request = https.get(apiUrl, (res) => {
            let data = '';
            
            // Data chunks collect කරනවා
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            // Response complete වුණාම
            res.on('end', () => {
                try {
                    console.log(`[PHDL] Raw response: ${data.substring(0, 500)}...`);
                    
                    // JSON response එකක් ද?
                    try {
                        const jsonData = JSON.parse(data);
                        resolve({
                            success: true,
                            ...jsonData
                        });
                    } catch (jsonError) {
                        // JSON නැත්නම් raw text return කරනවා
                        resolve({
                            success: true,
                            raw_output: data.trim()
                        });
                    }
                } catch (error) {
                    reject({
                        success: false,
                        error: `Failed to process response: ${error.message}`
                    });
                }
            });
        });

        request.on('error', (error) => {
            console.error(`[PHDL] Error: ${error.message}`);
            reject({
                success: false,
                error: `API request failed: ${error.message}`
            });
        });

        // NO timeout set - wait until server responds
        // Render free tier slow වෙන්න පුළුවන්, ඉවසීමෙන් ඉන්න
        
        // Optional: Very long timeout (5 minutes) if you want
        // request.setTimeout(300000, () => {
        //     request.destroy();
        //     reject({
        //         success: false,
        //         error: 'API request timed out after 5 minutes'
        //     });
        // });
    });
}

module.exports = phdl;
