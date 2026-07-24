// npm install axios
const axios = require('axios');

async function phdl(url) {
    try {
        const encodedUrl = encodeURIComponent(url);
        const response = await axios.get(`https://pornhub-nq7x.onrender.com/api/search?q=${encodedUrl}`, {
            timeout: 1
        });
        
        return {
            ...response.data
        };
    } catch (error) {
        return {
            status: false,
            error: `API request failed: ${error.message}`
        };
    }
}

module.exports = phdl;
