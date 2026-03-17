const fs = require('fs');
const cheerio = require('cheerio');

const content = fs.readFileSync('dde_parana.html', 'utf-8');
const $ = cheerio.load(content);

console.log('--- Scanning for 2026 Contests ---');
$('*').each((i, el) => {
    const html = $(el).html();
    const text = $(el).text();
    if (text.includes('2026')) {
        // If it is a leaf node or a container with a title
        const parent = $(el).closest('.lista, .lista1, article');
        if (parent.length > 0) {
            const title = parent.find('h3').first().text().trim();
            const dateStr = text.match(/(\d{1,2})\s*(?:de|al)?\s*(marzo|abril)\s*(?:de|del)?\s*2026/i);
            if (dateStr) {
                console.log(`- Date: ${dateStr[0]}`);
                console.log(`  Title Found: ${title}`);
                console.log(`  Level: ${title.toLowerCase().includes('secundari') ? 'Secundario' : 'Other'}`);
                console.log('---');
            }
        }
    }
});
