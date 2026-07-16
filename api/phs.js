// phs.js - PHS Search Handler
// Python file එක run කරලා result එක return කරයි
const { execSync } = require('child_process');
const path = require('path');

async function phsSearch(query) {
    return new Promise((resolve, reject) => {
        try {
            const pythonFile = path.join(__dirname, 'phs.py');

            // Python file එක run කරනවා - query එක argument එකක් විදියට pass කරලා
            const result = execSync(`python "${pythonFile}" "${query}"`, {
                encoding: 'utf-8',
                timeout: 30000, // 30 seconds timeout
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            });

            // Python output එක parse කරනවා
            let parsedData;
            try {
                parsedData = JSON.parse(result.trim());
            } catch (e) {
                // JSON නැත්නම් raw text return කරනවා
                parsedData = { raw: result.trim() };
            }

            resolve({
                data: parsedData
            });
        } catch (error) {
            reject({
                status: false,
                error: error.message,
                stderr: error.stderr?.toString() || null
            });
        }
    });
}

module.exports = phsSearch;
