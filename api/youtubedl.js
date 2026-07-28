// api/youtubedl.js - YouTube Downloader using Python script
const { spawn } = require('child_process');
const path = require('path');

async function youtubedl(url) {
    return new Promise((resolve, reject) => {
        if (!url) {
            return resolve({
                status: false,
                error: "Please provide a YouTube URL"
            });
        }

        const pythonScript = path.join(__dirname, 'youtubedl.py');
        
        // Run Python script with the URL
        const pythonProcess = spawn('python', [pythonScript, url]);
        
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
                console.error(`[YOUTUBE DL] Python error: ${stderr}`);
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
                console.error(`[YOUTUBE DL] JSON parse error: ${e.message}`);
                console.error(`[YOUTUBE DL] Raw output: ${stdout}`);
                resolve({
                    status: false,
                    error: "Failed to parse download results"
                });
            }
        });

        // Timeout after 60 seconds (downloads may take longer)
        setTimeout(() => {
            pythonProcess.kill();
            resolve({
                success: false,
                error: "Download timeout - took too long"
            });
        }, 60000);
    });
}

module.exports = youtubedl;
