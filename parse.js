const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const IS_LOCAL_ONLY = process.argv.includes('--local-only');

// Initialize Firebase Admin only if not in local-only mode
let db = null;
if (!IS_LOCAL_ONLY) {
    if (!admin.apps.length) {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            try {
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    projectId: 'concursos-entre-rios'
                });
                admin.firestore().settings({ ignoreUndefinedProperties: true });
                console.log('Firebase Admin inicializado con Service Account.');
            } catch (e) {
                console.error('Error al parsear FIREBASE_SERVICE_ACCOUNT:', e.message);
                admin.initializeApp({ projectId: 'concursos-entre-rios' });
            }
        } else {
            admin.initializeApp({
                projectId: 'concursos-entre-rios'
            });
            admin.firestore().settings({ ignoreUndefinedProperties: true });
            console.log('Firebase Admin inicializado con Project ID (sin credenciales explícitas).');
        }
    }
    db = admin.firestore();
}

const TARGET_YEAR = 2026;
const EXCLUDED_URLS = [
    'https://cge.entrerios.gov.ar/concursos-docentes/',
    'https://cge.entrerios.gov.ar/departamental-parana/',
    'https://cge.entrerios.gov.ar/'
];
const EXCLUDED_TITLES = [
    'concursos. docentes',
    'concursos docentes',
    'concursos',
    'departamental parana',
    'dde parana'
];

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; 
    }
    return Math.abs(hash).toString(36);
}

/**
 * Enhanced Date Extraction with Year Context
 */
function extractEventDate(text, fallbackText, hintYear) {
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const dateRegex = /(\d{1,2})\s*(?:[y,-]\s*\d{1,2}\s*)*(?:-|de|al)?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s*(?:-|de|del)?\s*(\d{4}))?/i;
    const numericDateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    const timeRegex = /(?:a las\s*)?(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)/i;

    const defaultYear = hintYear || TARGET_YEAR;

    // Clean text to avoid email collision
    const cleanText = (text + " " + (fallbackText || "")).replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
    
    // 1. Try to find a date with a month name
    const match = cleanText.match(dateRegex);
    const timeMatch = cleanText.match(timeRegex);
    
    let timeHours = 8; // Default school morning
    let timeMinutes = 0;
    let timeSet = false;

    if (timeMatch) {
       timeHours = parseInt(timeMatch[1], 10);
       timeMinutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
       timeSet = true;
    }

    if (match) {
        let day = parseInt(match[1], 10);
        let monthStr = match[2].toLowerCase();
        let monthIndex = months.indexOf(monthStr);
        let year = match[3] ? parseInt(match[3], 10) : defaultYear;
        if (year < 100) year += 2000;
        
        return new Date(year, monthIndex, day, timeSet ? timeHours : 23, timeSet ? timeMinutes : 59, 0);
    }

    // 2. Try numeric date
    const numMatch = cleanText.match(numericDateRegex);
    if (numMatch) {
        let day = parseInt(numMatch[1], 10);
        let month = parseInt(numMatch[2], 10) - 1;
        let year = parseInt(numMatch[3], 10);
        if (year < 100) year += 2000;
        
        // Safety check for common swaps (MM/DD/YYYY) vs Argentinian DD/MM/YYYY
        if (month > 11 && day <= 12) {
            let temp = month;
            month = day - 1;
            day = temp;
        }
        return new Date(year, month, day, timeSet ? timeHours : 23, timeSet ? timeMinutes : 59, 0);
    }
    
    return null;
}

function classifyLevel(title) {
    const lowerTitle = title.toLowerCase();
    if (
        lowerTitle.includes('secundari') || lowerTitle.includes('sec.') || lowerTitle.includes('sec ') || 
        lowerTitle.includes('jovenes') || lowerTitle.includes('jóvenes') || 
        lowerTitle.includes('esja') || lowerTitle.includes('e.s.j.a') ||
        lowerTitle.includes('eeat') || lowerTitle.includes('e.e.a.t') ||
        lowerTitle.includes('eet') || lowerTitle.includes('e.e.t') ||
        lowerTitle.includes('técnica') || lowerTitle.includes('tecnica') || 
        lowerTitle.includes('esa ') || lowerTitle.includes('e.s.a')
    ) return 'Secundario';
    
    if (lowerTitle.includes('primari') || lowerTitle.includes('nep') || lowerTitle.includes('nina') || lowerTitle.includes('escuela n°') || lowerTitle.includes('esc. nro') || lowerTitle.includes('esc. nº') || lowerTitle.includes('idioma extranjero')) return 'Primario';
    if (/esc(?:uela|\.?)\s*(?:n[ro|º|°\.? ]*)?\d+/i.test(lowerTitle)) return 'Primario';
    if (lowerTitle.includes('superior')) return 'Superior';
    return 'No especificado';
}

function classifyCity(title) {
    const lowerTitle = title.toLowerCase();
    const paranaVariants = ['parana', 'paraná', 'pná', 'pna'];
    const localidadesDeptParana = [
        'crespo', 'maria grande', 'maría grande', 'san benito', 'viale', 'hernandarias', 'cerrito', 
        'colonia avellaneda', 'hasenkamp', 'oro verde', 'seguí', 'segui', 'tabossi', 'villa urquiza', 
        'aldea maría luisa', 'el pingo', 'pueblo brugo', 'aldea santa maría', 'puerto curtiembre', 
        'el palenque', 'la picada', 'las tunas', 'sauce montrull', 'sosa', 'colonia crespo', 
        'pueblo bellocq', 'las garzas', 'sauce pinto', 'tezanos pinto', 'villa fontana', 
        'villa gobernador etchevehere', 'aldea santa rosa', 'arroyo burgos', 'arroyo corralito', 
        'aldea eigenfeld', 'aldea san antonio', 'aldea san rafael', 'antonio tomás', 'colonia celina', 
        'espinillo norte', 'paso de la arena', 'paso de la piedra', 'santa luisa', 'arroyo maturrango', 
        'arroyo palo seco', 'colonia cerrito', 'colonia merou', 'colonia reffino', 'distrito tala', 
        'quebracho', 'colonia nueva', 'el ramblón', 'puerto viboras', 'estación sosa', 'estacion sosa',
        'maría grande segunda', 'maria grande segunda', 'villa mabel'
    ];
    let matchedCity = 'Paraná (Dpto)';
    for (const loc of localidadesDeptParana) {
        if (lowerTitle.includes(loc)) {
            matchedCity = loc.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            if (matchedCity === 'Segui' || matchedCity === 'Seguí') matchedCity = 'Seguí';
            if (matchedCity.includes('Maria Grande') || matchedCity.includes('María Grande')) matchedCity = 'María Grande';
            if (matchedCity === 'Pna' || matchedCity === 'Pna.' || matchedCity === 'Pná' || matchedCity === 'Villa Mabel') matchedCity = 'Paraná Ciudad';
            return matchedCity;
        }
    }
    for (const variant of paranaVariants) {
        if (lowerTitle.includes(variant)) return 'Paraná Ciudad';
    }
    return matchedCity;
}

async function fetchDetailedInfo(url, urlYear) {
    try {
        console.log(`  Fetching details from ${url}...`);
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
        const $ = cheerio.load(response.data);
        $('script, style, iframe, ins, .lat-not, footer, header').remove();
        const fullTextContent = $('body').text().trim();
        const entryContent = $('.entry-content, .post-content, article, #main-content').first();
        const content = entryContent.text() || $('body').text();
        const cleanContent = content
            .replace(/moment\.updateLocale[\s\S]*?\}\s*\);/g, '')
            .replace(/window\.twttr[\s\S]*?\}\s*\(document, "script", "twitter-wjs"\)\);/g, '')
            .trim();
            
        const lines = cleanContent.split('\n').map(l => l.trim()).filter(l => l.length > 3);
        const subjects = [];
        const plazas = [];
        let specificDate = null;
        let solicitud = null;
        let foundDate = null;

        for (const line of lines) {
            // 1. SMART DATE DETECTION IN BODY
            if (!foundDate) {
                const eventDate = extractEventDate(line, null, urlYear);
                if (eventDate) {
                    foundDate = eventDate; // Just take the first valid date found in the body
                }
            }
            if (!solicitud) {
                const solMatch = line.match(/Solicitud\s*N[°º]?\s*(\d+)/i) || line.match(/(\d+)[°º]?\s*llamado/i);
                if (solMatch) solicitud = parseInt(solMatch[1], 10);
            }
            const lowerLine = line.toLowerCase();
            const isJobInfo = lowerLine.includes('plaza') || lowerLine.includes('hs cát') || lowerLine.includes('hs cat') || lowerLine.includes('stf') || lowerLine.includes('cue') || lowerLine.includes('cargo') || /\d+\s*hs/i.test(lowerLine);
            if (isJobInfo) {
                const level = classifyLevel(line);
                if (level === 'Secundario') subjects.push(line); else plazas.push(line);
            }
        }
        if (foundDate) specificDate = foundDate;
        
        // STRICT YEAR CHECK IN CONTENT
        if (specificDate && specificDate.getFullYear() < TARGET_YEAR) {
            console.log(`    [REJECT] Content year is old: ${specificDate.getFullYear()}`);
            return { subjects: [], plazas: [], specificDate: null, fullTextContent: '', isOld: true };
        }

        return { subjects: subjects.slice(0, 100), plazas: plazas.slice(0, 100), specificDate, fullTextContent, solicitud, isOld: false };
    } catch (e) {
        console.error(`  Failed to fetch details from ${url}: ${e.message}`);
        return { subjects: [], plazas: [], specificDate: null, fullTextContent: '', isOld: false };
    }
}

let globalDeepScrapeCount = 0;

async function scrapeCGEPage(url) {
    try {
        console.log(`Scraping list ${url}...`);
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
        const $ = cheerio.load(response.data);
        const results = [];
        const links = [];
        
        $('.lista, .lista1, article, .entry-content').find('h3, p, li').each((i, el) => {
            const containerText = $(el).text().trim();
            if (!containerText) return;

            $(el).find('a').each((j, a) => {
                const href = $(a).attr('href');
                if (!href || href.startsWith('javascript:') || href.includes('#')) return;
                const linkText = $(a).text().trim();
                const combinedText = (linkText.length > 30) ? linkText : `${containerText} ${linkText}`;
                const lowerText = combinedText.toLowerCase();

                // 1. SKIP IF TITLE IS EXACTLY A CATEGORY NAME
                if (EXCLUDED_TITLES.includes(lowerText.trim())) return;

                const isParana = url.includes('departamental-parana') || lowerText.includes('paran') || lowerText.includes('pná') || lowerText.includes('pna');
                if (!isParana) return;
                
                if (lowerText.includes('concurso') || lowerText.includes('llama a') || lowerText.includes('convocatoria') || lowerText.includes('asamblea')) {
                    const fullHref = href.startsWith('http') ? href : `https://cge.entrerios.gov.ar${href.startsWith('/') ? '' : '/'}${href}`;
                    
                    // 2. SKIP IF URL IS IN EXCLUSION LIST
                    if (EXCLUDED_URLS.includes(fullHref)) return;

                    if (!links.find(l => l.href === fullHref)) {
                        let pubDateText = '';
                        const prevP = $(el).prevAll('p').first();
                        if (prevP.length > 0) pubDateText = prevP.text().trim();
                        links.push({ text: combinedText, href: fullHref, pubDateText });
                    }
                }
            });
        });

        console.log(`- Found ${links.length} potential links on ${url}`);
        const now = new Date();
        
        // Prioritize links containing TARGET_YEAR (like /2026/)
        links.sort((a, b) => {
            const isTargetA = a.href.includes(`/${TARGET_YEAR}/`) ? 1 : 0;
            const isTargetB = b.href.includes(`/${TARGET_YEAR}/`) ? 1 : 0;
            return isTargetB - isTargetA;
        });

        for (const linkObj of links) {
            const { text, href, pubDateText } = linkObj;
            
            // USE URL YEAR AS HINT, BUT DON'T SKIP YET (some 2026 posts are in 2024/2017 subfolders)
            const urlMatch = href.match(/\/20(\d{2})\//);
            const urlYear = urlMatch ? parseInt('20' + urlMatch[1], 10) : TARGET_YEAR;

            const city = classifyCity(text);
            const level = classifyLevel(text);
            let date = extractEventDate(text, pubDateText, urlYear);
            
            if (globalDeepScrapeCount < 100) {
                globalDeepScrapeCount++;
                const details = await fetchDetailedInfo(href, urlYear);
                
                // DISCARD IF BODY SAYS OLD YEAR
                if (details.isOld || (details.specificDate && details.specificDate.getFullYear() !== TARGET_YEAR)) {
                    console.log(`[FILTER] Discarding inner contest belonging to year != ${TARGET_YEAR}: ${href}`);
                    continue;
                }

                results.push({
                    id: `scrape-${url.includes('dept') ? 'dept' : 'main'}-${hashString(href)}`,
                    title: text,
                    link: href,
                    nivel: details.specificDate ? classifyLevel(details.fullTextContent) || level : level,
                    date: (details.specificDate || date)?.toISOString() || null,
                    pubDate: now.toISOString().split('T')[0],
                    department: city,
                    originalText: text,
                    materias: details.subjects,
                    plazas: details.plazas,
                    fullContent: details.fullTextContent || '',
                    solicitud: details.solicitud
                });
            }
        }
        return results;
    } catch (e) {
        console.error(`- Scrape failed for ${url}: ${e.message}`);
        return [];
    }
}

async function run() {
    let blacklist = new Set();
    
    if (!IS_LOCAL_ONLY && db) {
        console.log("Fetching blacklist (deleted_ids)...");
        try {
            const blacklistSnap = await db.collection('concursos_eliminados').get();
            blacklist = new Set(blacklistSnap.docs.map(doc => doc.id));
            console.log(`Blacklist has ${blacklist.size} items.`);
        } catch (e) {
            console.log("Error fetching blacklist, continuing with empty blacklist.", e.message);
        }
    } else {
        console.log("Local only mode: skipping blacklist fetch.");
    }

    const results = [];
    const urls = ['https://cge.entrerios.gov.ar/concursos-docentes/', 'https://cge.entrerios.gov.ar/departamental-parana/'];
    for (const url of urls) {
        const scraped = await scrapeCGEPage(url);
        results.push(...scraped);
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const filteredByDate = results.filter(r => !r.date || new Date(r.date) >= cutoffDate);
    results.length = 0; 
    results.push(...filteredByDate);

    if (fs.existsSync('data.txt')) {
        const content = fs.readFileSync('data.txt', 'utf-8').trim();
        if (content) {
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i += 2) {
                const title = lines[i]?.trim();
                const loadDate = lines[i+1]?.trim() || '';
                if (!title || results.find(r => r.title === title)) continue;
                const d = extractEventDate(title, loadDate);
                results.push({
                    id: `official-${i}`, title, link: 'https://cge.entrerios.gov.ar/concursos-docentes/',
                    nivel: classifyLevel(title), date: d?.toISOString() || null, 
                    pubDate: new Date().toISOString().split('T')[0], department: classifyCity(title),
                    originalText: title, materias: [], plazas: []
                });
            }
        }
    }

    const seen = new Set();
    const unique = [];
    for (const item of results) {
        if (!seen.has(item.link + item.title)) {
            const docId = (item.link || "").replace(/\/$/, "").split('/').pop().replace(/[^a-zA-Z0-9]/g, '_') || `s_${Math.random().toString(36).substr(2, 5)}`;
            if (!blacklist.has(docId)) {
                unique.push(item);
                seen.add(item.link + item.title);
            }
        }
    }

    unique.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        return (b.solicitud || 0) - (a.solicitud || 0);
    });

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    if (!fs.existsSync('out')) fs.mkdirSync('out');
    fs.writeFileSync('parsed_data.json', JSON.stringify(unique, null, 2));
    fs.writeFileSync(path.join('public', 'parsed_data.json'), JSON.stringify(unique, null, 2));
    fs.writeFileSync(path.join('out', 'parsed_data.json'), JSON.stringify(unique, null, 2));

    console.log(`\nDONE: Saved ${unique.length} items.`);
    
    if (!IS_LOCAL_ONLY) {
        await syncToFirestore(unique);
    } else {
        console.log("Local only mode: skipped Firestore sync.");
    }
}

async function syncToFirestore(concursos) {
    console.log('\n--- SINCRONIZANDO CON FIRESTORE ---');
    try {
        const concursosRef = db.collection('concursos');
        let batch = db.batch();
        let count = 0;
        let batchCount = 0;
        for (const c of concursos) {
            const docId = (c.link || "").replace(/\/$/, "").split('/').pop().replace(/[^a-zA-Z0-9]/g, '_') || `s_${Math.random().toString(36).substr(2, 5)}`;
            const docRef = concursosRef.doc(docId);
            const snap = await docRef.get();
            
            if (snap.exists && snap.data().isManual) {
                console.log(`[MANUAL] Ignorando manual: ${docId}`);
                continue;
            }

            // DOUBLE CHECK BLACKLIST (in case it was added during run)
            const isEliminated = await db.collection('concursos_eliminados').doc(docId).get();
            if (isEliminated.exists) {
                console.log(`[BLACKLIST] Saltando concurso eliminado: ${docId}`);
                continue;
            }
            
            batch.set(docRef, { ...c, isManual: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            count++; batchCount++;
            if (batchCount === 450) { 
                await batch.commit(); 
                batch = db.batch(); 
                batchCount = 0; 
            }
        }
        if (batchCount > 0) await batch.commit();
        
        await db.collection('system').doc('robot_status').set({ 
            lastSync: admin.firestore.FieldValue.serverTimestamp(), 
            status: 'online', 
            version: 'v2.5.0-SMART' 
        }, { merge: true });
        
        console.log(`--- Sincronización exitosa: ${count} docs ---`);
    } catch (err) { 
        console.warn('Error sync:', err.message); 
    }
}

run();
