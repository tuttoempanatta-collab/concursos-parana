const axios = require('axios');
const cheerio = require('cheerio');

// Mock extractEventDate for simple testing
function extractEventDate(text) {
    return new Date();
}

async function scrapeCGEPage(url) {
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000 
        });
        const html = response.data;
        const $ = cheerio.load(html);
        const findings = [];
        
        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            if (!href) return;
            
            const lowerText = text.toLowerCase();
            if (lowerText.includes('concurso')) {
                 if (lowerText.includes('bazán') || lowerText.includes('bazan') || lowerText.includes('300-1872')) {
                     findings.push({
                         title: text,
                         link: href.startsWith('http') ? href : (url.endsWith('/') ? url + href : url + '/' + href)
                     });
                 }
            }
        });
        return findings;
    } catch (e) {
        console.error(`Scrape failed for ${url}:`, e.message);
        return [];
    }
}

async function test() {
    const urls = [
        'https://cge.entrerios.gov.ar/concursos-docentes/',
        'https://cge.entrerios.gov.ar/departamental-parana/'
    ];
    
    console.log("Starting aggregated scrape test...");
    const results = await Promise.all(urls.map(u => scrapeCGEPage(u)));
    const flatResults = results.flat();
    
    console.log(`Total relevant findings: ${flatResults.length}`);
    flatResults.forEach(item => {
        console.log("- " + item.title);
        console.log("  Link: " + item.link);
    });

    if (flatResults.length > 0) {
        console.log("\nSUCCESS: Found the missing publication(s)!");
    } else {
        console.log("\nFAILURE: Did not find the publication.");
    }
}

test();
