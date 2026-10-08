const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { getSlugId } = require('./utils/idUtils');
const { 
    instructRobotForPublishing, 
    extractSchoolName, 
    classifyLevel, 
    extractDeclaredDate,
    analyzeConcurso 
} = require('./aiConcursoEngine');
const { checkAdminCredentialMatch } = require('./adminCredentials');

const IS_LOCAL_ONLY = process.argv.includes('--local-only');

// In-memory cache of previously parsed contests to preserve detectedAt and history
const existingMap = new Map();
try {
    if (fs.existsSync('parsed_data.json')) {
        const rawExisting = JSON.parse(fs.readFileSync('parsed_data.json', 'utf8'));
        for (const item of rawExisting) {
            if (item.id) existingMap.set(item.id, item);
        }
        console.log(`[ROBOT] Cargados ${existingMap.size} concursos previos de parsed_data.json.`);
    }
} catch (e) {
    console.warn('[ROBOT] No se pudo leer parsed_data.json previo:', e.message);
}

// Initialize Firebase Admin
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
            console.log('Firebase Admin inicializado con Project ID.');
        }
    }
    db = admin.firestore();
}

const TARGET_YEAR = new Date().getFullYear();

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

/**
 * Filter to skip links older than 14 days (2 weeks) based on URL date
 */
function isLinkRecent(href) {
    const m = href.match(/\/20(\d{2})\/(\d{2})\//);
    if (!m) return true; // If no date in URL, don't skip
    const year = parseInt('20' + m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - 14); // 2 weeks (14 days)

    const postDate = new Date(year, month, 28);
    return postDate >= cutoff;
}

/**
 * Strict 14-day retention check for any concurso object
 */
function isWithinRetentionWindow(item, days = 14) {
    if (!item) return false;
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - days);

    if (item.date) {
        const d = new Date(item.date);
        if (!isNaN(d.getTime())) return d >= cutoff;
    }
    if (item.pubDate) {
        const d = new Date(item.pubDate);
        if (!isNaN(d.getTime())) return d >= cutoff;
    }
    if (item.detectedAt) {
        const d = new Date(item.detectedAt);
        if (!isNaN(d.getTime())) return d >= cutoff;
    }
    const text = `${item.title || ''} ${(item.fullContent || '').slice(0, 300)}`.toLowerCase();
    const oldMonthMatch = text.match(/\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto)\b/);
    if (oldMonthMatch && !text.includes('septiembre') && !text.includes('octubre') && !text.includes('noviembre') && !text.includes('diciembre')) {
        return false;
    }
    return true;
}

/**
 * Utility to add business days (skipping Sat/Sun)
 */
function addBusinessDays(startDate, days) {
    let result = new Date(startDate);
    let added = 0;
    while (added < days) {
        result.setUTCDate(result.getUTCDate() + 1);
        const dayOfWeek = result.getUTCDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0=Sun, 6=Sat
            added++;
        }
    }
    return result;
}

/**
 * Enhanced Date Extraction with Project Contest and Address Filter Support
 */
function extractEventDate(text, fallbackText, hintYear) {
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const dateRegex = /(\d{1,2})\s*(?:[y,-]\s*\d{1,2}\s*)*(?:-|de|al)?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s*(?:-|de|del)?\s*(\d{4}))?/gi;
    const pedidoDateRegex = /Fecha\s*(?:del\s*pedido|de\s*publicación|de\s*pedido)?\s*[:\-\s]+(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/i;
    const timeRegex = /(?:a las\s*|a partir de las\s*)?(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)\b/i;
    const timeRangeRegex = /(?:de|horario de)\s*(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)?\s*(?:a|hasta)\s*(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)/i;
    const businessDaysRegex = /(\d+)\s*días\s*hábiles/i;

    const defaultYear = hintYear || TARGET_YEAR;
    const cleanText = (text + " " + (fallbackText || "")).replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
    
    let refDate = null;
    let hours = 8;
    let minutes = 0;
    let needsReview = false;

    // 1. TOP PRIORITY: Direct "Se llevará a cabo el día..." / "El mismo se llevará a cabo..." phrasing
    // Explicit sentence where the contest actually occurs
    const carriedOutRegex = /(?:el\s*mismo\s*)?(?:se\s*llevar[aá]\s*a\s*cabo|se\s*realizar[aá]|a\s*llevarse\s*a\s*cabo|tendr[aá]\s*lugar|convoca(?:\s*a\s*concurso)?(?:\s*presencial)?\s*para|presentarse.*?el\s*d[ií]a)\s*(?:el\s*d[ií]a)?\s*([^\.\n\r]{10,140})/i;
    const carriedOutMatch = cleanText.match(carriedOutRegex);
    
    if (carriedOutMatch) {
        const segment = carriedOutMatch[1];
        const dateInSegment = segment.match(/(\d{1,2})\s*(?:-|de|al)?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s*(?:-|de|del)?\s*(\d{4}))?/i);
        const timeInSegment = segment.match(/(?:a las\s*|a partir de las\s*)?(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)\b/i);

        if (dateInSegment) {
            let day = parseInt(dateInSegment[1], 10);
            let month = months.indexOf(dateInSegment[2].toLowerCase());
            let year = dateInSegment[3] ? parseInt(dateInSegment[3], 10) : defaultYear;
            if (year < 100) year += 2000;

            if (timeInSegment) {
                hours = parseInt(timeInSegment[1], 10);
                minutes = timeInSegment[2] ? parseInt(timeInSegment[2], 10) : 0;
            } else {
                hours = 8;
                minutes = 0;
            }

            refDate = new Date(Date.UTC(year, month, day));
            refDate.setUTCHours(hours + 3, minutes, 0, 0);
            refDate.needsReview = false;
            return refDate;
        }
    }

    // 2. PROJECT CONTEST WITH BUSINESS DAYS: Base date + business days
    const isProject = /proyect[oó]/i.test(cleanText) || /carpetas?\s*de\s*antecedentes/i.test(cleanText);
    const busMatch = cleanText.match(businessDaysRegex);

    if (isProject && busMatch) {
        let baseDate = null;
        const pedidoMatch = cleanText.match(pedidoDateRegex);
        if (pedidoMatch) {
            let d = parseInt(pedidoMatch[1], 10);
            let m = parseInt(pedidoMatch[2], 10) - 1;
            let y = parseInt(pedidoMatch[3], 10);
            if (y < 100) y += 2000;
            baseDate = new Date(Date.UTC(y, m, d));
        } else {
            const topSlice = cleanText.slice(0, 500);
            const topNum = topSlice.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
            if (topNum) {
                let d = parseInt(topNum[1], 10);
                let m = parseInt(topNum[2], 10) - 1;
                let y = parseInt(topNum[3], 10);
                if (y < 100) y += 2000;
                baseDate = new Date(Date.UTC(y, m, d));
            }
        }

        if (baseDate) {
            const days = parseInt(busMatch[1], 10);
            refDate = addBusinessDays(baseDate, days);

            const rangeMatch = cleanText.match(timeRangeRegex);
            if (rangeMatch) {
                hours = parseInt(rangeMatch[3], 10);
                minutes = rangeMatch[4] ? parseInt(rangeMatch[4], 10) : 0;
            } else {
                hours = 18;
                minutes = 0;
                needsReview = true;
            }

            refDate.setUTCHours(hours + 3, minutes, 0, 0);
            refDate.needsReview = needsReview;
            return refDate;
        }
    }

    // 3. STANDARD CONTESTS: Find date with month name, skipping street addresses
    if (!refDate) {
        const matches = [...cleanText.matchAll(dateRegex)];
        for (const m of matches) {
            const index = m.index;
            const fullMatch = m[0].toLowerCase();
            const prefix = cleanText.substring(Math.max(0, index - 25), index).toLowerCase();

            // Street name filter: "Av. 9 de Julio", "Calle 25 de Mayo", "sita en Don Bosco", etc.
            const isStreet = /(?:av\.?|avenida|calle|pasaje|bvd|bulevar|ruta|sita en|domicilio|altura)\s*$/i.test(prefix.trim()) ||
                             (/av\.?\s*9\s*de\s*julio/i.test(cleanText) && fullMatch.includes('9 de julio'));

            if (!isStreet) {
                let day = parseInt(m[1], 10);
                let monthIndex = months.indexOf(m[2].toLowerCase());
                let year = m[3] ? parseInt(m[3], 10) : defaultYear;
                if (year < 100) year += 2000;
                refDate = new Date(Date.UTC(year, monthIndex, day));
                break;
            }
        }
    }

    // 3. Fallback to numeric date (explicitly preceded by "día" or "fecha")
    if (!refDate) {
        const explicitNum = cleanText.match(/(?:el\s*día|fecha:?)\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/i);
        if (explicitNum) {
            let day = parseInt(explicitNum[1], 10);
            let month = parseInt(explicitNum[2], 10) - 1;
            let year = parseInt(explicitNum[3], 10);
            if (year < 100) year += 2000;
            refDate = new Date(Date.UTC(year, month, day));
        }
    }

    if (!refDate) return null;

    // 4. TIME EXTRACTION
    const tMatch = cleanText.match(timeRegex);
    if (tMatch) {
        hours = parseInt(tMatch[1], 10);
        minutes = tMatch[2] ? parseInt(tMatch[2], 10) : 0;
    } else {
        hours = 8;
        minutes = 0;
    }

    refDate.setUTCHours(hours + 3, minutes, 0, 0);
    refDate.needsReview = false;
    return refDate;
}

/**
 * Extracts distinct subject, workshop, or project name cleanly
 */
function extractDistinctSubject(content) {
    if (!content) return null;

    // Pattern 1: Specific project name: PROYECTO: "Nombre Del Proyecto"
    const projMatch = content.match(/PROYECTO[\s:\-–—]+[“"']([^”"'\n\r]{4,70})[”"']/i);
    if (projMatch) {
        const p = projMatch[1].trim();
        if (!/mejora e inclusión|resoluc|concurso|educación/i.test(p)) return p;
    }

    // Pattern 2: "\d+ hs/horas cátedras de [Taller / Acompañamiento al estudio / etc.] [-–] [Materia]"
    const hsMatch = content.match(/\d+\s*h(?:oras?|s\.?)?\s*(?:cátedras?|cat\.?)?\s*de\s*(?:Taller|Acompañamiento\s*al\s*estudio)?\s*[\-–—:]?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ\s\.\/]{3,35})\s*(?:[\(–\-]|STF|Turno|\n|\r)/i);
    if (hsMatch) {
        let sub = hsMatch[1].trim().replace(/^de\s+/i, '').replace(/[\.\s]+$/, '').trim();
        if (sub.length >= 3 && sub.length <= 35 && !/requisito|bases|formato|papel|hoja|sobre|decreto|resol|ascenso|ingreso|jerarquía|conducción/i.test(sub)) {
            return sub;
        }
    }

    // Pattern 3: Specialized role only (e.g. "Rol de Referente Técnico Escolar")
    const rolMatch = content.match(/Rol\s*de\s*([A-Za-zÁÉÍÓÚáéíóúñÑ\s]{4,35})/i);
    if (rolMatch) {
        let r = rolMatch[1].trim();
        if (!/concurso|institución|escuela|ascenso|ingreso|jerarquía/i.test(r)) return r;
    }

    return null;
}

function classifyLevel(title) {
    const lowerTitle = title.toLowerCase();
    if (
        lowerTitle.includes('secundari') || lowerTitle.includes('sec.') || lowerTitle.includes('sec ') || 
        lowerTitle.includes('esja') || lowerTitle.includes('e.s.j.a') || lowerTitle.includes('eet') || 
        lowerTitle.includes('e.e.t') || lowerTitle.includes('eeat') || lowerTitle.includes('e.e.a.t') || 
        lowerTitle.includes('técnica') || lowerTitle.includes('tecnica') || lowerTitle.includes('orientada') || 
        lowerTitle.includes('liceo')
    ) return 'Secundario';
    
    if (
        lowerTitle.includes('primari') || lowerTitle.includes('nep') || lowerTitle.includes('nina') || 
        lowerTitle.includes('integral') || lowerTitle.includes('especial') || 
        /esc(?:uela|\.?)\s*(?:n[ro|º|°\.? ]*)?\d+/i.test(lowerTitle)
    ) return 'Primario';

    if (lowerTitle.includes('inicial') || lowerTitle.includes('jardin') || lowerTitle.includes('jardín')) return 'Inicial';
    if (lowerTitle.includes('superior') || lowerTitle.includes('isdf') || lowerTitle.includes('instituto') || lowerTitle.includes('profesorado')) return 'Superior';
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

    for (const loc of localidadesDeptParana) {
        if (lowerTitle.includes(loc)) {
            let matchedCity = loc.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            if (matchedCity === 'Segui' || matchedCity === 'Seguí') matchedCity = 'Seguí';
            if (matchedCity.includes('Maria Grande') || matchedCity.includes('María Grande')) matchedCity = 'María Grande';
            if (matchedCity === 'Pna' || matchedCity === 'Pna.' || matchedCity === 'Pná' || matchedCity === 'Villa Mabel') matchedCity = 'Paraná Ciudad';
            return matchedCity;
        }
    }
    for (const variant of paranaVariants) {
        if (lowerTitle.includes(variant)) return 'Paraná Ciudad';
    }
    return 'Paraná (Dpto)';
}

async function fetchDetailedInfo(url, urlYear, title = '') {
    try {
        console.log(`  Fetching details from ${url}...`);
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 });
        const $ = cheerio.load(response.data);
        $('script, style, iframe, ins, .lat-not, footer, header').remove();
        
        // Exact article content container in CGE Entre Ríos
        const articleContainer = $('.noticia-interior, .entry-content, .post-content, article').first();
        const content = articleContainer.length > 0 ? articleContainer.text() : $('body').text();
        const cleanContent = content
            .replace(/moment\.updateLocale[\s\S]*?\}\s*\);/g, '')
            .replace(/window\.twttr[\s\S]*?\}\s*\(document, "script", "twitter-wjs"\)\);/g, '')
            .replace(/Compartir\s*Tweet\s*WhatsApp\s*Imprimir/gi, '')
            .trim();
            
        const lines = cleanContent.split('\n').map(l => l.trim()).filter(l => l.length > 3);
        const subjects = [];
        const plazas = [];
        let solicitud = null;

        // 1. AI CONTINUOUS LEARNING & COGNITIVE DIRECTIVES FOR ROBOT
        const aiInstruct = await instructRobotForPublishing(cleanContent, title || url, urlYear);
        const specificDate = aiInstruct.date || null;
        const needsReview = aiInstruct.needsReview || false;

        // 2. EXTRACT DISTINCT SUBJECT / WORKSHOP
        let distinctSubject = extractDistinctSubject(cleanContent);
        if (!distinctSubject && aiInstruct.llamados?.length > 0 && aiInstruct.llamados[0].materia) {
            distinctSubject = aiInstruct.llamados[0].materia;
        }
        if (distinctSubject) {
            console.log(`    [DISTINCT] Found subject: ${distinctSubject}`);
        }
        if (aiInstruct.primaryLlamado) {
            console.log(`    [AI LLAMADO] ${aiInstruct.primaryLlamado}`);
        }
        if (aiInstruct.isAdminMatch) {
            console.log(`    [ADMIN MATCH] ⭐ ${aiInstruct.adminMatchedSubject}`);
        }

        // 3. EXTRACT PLAZAS / MATERIAS / SOLICITUD
        for (const line of lines) {
            if (!solicitud) {
                const solMatch = line.match(/Solicitud\s*N[°º]?\s*(\d+)/i) || line.match(/(\d+)[°º]?\s*llamado/i);
                if (solMatch) solicitud = parseInt(solMatch[1], 10);
            }
            const lowerLine = line.toLowerCase();
            const isJobInfo = lowerLine.includes('plaza') || lowerLine.includes('hs cát') || lowerLine.includes('hs cat') || 
                              lowerLine.includes('stf') || lowerLine.includes('cue') || lowerLine.includes('cargo') || 
                              /\d+\s*hs/i.test(lowerLine);
            if (isJobInfo) {
                const level = classifyLevel(line);
                if (level === 'Secundario' || level === 'Secundaria Técnica') subjects.push(line); else plazas.push(line);
            }
        }

        return { 
            subjects: subjects.slice(0, 100), 
            plazas: plazas.slice(0, 100), 
            specificDate, 
            fullTextContent: cleanContent, 
            solicitud, 
            isOld: false, 
            needsReview,
            distinctSubject,
            schoolName: aiInstruct.schoolName,
            nivel: aiInstruct.nivel,
            declaredDate: aiInstruct.declaredDate,
            isAdminMatch: aiInstruct.isAdminMatch,
            adminMatchedSubject: aiInstruct.adminMatchedSubject,
            isSegundoLlamado: aiInstruct.isSegundoLlamado || false,
            isAdminOpportunity: aiInstruct.isAdminOpportunity || false,
            publishingDirectives: aiInstruct.publishingDirectives,
            primaryLlamado: aiInstruct.primaryLlamado || null,
            llamadosSummary: aiInstruct.llamadosSummary || null,
            llamados: aiInstruct.llamados || [],
            caracteres: aiInstruct.caracteres || [],
            caracterSummary: aiInstruct.caracterSummary || null,
            plazasList: aiInstruct.plazasList || [],
            materiasSummary: aiInstruct.materiasSummary || null,
            totalHoras: aiInstruct.totalHoras || 0,
            plazasCount: aiInstruct.plazasCount || 0
        };
    } catch (e) {
        console.error(`  Failed to fetch details from ${url}: ${e.message}`);
        return { 
            subjects: [], plazas: [], specificDate: null, fullTextContent: '', isOld: false, needsReview: false, 
            distinctSubject: null, schoolName: 'Escuela Departamental', nivel: 'No especificado', declaredDate: null,
            isAdminMatch: false, adminMatchedSubject: null, isSegundoLlamado: false, isAdminOpportunity: false, publishingDirectives: null,
            primaryLlamado: null, llamadosSummary: null, llamados: [], caracteres: [], caracterSummary: null, 
            plazasList: [], materiasSummary: null, totalHoras: 0, plazasCount: 0 
        };
    }
}

let globalDeepScrapeCount = 0;

async function scrapeCGEPage(url) {
    try {
        console.log(`Scraping list ${url}...`);
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 25000 });
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

                if (EXCLUDED_TITLES.includes(lowerText.trim())) return;

                const isParana = url.includes('departamental-parana') || lowerText.includes('paran') || lowerText.includes('pná') || lowerText.includes('pna');
                if (!isParana) return;
                
                if (lowerText.includes('concurso') || lowerText.includes('cocnurso') || lowerText.includes('llamad') || lowerText.includes('llama') || lowerText.includes('convoca') || lowerText.includes('asamblea') || lowerText.includes('desconvoca')) {
                    const fullHref = href.startsWith('http') ? href : `https://cge.entrerios.gov.ar${href.startsWith('/') ? '' : '/'}${href}`;
                    if (EXCLUDED_URLS.includes(fullHref)) return;

                    // Skip links older than 45 days
                    if (!isLinkRecent(fullHref)) return;

                    if (!links.find(l => l.href === fullHref)) {
                        let pubDateText = '';
                        const prevP = $(el).prevAll('p').first();
                        if (prevP.length > 0) pubDateText = prevP.text().trim();
                        links.push({ text: combinedText, href: fullHref, pubDateText });
                    }
                }
            });
        });

        console.log(`- Found ${links.length} recent potential links on ${url}`);
        const now = new Date();
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(now);
        
        links.forEach((l, idx) => { l.cgeOrder = idx; });

        // Deep scrape top 80 newest recent links
        for (const linkObj of links) {
            const { text, href, pubDateText } = linkObj;
            
            const urlMatch = href.match(/\/20(\d{2})\//);
            const urlYear = urlMatch ? parseInt('20' + urlMatch[1], 10) : TARGET_YEAR;

            const city = classifyCity(text);
            const level = classifyLevel(text);
            let date = extractEventDate(text, pubDateText, urlYear);
            
            if (globalDeepScrapeCount < 80) {
                globalDeepScrapeCount++;
                const details = await fetchDetailedInfo(href, urlYear, text);
                const docId = getSlugId(href);
                
                // Refine title ONLY if distinctSubject is concise and not already present
                let finalTitle = text;
                if (details.distinctSubject && details.distinctSubject.length <= 40 && !text.toLowerCase().includes(details.distinctSubject.toLowerCase())) {
                    finalTitle = `${text} (${details.distinctSubject})`;
                }

                // Check historical tracking / detection timestamp
                const existing = existingMap.get(docId);
                let detectedAt;
                let isTardio;

                if (existing && existing.detectedAt) {
                    // Do not alter timestamp or status of already tracked contest
                    detectedAt = existing.detectedAt;
                    isTardio = existing.isTardio ?? false;
                } else {
                    // First time detected by the robot
                    detectedAt = now.toISOString();
                    const declared = details.declaredDate;
                    const eventDate = details.specificDate || date;
                    const isEventActive = !eventDate || new Date(eventDate) >= new Date(todayStr + 'T00:00:00Z');
                    if (declared && declared < todayStr && isEventActive) {
                        isTardio = true;
                    } else {
                        isTardio = false;
                    }
                }

                results.push({
                    id: docId,
                    title: finalTitle,
                    schoolName: details.schoolName || extractSchoolName(text, details.fullTextContent),
                    distinctSubject: details.distinctSubject || null,
                    primaryLlamado: details.primaryLlamado || null,
                    llamadosSummary: details.llamadosSummary || null,
                    llamados: details.llamados || [],
                    caracteres: details.caracteres || [],
                    caracterSummary: details.caracterSummary || null,
                    plazasList: details.plazasList || [],
                    materiasSummary: details.materiasSummary || null,
                    totalHoras: details.totalHoras || 0,
                    plazasCount: details.plazasCount || 0,
                    link: href,

                    nivel: details.nivel || level,
                    date: (details.specificDate || date)?.toISOString() || null,
                    pubDate: details.declaredDate || (existing && existing.pubDate) || todayStr,
                    declaredDate: details.declaredDate || null,
                    detectedAt: detectedAt,
                    isTardio: isTardio,
                    isAdminMatch: details.isAdminMatch || false,
                    adminMatchedSubject: details.adminMatchedSubject || null,
                    isSegundoLlamado: details.isSegundoLlamado || false,
                    isAdminOpportunity: details.isAdminOpportunity || false,
                    publishingDirectives: details.publishingDirectives || null,
                    department: city,
                    originalText: text,
                    materias: details.subjects,
                    plazas: details.plazas,
                    fullContent: details.fullTextContent || '',
                    solicitud: details.solicitud,
                    cgeOrder: linkObj.cgeOrder,
                    needsReview: details.needsReview || false
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
    const urls = [
        'https://cge.entrerios.gov.ar/departamental-parana/',
        'https://cge.entrerios.gov.ar/concursos-docentes/'
    ];

    for (const url of urls) {
        const scraped = await scrapeCGEPage(url);
        results.push(...scraped);
    }

    // Strict 14-day (2 weeks) retention: purge anything older
    const filteredByDate = results.filter(r => isWithinRetentionWindow(r, 14));
    results.length = 0; 
    results.push(...filteredByDate);

    // Deduplication by slug ID
    const seen = new Set();
    const unique = [];
    const unclassified = [];

    for (const item of results) {
        const docId = getSlugId(item.link);
        if (!seen.has(docId) && !blacklist.has(docId)) {
            unique.push(item);
            seen.add(docId);

            if (item.needsReview || item.nivel === 'No especificado' || !item.date) {
                unclassified.push({ ...item, docId });
            }
        }
    }

    // Sort: newest first
    unique.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        return (a.cgeOrder ?? 999) - (b.cgeOrder ?? 999);
    });

    // Update and enrich AI Schools Catalog
    try {
        let catalog = { totalSchools: 0, tecnicasCount: 0, schools: [] };
        if (fs.existsSync('ai_schools.json')) {
            catalog = JSON.parse(fs.readFileSync('ai_schools.json', 'utf8'));
        }
        const schoolMap = new Map();
        if (catalog.schools && Array.isArray(catalog.schools)) {
            for (const s of catalog.schools) {
                if (s.name) schoolMap.set(s.name, s);
            }
        }
        for (const u of unique) {
            if (u.schoolName && u.schoolName !== 'Escuela Departamental' && u.schoolName.length > 3) {
                if (!schoolMap.has(u.schoolName)) {
                    schoolMap.set(u.schoolName, {
                        name: u.schoolName,
                        nivel: u.nivel || 'No especificado',
                        city: (u.department || 'Paraná').replace('(Dpto)', '').trim(),
                        contestsCount: 1
                    });
                } else {
                    const existing = schoolMap.get(u.schoolName);
                    existing.contestsCount = (existing.contestsCount || 0) + 1;
                    if (u.nivel === 'Secundaria Técnica') existing.nivel = 'Secundaria Técnica';
                }
            }
        }
        const updatedSchools = Array.from(schoolMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        catalog.updatedAt = new Date().toISOString();
        catalog.totalSchools = updatedSchools.length;
        catalog.tecnicasCount = updatedSchools.filter(s => s.nivel === 'Secundaria Técnica').length;
        catalog.schools = updatedSchools;
        fs.writeFileSync('ai_schools.json', JSON.stringify(catalog, null, 2));
        if (fs.existsSync('public')) fs.writeFileSync(path.join('public', 'ai_schools.json'), JSON.stringify(catalog, null, 2));
        if (fs.existsSync('out')) fs.writeFileSync(path.join('out', 'ai_schools.json'), JSON.stringify(catalog, null, 2));
        console.log(`[AI ENGINE] Catálogo de escuelas actualizado: ${updatedSchools.length} escuelas (${catalog.tecnicasCount} técnicas).`);
    } catch (e) {
        console.warn('[AI ENGINE] Error actualizando ai_schools.json:', e.message);
    }

    if (!fs.existsSync('public')) fs.mkdirSync('public');
    if (!fs.existsSync('out')) fs.mkdirSync('out');
    fs.writeFileSync('parsed_data.json', JSON.stringify(unique, null, 2));
    fs.writeFileSync(path.join('public', 'parsed_data.json'), JSON.stringify(unique, null, 2));
    fs.writeFileSync(path.join('out', 'parsed_data.json'), JSON.stringify(unique, null, 2));

    console.log(`\nDONE: Saved ${unique.length} clean, active items.`);
    
    if (!IS_LOCAL_ONLY && db) {
        console.log(`Syncing ${unique.length} successfully parsed to Firestore...`);
        await syncToFirestore(unique, unclassified);
    } else {
        console.log("Local only mode: skipped Firestore sync.");
    }
}

async function syncToFirestore(concursos, unclassified = []) {
    console.log('\n--- SINCRONIZANDO CON FIRESTORE ---');
    try {
        const concursosRef = db.collection('concursos');
        let batch = db.batch();
        let count = 0;
        let batchCount = 0;
        
        for (const c of concursos) {
            const docId = getSlugId(c.link);
            const docRef = concursosRef.doc(docId);
            const snap = await docRef.get();
            
            if (snap.exists && snap.data().isManual) {
                console.log(`[MANUAL] Ignorando manual: ${docId}`);
                continue;
            }

            const isEliminated = await db.collection('concursos_eliminados').doc(docId).get();
            if (isEliminated.exists) {
                console.log(`[BLACKLIST] Saltando concurso eliminado: ${docId}`);
                continue;
            }

            if (snap.exists) {
                delete c.pubDate;
                if (snap.data().detectedAt) {
                    delete c.detectedAt;
                    delete c.isTardio;
                }
            }
            
            batch.set(docRef, { ...c, isManual: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            count++; 
            batchCount++;
            if (batchCount === 450) { 
                await batch.commit(); 
                batch = db.batch(); 
                batchCount = 0; 
            }
        }
        if (batchCount > 0) await batch.commit();
        
        // Review queue sync
        let unclassBatch = db.batch();
        let unclassCount = 0;
        let unclassBatchCount = 0;
        for (const c of unclassified) {
            const docId = c.docId;
            const ref = db.collection('concursos_pendientes_revision').doc(docId);
            unclassBatch.set(ref, {
                 ...c,
                 status: 'pending',
                 discoveredAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            unclassCount++;
            unclassBatchCount++;
            if (unclassBatchCount === 450) {
                await unclassBatch.commit();
                unclassBatch = db.batch();
                unclassBatchCount = 0;
            }
        }
        if (unclassBatchCount > 0) await unclassBatch.commit();

        // Auto-purge old contests from Firestore (> 14 days)
        try {
            console.log('[ROBOT] Verificando y purgando publicaciones viejas (> 14 días) en Firestore...');
            const allSnap = await concursosRef.get();
            let pruneBatch = db.batch();
            let pruneCount = 0;
            let pruneBatchCount = 0;
            for (const d of allSnap.docs) {
                const docData = d.data();
                if (!isWithinRetentionWindow(docData, 14)) {
                    pruneBatch.delete(d.ref);
                    pruneCount++;
                    pruneBatchCount++;
                    if (pruneBatchCount === 450) {
                        await pruneBatch.commit();
                        pruneBatch = db.batch();
                        pruneBatchCount = 0;
                    }
                }
            }
            if (pruneBatchCount > 0) await pruneBatch.commit();
            if (pruneCount > 0) console.log(`[ROBOT] Purgados exitosamente ${pruneCount} concursos obsoletos de Firestore.`);
        } catch (pruneErr) {
            console.warn('[ROBOT] Advertencia al purgar Firestore:', pruneErr.message);
        }
        
        await db.collection('system').doc('robot_status').set({ 
            lastSync: admin.firestore.FieldValue.serverTimestamp(), 
            status: 'online', 
            version: 'v3.2.0-CLEAN',
            scrapedCount: count,
            unclassifiedCount: unclassCount
        }, { merge: true });
        
        console.log(`--- Sincronización exitosa: ${count} docs, ${unclassCount} en revisión ---`);
    } catch (err) { 
        console.warn('Error sync:', err.message); 
    }
}

run();
