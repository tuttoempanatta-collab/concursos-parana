const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// Initialize Firebase Admin
if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: 'concursos-entre-rios'
            });
            console.log('Firebase Admin inicializado con Service Account.');
        } catch (e) {
            console.error('Error al parsear FIREBASE_SERVICE_ACCOUNT:', e.message);
            admin.initializeApp({ projectId: 'concursos-entre-rios' });
        }
    } else {
        admin.initializeApp({
            projectId: 'concursos-entre-rios'
        });
        console.log('Firebase Admin inicializado con Project ID (sin credenciales explícitas).');
    }
}
const db = admin.firestore();

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; 
    }
    return Math.abs(hash).toString(36);
}

const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dateRegex = /(\d{1,2})\s*(?:[y,-]\s*\d{1,2}\s*)*(?:-|de|al)?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s*(?:-|de|del)?\s*(\d{4}))?/i;
const numericDateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;

function extractEventDate(text, fallbackText, urlHint = null) {
    // Basic cleaning to avoid matching dates inside emails
    const cleanText = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
    
    const match = cleanText.match(dateRegex);
    const numMatch = cleanText.match(numericDateRegex);
    const timeRegex = /(?:a las\s*)?(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)/i;
    const timeMatch = cleanText.match(timeRegex);
    let timeHours = 0;
    let timeMinutes = 0;
    let timeSet = false;
    
    // Extract year hint from URL if available (e.g. /2025/)
    let urlYear = null;
    if (urlHint) {
        const urlMatch = urlHint.match(/\/20(\d{2})\//);
        if (urlMatch) urlYear = parseInt('20' + urlMatch[1], 10);
    }
    const currentYear = urlYear || new Date().getFullYear();
    
    if (timeMatch) {
       timeHours = parseInt(timeMatch[1], 10);
       timeMinutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
       timeSet = true;
    }

    if (match) {
        let day = parseInt(match[1], 10);
        let monthStr = match[2].toLowerCase();
        let monthIndex = months.indexOf(monthStr);
        let year = match[3] ? parseInt(match[3], 10) : currentYear;
        if (year < 100) year += 2000;
        
        if (!timeSet) {
            timeHours = 23;
            timeMinutes = 59;
        }
        
        return new Date(year, monthIndex, day, timeHours, timeMinutes, 0);
    }

    if (numMatch) {
        let day = parseInt(numMatch[1], 10);
        let month = parseInt(numMatch[2], 10) - 1;
        let year = parseInt(numMatch[3], 10);
        if (year < 100) year += 2000;
        
        // Sanity check for month (sometimes its MM/DD)
        if (month > 11) {
            // Swap if month looks like day (common in some formats, but Argentina uses DD/MM)
            // But here we keep it simple or stick to DD/MM
        }

        if (!timeSet) {
            timeHours = 23;
            timeMinutes = 59;
        }
        
        return new Date(year, month, day, timeHours, timeMinutes, 0);
    }
    
    if (fallbackText) {
        const altRegex = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
        const altMatch = fallbackText.match(altRegex);
        if (altMatch) {
            const fallbackYear = parseInt(altMatch[3], 10);
            const fallbackMonth = parseInt(altMatch[2], 10) - 1;
            const fallbackDay = parseInt(altMatch[1], 10);
            
            if (!timeSet) {
                timeHours = 23;
                timeMinutes = 59;
            }
            
            return new Date(fallbackYear, fallbackMonth, fallbackDay, timeHours, timeMinutes, 0);
        }
    }
    
    return null;
}

function classifyLevel(title) {
    const lowerTitle = title.toLowerCase();
    // Prioritize Secondary types first to avoid misclassification (e.g. EET N 3 having the word "iniciales")
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
    
    // General "Esc." or "Escuela" followed by a number is often Primary if it didn't match Secondary above
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
    
    // Check for specific localities first
    for (const loc of localidadesDeptParana) {
        if (lowerTitle.includes(loc)) {
            matchedCity = loc.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            // Normalize names
            if (matchedCity === 'Segui' || matchedCity === 'Seguí') matchedCity = 'Seguí';
            if (matchedCity.includes('Maria Grande') || matchedCity.includes('María Grande')) matchedCity = 'María Grande';
            if (matchedCity === 'Pna' || matchedCity === 'Pna.' || matchedCity === 'Pná' || matchedCity === 'Villa Mabel') matchedCity = 'Paraná Ciudad';
            return matchedCity;
        }
    }
    
    // Fallback check for "Paraná" variations
    for (const variant of paranaVariants) {
        if (lowerTitle.includes(variant)) {
            return 'Paraná Ciudad';
        }
    }

    return matchedCity;
}

async function fetchDetailedInfo(url) {
    try {
        console.log(`  Fetching details from ${url}...`);
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000 
        });
        const $ = cheerio.load(response.data);
        
        // REMOVE SCRIPTS AND STYLES before extracting text
        $('script, style, iframe, ins, .lat-not, footer, header').remove();

        // Extract full text content (all innerText)
        const fullTextContent = $('body').text().trim();
        const entryContent = $('.entry-content, .post-content, article, #main-content').first();
        
        const content = entryContent.text() || $('body').text();
        // Secondary regex cleaning for known junk strings
        const cleanContent = content
            .replace(/moment\.updateLocale[\s\S]*?\}\s*\);/g, '')
            .replace(/window\.twttr[\s\S]*?\}\s*\(document, "script", "twitter-wjs"\)\);/g, '')
            .replace(/\{"prefetch"[\s\S]*? conservative"\}\}/g, '')
            .replace(/\/\* <!\[CDATA\[ \*\/[\s\S]*?\/\* \]\]> \*/g, '');
            
        const lines = cleanContent.split('\n').map(l => l.trim()).filter(l => l.length > 3);
        const subjects = [];
        const plazas = [];
        let specificDate = null;
        let solicitud = null;
        let foundDate = null;
        let foundTime = { h: 23, m: 59 };
        let timeSet = false;

        for (const line of lines) {
            // Priority: Try to find a date in the body if we don't have one from title
            if (!foundDate) {
                // Email-safe check
                const cleanLine = line.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
                
                // Try month names first then numeric
                const dateMatch = cleanLine.match(dateRegex);
                const numDateMatch = cleanLine.match(numericDateRegex);
                
                if (dateMatch || numDateMatch) {
                    // Score the line: if it contains "día" or "fecha" or "hasta" it's more likely
                    const lowerLine = cleanLine.toLowerCase();
                    const isLikelyDate = lowerLine.includes('día') || lowerLine.includes('fecha') || lowerLine.includes('hasta') || lowerLine.includes('llama') || lowerLine.includes('convoca');
                    
                    if (dateMatch) {
                        let day = parseInt(dateMatch[1], 10);
                        let monthStr = dateMatch[2].toLowerCase();
                        let monthIndex = months.indexOf(monthStr);
                        // Extract year hint from URL or default to current
                        let urlMatch = url.match(/\/20(\d{2})\//);
                        let currentYearHint = urlMatch ? parseInt('20' + urlMatch[1], 10) : new Date().getFullYear();
                        
                        let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : currentYearHint;
                        if (year < 100) year += 2000;
                        foundDate = { day, monthIndex, year };
                    } else if (numDateMatch) {
                        let day = parseInt(numDateMatch[1], 10);
                        let monthIndex = parseInt(numDateMatch[2], 10) - 1;
                        let year = parseInt(numDateMatch[3], 10);
                        if (year < 100) year += 2000;
                        foundDate = { day, monthIndex, year };
                    }
                }
            }

            if (!solicitud) {
                const solMatch = line.match(/Solicitud\s*N[°º]?\s*(\d+)/i) || line.match(/(\d+)[°º]?\s*llamado/i);
                if (solMatch) solicitud = parseInt(solMatch[1], 10);
            }

            const lowerLine = line.toLowerCase();
            
            const isJobInfo = 
                lowerLine.includes('plaza') || 
                lowerLine.includes('hs cát') || lowerLine.includes('hs cat') || 
                lowerLine.includes('stf') || lowerLine.includes('stv') || 
                lowerLine.includes('cue') || 
                lowerLine.includes('cargo') || lowerLine.includes('maestro') || 
                lowerLine.includes('materia:') || lowerLine.includes('asignatura:') ||
                /\d+\s*hs/i.test(lowerLine);
            
            if (isJobInfo) {
                const level = classifyLevel(line);
                if (level === 'Secundario') {
                    subjects.push(line);
                } else {
                    plazas.push(line);
                }
            }
            
            if (
                lowerLine.includes('turno') || 
                /\d{1,2}[:\.]\d{2}\s*a\s*\d{1,2}[:\.]\d{2}/i.test(lowerLine) ||
                /\d{1,2}\s*(?:hs)?\s*a\s*\d{1,2}\s*(?:hs)?/i.test(lowerLine) ||
                /lunes|martes|miércoles|jueves|viernes/i.test(lowerLine)
            ) {
                if (!lowerLine.includes('llamado') && !lowerLine.includes('convoca')) {
                    if (plazas.length > 0 && !plazas.includes(line)) plazas.push(line);
                    else if (subjects.length > 0 && !subjects.includes(line)) subjects.push(line);
                }
            }

            if (!foundDate) {
                const dMatch = line.match(dateRegex);
                if (dMatch) {
                    const day = parseInt(dMatch[1], 10);
                    const monthStr = dMatch[2].toLowerCase();
                    const monthIndex = months.indexOf(monthStr);
                    let year = dMatch[3] ? parseInt(dMatch[3], 10) : new Date().getFullYear();
                    if (year < 100) year += 2000;
                    foundDate = { day, monthIndex, year };
                }
            }

            const isCallTimeLine = lowerLine.includes('llamado') || lowerLine.includes('convoca') || lowerLine.includes(' a las ');
            const timeMatch = line.match(/(?:a las\s*)?(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)/i);
            
            if (timeMatch) {
                const h = parseInt(timeMatch[1], 10);
                const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
                
                if (!timeSet || isCallTimeLine) {
                    foundTime = { h, m };
                    timeSet = true;
                }
            }
        }

        if (foundDate) {
            specificDate = new Date(foundDate.year, foundDate.monthIndex, foundDate.day, foundTime.h, foundTime.m, 0);
        }

        return { subjects: subjects.slice(0, 100), plazas: plazas.slice(0, 100), specificDate, fullTextContent, solicitud };
    } catch (e) {
        console.error(`  Failed to fetch details from ${url}: ${e.message}`);
        return { subjects: [], plazas: [], specificDate: null, fullTextContent: '' };
    }
}

let globalDeepScrapeCount = 0;
const MAX_DEEP_SCRAPES = 150; // Increased for aggressive scraping

async function scrapeCGEPage(url) {
    try {
        console.log(`Scraping list ${url}...`);
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000
        });
        const $ = cheerio.load(response.data);
        const results = [];
        const links = [];
        
        // Primary extraction from structured containers
        $('.lista, .lista1, article, .entry-content').find('h3, p, li').each((i, el) => {
            const containerText = $(el).text().trim();
            if (!containerText) return;

            $(el).find('a').each((j, a) => {
                const href = $(a).attr('href');
                if (!href || href.startsWith('javascript:') || href.includes('#')) return;
                
                const linkText = $(a).text().trim();
                // Combine text for better extraction: Link text + Container text
                const combinedText = (linkText.length > 30) ? linkText : `${containerText} ${linkText}`;
                const lowerText = combinedText.toLowerCase();

                // Strict Paraná Filter: If we are on the dept-parana page, it is Parana.
                const isParana = url.includes('departamental-parana') || lowerText.includes('paran') || lowerText.includes('pná') || lowerText.includes('pna');
                if (!isParana) return;

                if (lowerText.includes('concurso') || lowerText.includes('llama a') || lowerText.includes('convocatoria') || lowerText.includes('asamblea') || lowerText.includes('concursa')) {
                    const fullHref = href.startsWith('http') ? href : `https://cge.entrerios.gov.ar${href.startsWith('/') ? '' : '/'}${href}`;
                    if (!links.find(l => l.href === fullHref)) {
                        // Find publication date in preceding sibling paragraph if not in text
                        let pubDateText = '';
                        const prevP = $(el).prevAll('p').first();
                        if (prevP.length > 0) pubDateText = prevP.text().trim();
                        
                        links.push({ text: combinedText, href: fullHref, pubDateText });
                    }
                }
            });
        });

        // Secondary fallback for any link on the page that looks like a contest
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (!href || href.startsWith('javascript:') || href.includes('#')) return;
            if (links.find(l => l.href === href)) return;
            
            const text = $(el).text().trim();
            const parentText = $(el).parent().text().trim();
            const combinedText = `${parentText} ${text}`.trim();
            const lowerText = combinedText.toLowerCase();
            
            if (lowerText.includes('concurso') || lowerText.includes('llama a') || lowerText.includes('convocatoria')) {
                const isParana = url.includes('departamental-parana') || lowerText.includes('paran') || lowerText.includes('pná') || lowerText.includes('pna') || href.includes('departamental-parana');
                if (!isParana) return;

                const fullHref = href.startsWith('http') ? href : `https://cge.entrerios.gov.ar${href.startsWith('/') ? '' : '/'}${href}`;
                links.push({ text: combinedText, href: fullHref, pubDateText: '' });
            }
        });

        console.log(`- Found ${links.length} potential links on ${url}`);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);

        // --- ULTRA FAST: Sort by priority ---
        const prioritizedLinks = links.map(l => {
            const date = extractEventDate(l.text);
            const level = classifyLevel(l.text);
            let priority = 3; // Default low
            
            if (date && date >= startOfToday && date <= endOfTomorrow) priority = 1; // High (Today/Tomorrow)
            else if ((level === 'Secundario' || level === 'Primario' || level === 'Inicial') && !date) priority = 1; // High (generic main levels)
            else if (date && date > endOfTomorrow) priority = 2; // Normal (Future)
            
            return { ...l, date, level, priority };
        }).sort((a,b) => a.priority - b.priority);

        const BATCH_SIZE = 12;
        for (let i = 0; i < prioritizedLinks.length; i += BATCH_SIZE) {
            const batch = prioritizedLinks.slice(i, i + BATCH_SIZE);
            console.log(`- Processing batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(prioritizedLinks.length/BATCH_SIZE)} (Priority Mode)...`);
            
            const batchPromises = batch.map(async (linkObj) => {
                const { text, href, priority, pubDateText } = linkObj;
                // Aggressive: Only filter out very old URLs if they don't look like Parana
                if (!url.includes('departamental-parana') && !href.includes('/2026/') && !href.includes('/2025/')) return null; 
                
                const city = classifyCity(text);
                let level = linkObj.level;
                let date = extractEventDate(text, pubDateText); // Use pubDateText as fallback
                
                const detailedData = { subjects: [], plazas: [], fullContent: '' };
                
                // Deep scrape logic: Be very aggressive for Parana and High Priority
                const isParanaUrl = url.includes('departamental-parana');
                const canDeepScrape = (isParanaUrl && globalDeepScrapeCount < 150) || (priority === 1 && globalDeepScrapeCount < 160);
                
                if (canDeepScrape) {
                    globalDeepScrapeCount++;
                    const details = await fetchDetailedInfo(href);
                    detailedData.subjects = details.subjects;
                    detailedData.plazas = details.plazas;
                    detailedData.fullContent = details.fullTextContent;
                    
                    // Body-based classification if missing
                    if (details.fullTextContent) {
                        const bodyLower = details.fullTextContent.toLowerCase();
                        if (level === 'No especificado' || level === 'Otro') {
                            const newLevel = classifyLevel(details.fullTextContent);
                            if (newLevel !== 'No especificado') level = newLevel;
                        }
                    }

                    if (details.specificDate && (!date || date < details.specificDate)) date = details.specificDate;
                }

                return {
                    id: `scrape-${url.includes('departamental') ? 'dept' : 'main'}-${hashString(href)}`,
                    title: text,
                    link: href,
                    nivel: level,
                    date: date ? date.toISOString() : null,
                    department: city,
                    originalText: text,
                    materias: detailedData.subjects,
                    plazas: detailedData.plazas,
                    fullContent: detailedData.fullTextContent || '',
                    solicitud: detailedData.solicitud
                };
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.filter(r => r !== null));
            
            // Total limit to keep it stable but thorough
            if (globalDeepScrapeCount >= 150) break;
        }
        
        return results;
    } catch (e) {
        console.error(`- Scrape failed for ${url}: ${e.message}`);
        return [];
    }
}

async function run() {
    const results = [];
    const now = new Date();
    const cutoffDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14, 0, 0, 0);

    const urls = [
        'https://cge.entrerios.gov.ar/concursos-docentes/',
        'https://cge.entrerios.gov.ar/departamental-parana/'
    ];
    for (const url of urls) {
        const scraped = await scrapeCGEPage(url);
        results.push(...scraped);
    }

    if (fs.existsSync('data.txt')) {
        console.log("Parsing data.txt...");
        const content = fs.readFileSync('data.txt', 'utf-8').trim();
        if (content) {
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i += 2) {
                if (!lines[i]) continue;
                const title = lines[i].trim();
                const loadingDateLine = lines[i+1] ? lines[i+1].trim() : '';
                if (results.find(r => r.title === title)) continue;

                const city = classifyCity(title);
                const level = classifyLevel(title);
                const date = extractEventDate(title, loadingDateLine, 'https://cge.entrerios.gov.ar/concursos-docentes/');
                
                results.push({
                    id: `official-${i}`,
                    title: title,
                    link: 'https://cge.entrerios.gov.ar/concursos-docentes/',
                    nivel: level,
                    date: date ? date.toISOString() : null,
                    department: city,
                    originalText: title,
                    materias: [],
                    plazas: []
                });
            }
        }
    }

    let filtered = results.filter(item => {
        if (!item.date) return true;
        const itemDate = new Date(item.date);
        return itemDate.getTime() >= cutoffDate.getTime();
    });

    const unique = [];
    const linksSeen = new Set();
    const titlesSeen = new Set();
    
    for (const item of filtered) {
        if (!linksSeen.has(item.link) && !titlesSeen.has(item.title)) {
            unique.push(item);
            linksSeen.add(item.link);
            titlesSeen.add(item.title);
        }
    }

    unique.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        
        if (dateB !== dateA) return dateB - dateA;
        
        // Secondary sort by Solicitud Number (descending)
        const solA = a.solicitud || 0;
        const solB = b.solicitud || 0;
        return solB - solA;
    });

    fs.writeFileSync('parsed_data.json', JSON.stringify(unique, null, 2));
    console.log(`\nDONE: Saved ${unique.length} items to parsed_data.json (cut-off: ${cutoffDate.toLocaleDateString()})`);
    
    // SYNC TO FIRESTORE
    await syncToFirestore(unique);
}

async function syncToFirestore(concursos) {
    console.log('--- SINCRONIZANDO CON FIRESTORE ---');
    try {
        const batchSize = 500;
        for (let i = 0; i < concursos.length; i += batchSize) {
            const batch = db.batch();
            const chunk = concursos.slice(i, i + batchSize);
            
            chunk.forEach(concurso => {
                // Use a deterministic ID based on the link (same as hashString in frontend)
                const docId = concurso.link.split('/').pop().replace(/[^a-zA-Z0-9]/g, '_') || Math.random().toString(36).substr(2, 9);
                const docRef = db.collection('concursos').doc(docId);
                
                // set with merge: true to avoid overwriting manual edits (though scraper has priority on fields it found)
                batch.set(docRef, {
                    ...concurso,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });
            
            await batch.commit();
            console.log(`Batch ${i/batchSize + 1} sincronizado (${chunk.length} items)`);
        }
        console.log('¡Sincronización con Firestore exitosa!');
    } catch (err) {
        console.error('Error sincronizando con Firestore:', err.message);
    }
}

run();
