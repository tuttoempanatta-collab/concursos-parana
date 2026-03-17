const axios = require('axios');
const cheerio = require('cheerio');

async function check() {
    try {
        const res = await axios.get('https://cge.entrerios.gov.ar/departamental-parana/');
        const $ = cheerio.load(res.data);
        console.log('HTML Loaded. Scanning for dates...');
        
        $('*').each((i, el) => {
            const text = $(el).text();
            if (text.toLowerCase().includes('17 de marzo') || text.toLowerCase().includes('16 de marzo')) {
                const parent = $(el).parent().prop('tagName');
                const parentClass = $(el).parent().attr('class');
                const p2 = $(el).parent().parent().prop('tagName');
                const p2class = $(el).parent().parent().attr('class');
                
                console.log('--- MATCH ---');
                console.log(`Tag: ${el.name}`);
                console.log(`Text: ${text.substring(0, 150)}...`);
                console.log(`Parent: ${parent} (class: ${parentClass})`);
                console.log(`Grandparent: ${p2} (class: ${p2class})`);
                if (el.name === 'a') {
                    console.log(`Href: ${$(el).attr('href')}`);
                }
            }
        });
    } catch (e) {
        console.error(e.message);
    }
}

check();
