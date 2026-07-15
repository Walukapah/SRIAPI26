// phdl.js - PornHub Downloader API
// Python script එක run කරලා results return කරනවා

const { exec } = require('child_process');
const path = require('path');

async function phdl(url) {
    return new Promise((resolve, reject) => {
        // phdl.py file එකේ path එක (same folder)
        const pythonScript = path.join(__dirname, 'phdl.py');
        
        // python phdl.py <url> command එක run කරනවා
        const command = `python "${pythonScript}" "${url}"`;
        
        console.log(`[PHDL] Running: ${command}`);
        
        exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`[PHDL] Error: ${error.message}`);
                return reject({
                    success: false,
                    error: `Python script failed: ${error.message}`
                });
            }
            
            if (stderr) {
                console.log(`[PHDL] stderr: ${stderr}`);
            }
            
            try {
                // Python script එකෙන් එන stdout JSON විදියට parse කරනවා
                const output = stdout.trim();
                console.log(`[PHDL] Raw output: ${output.substring(0, 500)}...`);
                
                // JSON response එකක් ද?
                try {
                    const jsonData = JSON.parse(output);
                    resolve({
                        success: true,
                        ...jsonData
                    });
                } catch (jsonError) {
                    // JSON නැත්නම් raw text return කරනවා
                    resolve({
                        success: true,
                        raw_output: output
                    });
                }
            } catch (parseError) {
                reject({
                    success: false,
                    error: `Failed to parse output: ${parseError.message}`
                });
            }
        });
    });
}

module.exports = phdl;
