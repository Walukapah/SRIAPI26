// googleimagesearch.js - Google Image Search API Handler
// python googleimagesearch.py "<query>" run කරලා results return කරනවා

const { spawn } = require('child_process');
const path = require('path');

/**
 * Google Image Search handler
 * @param {string} query - Search query
 * @returns {Promise<Object>} - Search results
 */
async function googleimagesearch(query) {
    return new Promise((resolve, reject) => {
        if (!query || query.trim() === '') {
            return resolve({
                success: false,
                error: 'Query parameter is required',
                message: 'Please provide a search query'
            });
        }

        const pythonScript = path.join(__dirname, 'googleimagesearch.py');
        
        // python googleimagesearch.py "<query>" run කරනවා
        const pythonProcess = spawn('python', [pythonScript, query.trim()]);

        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`[GoogleImageSearch] Python script exited with code ${code}`);
                console.error(`[GoogleImageSearch] stderr: ${stderrData}`);
                return resolve({
                    success: false,
                    error: `Python script failed with code ${code}`,
                    message: stderrData || 'Failed to execute image search'
                });
            }

            try {
                // Python script එකේ stdout එක JSON විදියට parse කරනවා
                const result = JSON.parse(stdoutData.trim());
                resolve({
                    success: true,
                    ...result
                });
            } catch (parseError) {
                console.error('[GoogleImageSearch] Failed to parse JSON:', parseError.message);
                console.error('[GoogleImageSearch] Raw output:', stdoutData);
                resolve({
                    success: false,
                    error: 'Failed to parse search results',
                    message: 'Invalid response from image search script',
                    rawOutput: stdoutData.trim()
                });
            }
        });

        pythonProcess.on('error', (error) => {
            console.error('[GoogleImageSearch] Failed to start python process:', error.message);
            resolve({
                success: false,
                error: 'Failed to start image search',
                message: error.message
            });
        });
    });
}

module.exports = googleimagesearch;
