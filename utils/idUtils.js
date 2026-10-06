/**
 * Generates a consistent slug from a link to be used as a Firestore document ID.
 * Normalized to handle http/https and trailing slashes.
 * @param {string} link The URL of the contest
 * @returns {string} The slug ID
 */
function getSlugId(link) {
    if (!link) return `manual_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    
    try {
        // Normalize: lowercase, remove protocol, remove trailing slash
        let clean = link.toLowerCase()
            .trim()
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, "");
        
        // Extract the last part of the path (the slug)
        // Example: https://cge.entrerios.gov.ar/2026/04/my-contest/ -> my-contest
        const parts = clean.split('/');
        const slug = parts[parts.length - 1];
        
        // Replace non-alphanumeric characters with underscores and ensure it's not too long
        let finalId = slug.replace(/[^a-z0-9]/g, '_');
        
        // Fallback if empty
        return finalId || `s_${Math.random().toString(36).substr(2, 5)}`;
    } catch (e) {
        return `err_${Math.random().toString(36).substr(2, 5)}`;
    }
}

// Universal export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getSlugId };
} else if (typeof window !== 'undefined') {
    window.getSlugId = getSlugId;
}

export { getSlugId };
