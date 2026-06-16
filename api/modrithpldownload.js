// modrithpldownload.js - Modrinth Plugin Download/Details API
const axios = require('axios');

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2';

/**
 * Extract project ID or slug from various Modrinth URL formats
 * @param {string} input - URL, slug, or project ID
 * @returns {string|null} Extracted identifier
 */
function extractIdentifier(input) {
    if (!input) return null;

    // Clean input
    const clean = input.trim();

    // If it's already a project ID (alphanumeric, no special chars, typical length)
    if (/^[a-zA-Z0-9]{6,12}$/.test(clean) && !clean.includes('/')) {
        return clean;
    }

    // Extract from URLs
    const patterns = [
        /modrinth\.com\/plugin\/([^\/\s?#]+)/,
        /modrinth\.com\/mod\/([^\/\s?#]+)/,
        /modrinth\.com\/project\/([^\/\s?#]+)/,
        /modrinth\.com\/datapack\/([^\/\s?#]+)/,
        /api\.modrinth\.com\/v2\/project\/([^\/\s?#]+)/,
    ];

    for (const pattern of patterns) {
        const match = clean.match(pattern);
        if (match) {
            return match[1];
        }
    }

    // If no URL pattern matched, treat as slug
    if (/^[a-zA-Z0-9_-]+$/.test(clean)) {
        return clean;
    }

    return null;
}

/**
 * Fetch project details from Modrinth
 * @param {string} identifier - Project ID, slug, or Modrinth URL
 * @returns {Promise<Object>} Project details with download links
 */
async function modrithpldownload(identifier) {
    try {
        const projectId = extractIdentifier(identifier);

        if (!projectId) {
            return {
                success: false,
                error: 'Invalid identifier. Please provide a Modrinth URL, project ID, or plugin slug.',
                examples: [
                    'https://modrinth.com/plugin/veinminer',
                    'https://modrinth.com/project/OhduvhIc',
                    'veinminer',
                    'OhduvhIc'
                ]
            };
        }

        console.log(`[MODRINTH DOWNLOAD] Fetching project: ${projectId}`);

        // Fetch project details
        const projectResponse = await axios.get(`${MODRINTH_API_BASE}/project/${projectId}`, {
            headers: {
                'User-Agent': 'SRI-API/3.0 (waluka@sriapi.lk)',
                'Accept': 'application/json'
            },
            timeout: 15000
        });

        const project = projectResponse.data;

        if (!project || !project.id) {
            return {
                success: false,
                error: 'Project not found on Modrinth'
            };
        }

        // Fetch versions
        let versions = [];
        try {
            const versionsResponse = await axios.get(`${MODRINTH_API_BASE}/project/${projectId}/version`, {
                headers: {
                    'User-Agent': 'SRI-API/3.0 (waluka@sriapi.lk)',
                    'Accept': 'application/json'
                },
                timeout: 15000
            });
            versions = versionsResponse.data || [];
        } catch (verError) {
            console.log(`[MODRINTH DOWNLOAD] Versions fetch warning: ${verError.message}`);
        }

        // Format project info
        const projectInfo = {
            project_id: project.id,
            slug: project.slug,
            title: project.title,
            description: project.description,
            body: project.body,
            project_type: project.project_type,
            status: project.status,
            license: project.license,
            author: project.author || (project.team ? `Team: ${project.team}` : 'Unknown'),
            team: project.team,
            organization: project.organization,
            downloads: project.downloads,
            followers: project.followers,
            categories: project.categories,
            additional_categories: project.additional_categories,
            loaders: project.loaders,
            game_versions: project.game_versions,
            client_side: project.client_side,
            server_side: project.server_side,
            icon_url: project.icon_url,
            source_url: project.source_url,
            wiki_url: project.wiki_url,
            discord_url: project.discord_url,
            issues_url: project.issues_url,
            donation_urls: project.donation_urls,
            gallery: project.gallery,
            color: project.color,
            thread_id: project.thread_id,
            monetization_status: project.monetization_status,
            published: project.published,
            updated: project.updated,
            approved: project.approved,
            urls: {
                modrinth: `https://modrinth.com/plugin/${project.slug}`,
                project: `https://modrinth.com/project/${project.id}`,
                api: `${MODRINTH_API_BASE}/project/${project.id}`
            }
        };

        // Format versions with download links
        const formattedVersions = versions.map(version => ({
            version_id: version.id,
            name: version.name,
            version_number: version.version_number,
            version_type: version.version_type,
            status: version.status,
            date_published: version.date_published,
            downloads: version.downloads,
            game_versions: version.game_versions,
            loaders: version.loaders,
            featured: version.featured,
            changelog: version.changelog,
            dependencies: version.dependencies ? version.dependencies.map(dep => ({
                project_id: dep.project_id,
                version_id: dep.version_id,
                dependency_type: dep.dependency_type,
                file_name: dep.file_name
            })) : [],
            files: version.files ? version.files.map(file => ({
                file_id: file.id,
                filename: file.filename,
                primary: file.primary,
                size: file.size,
                size_formatted: formatFileSize(file.size),
                url: file.url,
                hashes: file.hashes ? {
                    sha1: file.hashes.sha1,
                    sha512: file.hashes.sha512
                } : null
            })) : [],
            download_url: version.files && version.files.find(f => f.primary) 
                ? version.files.find(f => f.primary).url 
                : (version.files && version.files[0] ? version.files[0].url : null)
        }));

        // Get latest version info
        const latestVersion = formattedVersions.length > 0 ? formattedVersions[0] : null;

        // All download links summary
        const allDownloads = [];
        formattedVersions.forEach(ver => {
            ver.files.forEach(file => {
                allDownloads.push({
                    version: ver.version_number,
                    version_name: ver.name,
                    version_type: ver.version_type,
                    filename: file.filename,
                    size: file.size_formatted,
                    primary: file.primary,
                    url: file.url,
                    game_versions: ver.game_versions,
                    loaders: ver.loaders
                });
            });
        });

        return {
            success: true,
            project: projectInfo,
            latest_version: latestVersion,
            total_versions: formattedVersions.length,
            versions: formattedVersions,
            all_downloads: allDownloads,
            direct_download: latestVersion ? {
                url: latestVersion.download_url,
                filename: latestVersion.files.find(f => f.primary)?.filename || latestVersion.files[0]?.filename,
                version: latestVersion.version_number,
                size: latestVersion.files.find(f => f.primary)?.size_formatted || latestVersion.files[0]?.size_formatted
            } : null
        };

    } catch (error) {
        console.error('[MODRINTH DOWNLOAD] Error:', error.message);

        if (error.response) {
            if (error.response.status === 404) {
                return {
                    success: false,
                    error: 'Plugin not found on Modrinth. Please check the URL, slug, or project ID.'
                };
            }
            return {
                success: false,
                error: `Modrinth API error: ${error.response.status} - ${error.response.statusText}`,
                details: error.response.data
            };
        }

        return {
            success: false,
            error: `Failed to fetch plugin details: ${error.message}`
        };
    }
}

/**
 * Format file size to human readable
 * @param {number} bytes 
 * @returns {string}
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = modrithpldownload;
