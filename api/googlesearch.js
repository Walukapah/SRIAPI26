// api/googlesearch.js - Google Search using Python script
const { spawn } = require('child_process');
const path = require('path');

async function googlesearch(query) {
    return new Promise((resolve, reject) => {
        if (!query) {
            return resolve({
                status: false,
                error: "Please provide a search query"
            });
        }

        const pythonScript = path.join(__dirname, 'googlesearch.py');
        
        // Run Python script with the query
        const pythonProcess = spawn('python', [pythonScript, query]);
        
        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`[GOOGLE SEARCH] Python error: ${stderr}`);
                return resolve({
                    status: false,
                    error: `Python script failed: ${stderr || 'Unknown error'}`
                });
            }

            try {
                // Parse JSON output from Python
                const result = JSON.parse(stdout.trim());
                resolve({
                    result: result
                });
            } catch (e) {
                console.error(`[GOOGLE SEARCH] JSON parse error: ${e.message}`);
                console.error(`[GOOGLE SEARCH] Raw output: ${stdout}`);
                resolve({
                    status: false,
                    error: "Failed to parse search results"
                });
            }
        });

        // Timeout after 30 seconds
        setTimeout(() => {
            pythonProcess.kill();
            resolve({
                success: false,
                error: "Search timeout - took too long"
            });
        }, 30000);
    });
}

module.exports = googlesearch;
