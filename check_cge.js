const axios = require('axios');
const cheerio = require('cheerio');
axios.get('https://cge.entrerios.gov.ar/departamental-parana/').then(r => {
    const $ = cheerio.load(r.data);
    const p = [];
    $('.lista, article').find('a').each((i,a) => {
        if(i<10) p.push({
            href: $(a).attr('href'),
            text: $(a).text().trim()
        });
    });
    console.log(JSON.stringify(p, null, 2));
});
