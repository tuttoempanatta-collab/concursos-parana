const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const url = 'https://cge.entrerios.gov.ar/departamental-parana/';
    try {
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(res.data);
        console.log("Total links found:", $('a').length);
        
        $('a').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            const lowerText = text.toLowerCase();
            if (lowerText.includes('concurso')) {
                if (lowerText.includes('bazan') || lowerText.includes('bazán') || lowerText.includes('300-1872')) {
                    console.log("FOUND IT!");
                    console.log("Text:", text);
                    console.log("Href:", href);
                }
            }
        });
        
        // Search for the specific CUE or school name as backup
        const bodyText = $('body').text();
        if (bodyText.includes('Abel Bazán y Bustos')) {
            console.log("School name found in body text.");
        } else {
            console.log("School name NOT found in body text.");
        }

    } catch (e) {
        console.error("Error:", e.message);
    }
}

test();
