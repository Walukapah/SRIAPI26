// cinesubzmovie.js - Cinesubz Movie Downloader API Handler
// python cinesubzmovie.py "<url>" run කරලා results return කරනවා

const { spawn } = require('child_process');
const path = require('path');

/**
 * Cinesubz Movie Downloader handler
 * @param {string} url - Cinesubz movie URL
 * @returns {Promise<Object>} - Movie download results
 */
async function cinesubzmovie(url) {
    return new Promise((resolve, reject) => {
        if (!url || url.trim() === '') {
            return resolve({
                success: false,
                error: 'URL parameter is required',
                message: 'Please provide a valid Cinesubz movie URL'
            });
        }

        const pythonScript = path.join(__dirname, 'cinesubzmovie.py');

        // python cinesubzmovie.py "<url>" run කරනවා
        const pythonProcess = spawn('python', [pythonScript, url.trim()]);

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
                console.error(`[CinesubzMovie] Python script exited with code ${code}`);
                console.error(`[CinesubzMovie] stderr: ${stderrData}`);
                return resolve({
                    success: false,
                    error: `Python script failed with code ${code}`,
                    message: stderrData || 'Failed to execute movie scraper'
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
                console.error('[CinesubzMovie] Failed to parse JSON:', parseError.message);
                console.error('[CinesubzMovie] Raw output:', stdoutData);
                resolve({
                    success: false,
                    error: 'Failed to parse movie results',
                    message: 'Invalid response from movie scraper script',
                    rawOutput: stdoutData.trim()
                });
            }
        });

        pythonProcess.on('error', (error) => {
            console.error('[CinesubzMovie] Failed to start python process:', error.message);
            resolve({
                success: false,
                error: 'Failed to start movie scraper',
                message: error.message
            });
        });
    });
}

module.exports = cinesubzmovie;
