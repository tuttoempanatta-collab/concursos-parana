const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PATTERNS_PATH = path.join(__dirname, 'ai_patterns.json');

// In-memory patterns cache
let patternsData = null;

function loadPatterns() {
    try {
        if (fs.existsSync(PATTERNS_PATH)) {
            patternsData = JSON.parse(fs.readFileSync(PATTERNS_PATH, 'utf8'));
        }
    } catch (e) {
        console.warn('[AI ENGINE] Error reading ai_patterns.json:', e.message);
    }

    if (!patternsData) {
        patternsData = {
            version: 1,
            eventPhrases: [],
            multiLlamadoPatterns: [],
            projectPatterns: [],
            excludedAddressKeywords: ['av', 'avenida', 'calle', 'sita en', 'domicilio', 'altura'],
            streetDates: ['9 de julio', '25 de mayo', '1 de mayo', '3 de febrero', '8 de octubre']
        };
    }
    return patternsData;
}

function saveLearnedPattern(newPhrase) {
    if (!newPhrase || newPhrase.length < 5 || newPhrase.length > 200) return;
    try {
        const patterns = loadPatterns();
        const exists = patterns.eventPhrases.some(p => p.regex && newPhrase.includes(p.id));
        if (!exists) {
            const cleanId = newPhrase.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '_');
            const escaped = newPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 80);
            patterns.eventPhrases.push({
                id: cleanId,
                regex: escaped,
                description: `Patrón aprendido dinámicamente de publicación escolar`,
                learnedAt: new Date().toISOString()
            });
            fs.writeFileSync(PATTERNS_PATH, JSON.stringify(patterns, null, 2));
            console.log(`[AI ENGINE] [APRENDIZAJE] ¡Nuevo patrón de escritura aprendido y guardado!: "${cleanId}"`);
        }
    } catch (e) {
        console.warn('[AI ENGINE] No se pudo persistir el patrón aprendido:', e.message);
    }
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function addBusinessDays(startDate, days) {
    let result = new Date(startDate);
    let added = 0;
    while (added < days) {
        result.setUTCDate(result.getUTCDate() + 1);
        const dayOfWeek = result.getUTCDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip Sat/Sun
            added++;
        }
    }
    return result;
}

/**
 * Extracts multiple calls, schedules, and subjects (e.g., 1° Llamado 17:30 hs, 2° Llamado 18:00 hs)
 */
function extractMultiLlamados(text) {
    const llamados = [];
    if (!text) return { llamados, primaryLlamado: null, llamadosSummary: null };

    // Format A: "Primer Llamado a las 17:30 H." / "1° Llamado a las 18:00 hs: MATEMATICA"
    const regexA = /(?:^|\n|\r|–|-)\s*(primer\s*llamado|segundo\s*llamado|tercer\s*llamado|\d+[°º]?\s*llamado)\s*(?:a\s*las|horario)?\s*(\d{1,2}[:\.]\d{2}|\d{1,2})\s*(?:hs|h|horas)?[\s:\-–—\.]*([^\n\r]{0,120})/gi;
    let match;
    while ((match = regexA.exec(text)) !== null) {
        const rawCall = match[1].trim();
        const rawTime = match[2].trim().replace('.', ':');
        const rest = match[3] ? match[3].trim() : '';

        // Extract subject if available in the rest
        let materia = null;
        let hsCatedra = null;

        const hsMatch = rest.match(/(\d+)\s*(?:hs|horas)/i);
        if (hsMatch) hsCatedra = parseInt(hsMatch[1], 10);

        // Filter out noise in subject
        const subMatch = rest.match(/(?:hs[\.;,\s]+)?([A-ZÁÉÍÓÚÑa-z]{3,35}(?:\s+[A-ZÁÉÍÓÚÑa-z]{3,35}){0,4})/);
        if (subMatch && !/^(?:de|en|los|para|con|la|el|plaza|sage|turno|stf)/i.test(subMatch[1].trim())) {
            materia = subMatch[1].trim();
        }

        let timeNorm = rawTime;
        if (!timeNorm.includes(':')) timeNorm = `${timeNorm}:00`;

        llamados.push({
            llamado: rawCall.replace(/primer\s*llamado/i, '1° Llamado').replace(/segundo\s*llamado/i, '2° Llamado'),
            time: timeNorm,
            materia: materia || null,
            hsCatedra: hsCatedra || null,
            rawSnippet: rest.slice(0, 60)
        });
    }

    // Format B: "A las 18:00hs – 1° Llamado – 03 hs Formación Ética..."
    if (llamados.length === 0) {
        const regexB = /(?:a\s*las\s*)?(\d{1,2}[:\.]\d{2}|\d{1,2})\s*(?:hs|h|horas)?\s*[-–—:]\s*(\d+[°º]?\s*llamado|primer\s*llamado|segundo\s*llamado)\s*[-–—:]\s*([^\n\r]{0,120})/gi;
        while ((match = regexB.exec(text)) !== null) {
            const rawTime = match[1].trim().replace('.', ':');
            const rawCall = match[2].trim();
            const rest = match[3] ? match[3].trim() : '';

            let materia = null;
            let hsCatedra = null;
            const hsMatch = rest.match(/(\d+)\s*(?:hs|horas)/i);
            if (hsMatch) hsCatedra = parseInt(hsMatch[1], 10);

            const subMatch = rest.match(/(?:hs[\.;,\s]+)?([A-ZÁÉÍÓÚÑa-z]{3,35}(?:\s+[A-ZÁÉÍÓÚÑa-z]{3,35}){0,4})/);
            if (subMatch && !/^(?:de|en|los|para|con|la|el|plaza|sage|turno|stf)/i.test(subMatch[1].trim())) {
                materia = subMatch[1].trim();
            }

            let timeNorm = rawTime;
            if (!timeNorm.includes(':')) timeNorm = `${timeNorm}:00`;

            llamados.push({
                llamado: rawCall.replace(/primer\s*llamado/i, '1° Llamado').replace(/segundo\s*llamado/i, '2° Llamado'),
                time: timeNorm,
                materia: materia || null,
                hsCatedra: hsCatedra || null,
                rawSnippet: rest.slice(0, 60)
            });
        }
    }

    let primaryLlamado = null;
    let llamadosSummary = null;

    if (llamados.length > 0) {
        const first = llamados[0];
        primaryLlamado = `${first.llamado}: ${first.time} hs${first.materia ? ` (${first.materia})` : ''}`;
        if (llamados.length === 1) {
            llamadosSummary = primaryLlamado;
        } else {
            llamadosSummary = llamados.map(l => `${l.llamado.replace(' Llamado', '')}: ${l.time} hs${l.materia ? ` - ${l.materia}` : ''}`).join(' | ');
        }
    } else {
        // Fallback for single call mentioned in title/intro: "Primer Llamado" or "1er llamado" + "a las XX hs"
        const singleCallMatch = text.match(/(primer\s*llamado|1er\s*llamado|1°\s*llamado|segundo\s*llamado|2do\s*llamado|2°\s*llamado)/i);
        const timeMatch = text.match(/(?:a las\s*|a partir de las\s*)(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)\b/i);
        const cargoMatch = text.match(/Cargo\s+[“"']([^”"'\n\r]{3,35})[”"']/i) || text.match(/Cargo\s*:\s*([A-Za-zÁÉÍÓÚáéíóúñÑ\s\/]{3,35})/i);

        if (singleCallMatch && timeMatch) {
            const h = timeMatch[1].padStart(2, '0');
            const m = (timeMatch[2] || '00').padStart(2, '0');
            const callName = singleCallMatch[1].replace(/1er\s*llamado|primer\s*llamado/i, '1° Llamado').replace(/2do\s*llamado|segundo\s*llamado/i, '2° Llamado');
            const cargo = cargoMatch ? cargoMatch[1].trim() : null;
            primaryLlamado = `${callName}: ${h}:${m} hs${cargo ? ` (${cargo})` : ''}`;
            llamadosSummary = primaryLlamado;
            llamados.push({
                llamado: callName,
                time: `${h}:${m}`,
                materia: cargo,
                hsCatedra: null
            });
        }
    }

    return { llamados, primaryLlamado, llamadosSummary };
}

/**
 * Intelligent Contest Parser using Pattern-Matching & Learned Heuristics
 */
function parseConcursoHeuristics(cleanText, fallbackText, hintYear) {
    const patterns = loadPatterns();
    const defaultYear = hintYear || new Date().getFullYear();

    let refDate = null;
    let hours = 8;
    let minutes = 0;
    let confidence = 'medium';
    let matchedPatternId = null;

    // 1. Direct carried out phrases ("El mismo se llevará a cabo el día...", "se realizará el día...", "presentarse el día...")
    for (const p of patterns.eventPhrases) {
        const reg = new RegExp(p.regex, 'i');
        const match = cleanText.match(reg);
        if (match) {
            const segment = match[1] || match[0];
            const dateInSegment = segment.match(/(\d{1,2})\s*(?:-|de|al)?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s*(?:-|de|del)?\s*(\d{4}))?/i);
            const timeInSegment = segment.match(/(?:a las\s*|a partir de las\s*)?(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)\b/i);

            if (dateInSegment) {
                let day = parseInt(dateInSegment[1], 10);
                let month = MONTHS.indexOf(dateInSegment[2].toLowerCase());
                let year = dateInSegment[3] ? parseInt(dateInSegment[3], 10) : defaultYear;
                if (year < 100) year += 2000;

                if (timeInSegment) {
                    hours = parseInt(timeInSegment[1], 10);
                    minutes = timeInSegment[2] ? parseInt(timeInSegment[2], 10) : 0;
                } else {
                    // Check elsewhere in text for multi-call or time
                    const genTime = cleanText.match(/(?:a las\s*)?(\d{1,2})[:,\.](\d{2})\s*(?:hs|h)\b/i);
                    if (genTime) {
                        hours = parseInt(genTime[1], 10);
                        minutes = parseInt(genTime[2], 10);
                    } else {
                        hours = 8;
                        minutes = 0;
                    }
                }

                refDate = new Date(Date.UTC(year, month, day));
                refDate.setUTCHours(hours + 3, minutes, 0, 0); // Convert from ART (UTC-3) to UTC
                confidence = 'high';
                matchedPatternId = p.id;
                break;
            }
        }
    }

    // 2. Project Contest Patterns (Business Days or Date Ranges)
    const isProject = /proyect[oó]/i.test(cleanText) || /carpetas?\s*de\s*antecedentes/i.test(cleanText);
    if (!refDate && isProject) {
        const busMatch = cleanText.match(/(\d+)\s*d[ií]as\s*h[aá]biles/i);
        const pedidoDateRegex = /Fecha\s*(?:del\s*pedido|de\s*publicación|de\s*pedido)?\s*[:\-\s]+(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/i;
        
        if (busMatch) {
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
                refDate.setUTCHours(18 + 3, 0, 0, 0);
                confidence = 'medium';
                matchedPatternId = 'project_business_days';
            }
        }

        // Project reception range: "desde el día 01 al 08 de octubre de 2026"
        const rangeMatch = cleanText.match(/desde\s*el\s*d[ií]a\s*(\d{1,2})\s*(?:al|hasta\s*el)\s*(\d{1,2})\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s*(?:de|del)?\s*(\d{4}))?/i);
        if (rangeMatch && !refDate) {
            const endDay = parseInt(rangeMatch[2], 10);
            const m = MONTHS.indexOf(rangeMatch[3].toLowerCase());
            let y = rangeMatch[4] ? parseInt(rangeMatch[4], 10) : defaultYear;
            if (y < 100) y += 2000;

            refDate = new Date(Date.UTC(y, m, endDay));
            refDate.setUTCHours(18 + 3, 0, 0, 0);
            confidence = 'high';
            matchedPatternId = 'project_date_range';
        }
    }

    // 3. Fallback to standard date in text with Month name (ignoring street addresses)
    if (!refDate) {
        const dateRegex = /(\d{1,2})\s*(?:[y,-]\s*\d{1,2}\s*)*(?:-|de|al)?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s*(?:-|de|del)?\s*(\d{4}))?/gi;
        const matches = [...cleanText.matchAll(dateRegex)];
        for (const m of matches) {
            const index = m.index;
            const fullMatch = m[0].toLowerCase();
            const prefix = cleanText.substring(Math.max(0, index - 25), index).toLowerCase();

            const isStreet = patterns.excludedAddressKeywords.some(kw => prefix.includes(kw)) ||
                             patterns.streetDates.some(sd => fullMatch.includes(sd));

            if (!isStreet) {
                let day = parseInt(m[1], 10);
                let monthIndex = MONTHS.indexOf(m[2].toLowerCase());
                let year = m[3] ? parseInt(m[3], 10) : defaultYear;
                if (year < 100) year += 2000;
                refDate = new Date(Date.UTC(year, monthIndex, day));

                const tMatch = cleanText.match(/(?:a las\s*|a partir de las\s*)?(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)\b/i);
                if (tMatch) {
                    hours = parseInt(tMatch[1], 10);
                    minutes = tMatch[2] ? parseInt(tMatch[2], 10) : 0;
                }
                refDate.setUTCHours(hours + 3, minutes, 0, 0);
                confidence = 'medium';
                break;
            }
        }
    }

    return { refDate, confidence, matchedPatternId };
}

/**
 * Gemini LLM integration for ambiguous texts and continuous learning
 */
async function parseWithGeminiLLM(cleanText, title, urlYear) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    try {
        const prompt = `Analiza el siguiente texto de un concurso docente de Entre Ríos y extrae la información en formato JSON estricto.
Texto:
${cleanText.slice(0, 2500)}

Título: ${title}
Año de referencia: ${urlYear}

Devuelve ÚNICAMENTE un objeto JSON válido con este formato:
{
  "eventDate": "YYYY-MM-DD",
  "eventTime": "HH:MM",
  "primaryLlamado": "1° Llamado: HH:MM hs (Materia)",
  "llamados": [
    { "llamado": "1° Llamado", "time": "HH:MM", "materia": "Nombre", "hsCatedra": 3 }
  ],
  "distinctSubject": "Materia o nombre de proyecto",
  "isProject": false,
  "matchedPhrase": "fragmento exacto del texto donde se anuncia la fecha y hora del concurso"
}`;

        const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.1
                }
            },
            { timeout: 15000 }
        );

        const textResp = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textResp) return null;

        const parsed = JSON.parse(textResp);
        if (parsed.matchedPhrase) {
            saveLearnedPattern(parsed.matchedPhrase);
        }

        if (parsed.eventDate) {
            const [y, m, d] = parsed.eventDate.split('-').map(Number);
            const [hh, mm] = (parsed.eventTime || '08:00').split(':').map(Number);
            const dt = new Date(Date.UTC(y, m - 1, d));
            dt.setUTCHours(hh + 3, mm || 0, 0, 0);
            return {
                date: dt,
                llamados: parsed.llamados || [],
                primaryLlamado: parsed.primaryLlamado || null,
                distinctSubject: parsed.distinctSubject || null,
                isProject: !!parsed.isProject,
                confidence: 'high'
            };
        }
    } catch (e) {
        console.warn('[AI ENGINE] Gemini API fallback error:', e.message);
    }
    return null;
}

/**
 * Main engine entry point: Analyzes article content with patterns, multi-llamados, and self-learning
 */
async function analyzeConcurso(content, title, urlYear = 2026) {
    if (!content) return { date: null, llamados: [], primaryLlamado: null, llamadosSummary: null, distinctSubject: null };

    // 1. Clean content of scripts, emails, and useless code
    const clean = content
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
        .replace(/moment\.updateLocale[\s\S]*?\}\s*\);/g, '')
        .replace(/window\.twttr[\s\S]*?\}\s*\(document, "script", "twitter-wjs"\)\);/g, '')
        .trim();

    // 2. Extract multi-llamados (1° llamado, 2° llamado, horarios, materias)
    const multiLlamadosData = extractMultiLlamados(clean);

    // 3. Fast & precise heuristics + learned patterns
    const heuristicResult = parseConcursoHeuristics(clean, title, urlYear);

    let finalDate = heuristicResult.refDate;
    let confidence = heuristicResult.confidence;
    let primaryLlamado = multiLlamadosData.primaryLlamado;
    let llamados = multiLlamadosData.llamados;
    let llamadosSummary = multiLlamadosData.llamadosSummary;

    // Adjust date time if primaryLlamado has an exact time and heuristic used generic default 8:00
    if (finalDate && multiLlamadosData.llamados.length > 0) {
        const firstTime = multiLlamadosData.llamados[0].time;
        if (firstTime) {
            const [h, m] = firstTime.split(':').map(Number);
            finalDate.setUTCHours(h + 3, m || 0, 0, 0);
        }
    }

    // 4. If confidence is low or date wasn't found, try LLM if API Key is available
    if ((!finalDate || confidence === 'low') && process.env.GEMINI_API_KEY) {
        console.log(`  [AI ENGINE] Consultando modelo de lenguaje para "${title.slice(0, 40)}..."`);
        const llmResult = await parseWithGeminiLLM(clean, title, urlYear);
        if (llmResult && llmResult.date) {
            finalDate = llmResult.date;
            if (llmResult.primaryLlamado) primaryLlamado = llmResult.primaryLlamado;
            if (llmResult.llamados?.length) llamados = llmResult.llamados;
            confidence = 'high';
        }
    }

    return {
        date: finalDate,
        llamados,
        primaryLlamado,
        llamadosSummary,
        confidence,
        needsReview: !finalDate
    };
}

module.exports = {
    analyzeConcurso,
    loadPatterns,
    saveLearnedPattern,
    extractMultiLlamados
};
