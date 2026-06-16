// modrithplsearch.js - Modrinth Plugin Search API
const axios = require('axios');

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2';

/**
 * Search plugins on Modrinth
 * @param {string} query - Search query (plugin name or keyword)
 * @param {number} limit - Number of results (default: 20, max: 100)
 * @param {number} offset - Offset for pagination
 * @param {string} sort - Sort by: relevance, downloads, follows, newest, updated
 * @returns {Promise<Object>} Search results
 */
async function modrithplsearch(query, limit = 20, offset = 0, sort = 'relevance') {
    try {
        if (!query || query.trim().length === 0) {
            return {
                success: false,
                error: 'Please provide a search query'
            };
        }

        // Validate sort option
        const validSorts = ['relevance', 'downloads', 'follows', 'newest', 'updated'];
        const sortIndex = validSorts.includes(sort) ? sort : 'relevance';

        // Build search URL
        const searchUrl = `${MODRINTH_API_BASE}/search`;
        
        const params = {
            query: query.trim(),
            limit: Math.min(Math.max(parseInt(limit) || 20, 1), 100),
            offset: parseInt(offset) || 0,
            index: sortIndex,
            facets: JSON.stringify([["project_type:mod"], ["project_type:plugin"]])
        };

        console.log(`[MODRINTH SEARCH] Searching for: "${query}" | Limit: ${params.limit} | Sort: ${sortIndex}`);

        const response = await axios.get(searchUrl, {
            params,
            headers: {
                'User-Agent': 'SRI-API/3.0 (waluka@sriapi.lk)',
                'Accept': 'application/json'
            },
            timeout: 15000
        });

        if (!response.data || !response.data.hits) {
            return {
                success: false,
                error: 'No results found or invalid response from Modrinth'
            };
        }

        // Format results
        const results = response.data.hits.map(hit => ({
            project_id: hit.project_id,
            slug: hit.slug,
            title: hit.title,
            description: hit.description,
            author: hit.author,
            downloads: hit.downloads,
            follows: hit.follows,
            icon_url: hit.icon_url,
            latest_version: hit.latest_version,
            license: hit.license,
            client_side: hit.client_side,
            server_side: hit.server_side,
            categories: hit.display_categories || hit.categories,
            versions: hit.versions,
            date_created: hit.date_created,
            date_modified: hit.date_modified,
            modrinth_url: `https://modrinth.com/plugin/${hit.slug}`,
            project_url: `https://modrinth.com/project/${hit.project_id}`
        }));

        return {
            success: true,
            query: query.trim(),
            total_results: response.data.total_hits,
            limit: params.limit,
            offset: params.offset,
            sort: sortIndex,
            results: results
        };

    } catch (error) {
        console.error('[MODRINTH SEARCH] Error:', error.message);
        
        if (error.response) {
            return {
                success: false,
                error: `Modrinth API error: ${error.response.status} - ${error.response.statusText}`,
                details: error.response.data
            };
        }
        
        return {
            success: false,
            error: `Search failed: ${error.message}`
        };
    }
}

module.exports = modrithplsearch;
