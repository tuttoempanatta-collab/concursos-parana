const fs = require('fs');
const cheerio = require('cheerio');
const axios = require('axios');

async function fetchDetails(url) {
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
        const $ = cheerio.load(response.data);
        $('script, style, iframe, ins, .lat-not, footer, header').remove();
        return $('body').text();
    } catch (e) {
        return '';
    }
}

function parseBody(body, title) {
    const data = {
        solicitud: 'N/A',
        establecimiento: 'N/A',
        localidad: 'N/A',
        cue: 'N/A',
        detalleHoras: [],
        fechaConcurso: 'N/A',
        plazas: []
    };

    // Extract Solicitud N°
    const solMatch = body.match(/Solicitud\s*N[°º]?\s*(\d+)/i) || title.match(/Solicitud\s*N[°º]?\s*(\d+)/i) || body.match(/(\d+)[°º]?\s*llamado/i);
    if (solMatch) data.solicitud = solMatch[1];

    // Extract CUE
    const cueMatch = body.match(/CUE\s*[:\- ]?\s*(\d{3,}-\d{1,}|\d{7,})/i) || title.match(/CUE\s*[:\- ]?\s*(\d{3,}-\d{1,}|\d{7,})/i);
    if (cueMatch) data.cue = cueMatch[1];

    // Extract Establecimiento
    const estMatch = body.match(/(?:Esc\.?\s*Sec\.?\s*|E\.?E\.?T\.?\s*|E\.?S\.?J\.?A\.?\s*|E\.?E\.?A\.?T\.?\s*|E\.?S\.?A\.?\s*)N[°º]\s*(\d+)\s*["“]([^"”]+)["”]/i) || 
                     title.match(/(?:Esc\.?\s*Sec\.?\s*|E\.?E\.?T\.?\s*|E\.?S\.?J\.?A\.?\s*|E\.?E\.?A\.?T\.?\s*|E\.?S\.?A\.?\s*)N[°º]\s*(\d+)\s*["“]([^"”]+)["”]/i);
    if (estMatch) {
        data.establecimiento = `${estMatch[0]}`;
    } else {
        const estSimple = body.match(/(?:Escuela|Colegio|E\.E\.T|E\.S\.J\.A|E\.E\.A\.T|E\.S\.A)[^,.\n]+/i);
        if (estSimple) data.establecimiento = estSimple[0].trim();
    }

    // Extract Localidad
    const locMatch = body.match(/Localidad:\s*([^.\n,]+)/i) || body.match(/localidad\s*de\s*([^.\n,]+)/i);
    if (locMatch) data.localidad = locMatch[1].trim();

    // Extract Plazas SAGE
    const plMatch = body.match(/PLAZA SAGE[^\d]*(\d+)/gi);
    if (plMatch) data.plazas = plMatch.map(m => m.match(/\d+/)[0]);

    // Extract Hours/Materia/Course/Division
    // Example: 2hs Artes Visuales, 3° A
    // Looking for patterns like "3hs de Proyecto de Prácticas en 5°2°" or similar
    const lines = body.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    lines.forEach(line => {
        if (line.includes('hs de') || line.includes('Cargo de') || line.includes('plaza:')) {
            data.detalleHoras.push(line);
        }
    });

    // Extract Contest Date/Time
    const dateRegex = /(\d{1,2})\s*(?:de|al)?\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(?:de|del)?\s*(\d{4})/i;
    const timeRegex = /(?:a las\s*)?(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)/i;
    
    const dateMatch = body.match(dateRegex);
    const timeMatch = body.match(timeRegex);
    
    if (dateMatch) {
        data.fechaConcurso = `${dateMatch[0]}${timeMatch ? ' ' + timeMatch[0] : ''}`;
    }

    return data;
}

async function run() {
    console.log('--- Expert Secondary Contest Analysis ---');
    const html = fs.readFileSync('dde_parana.html', 'utf-8');
    const $ = cheerio.load(html);
    
    const targetDates = ['16/03/2026', '13/03/2026', '12/03/2026'];
    const results = [];

    const items = [];
    $('.lista, .lista1, article').each((i, el) => {
        const dateText = $(el).find('p').first().text().trim();
        const linkEl = $(el).find('a').first();
        const title = linkEl.text().trim();
        const href = linkEl.attr('href');

        const isSecondary = 
            title.toLowerCase().includes('secundari') || 
            title.toLowerCase().includes('e.e.t') || 
            title.toLowerCase().includes('eet') || 
            title.toLowerCase().includes('esja') || 
            title.toLowerCase().includes('e.s.j.a');

        if (isSecondary) {
            targetDates.forEach(td => {
                if (dateText.includes(td)) {
                    items.push({ dateText, title, href, rawDate: td });
                }
            });
        }
    });

    console.log(`Found ${items.length} secondary contests for target dates.`);

    for (const item of items) {
        console.log(`Analyzing: ${item.title}...`);
        const bodyText = await fetchDetails(item.href);
        const details = parseBody(bodyText, item.title);
        results.push({
            ...item,
            ...details
        });
    }

    // Sorting
    // Priority 1: Chronological by request date (newest first).
    // Priority 2: Within same date, descending by Request Number.
    results.sort((a, b) => {
        const dateA = new Date(a.rawDate.split('/').reverse().join('-'));
        const dateB = new Date(b.rawDate.split('/').reverse().join('-'));
        if (dateB - dateA !== 0) return dateB - dateA;
        
        const solA = parseInt(a.solicitud) || 0;
        const solB = parseInt(b.solicitud) || 0;
        return solB - solA;
    });

    // JSON Output
    fs.writeFileSync('expert_sec_output.json', JSON.stringify(results, null, 2));
    
    // HTML Generation
    let htmlOutput = `
<div class="container mt-4">
    <h2 class="mb-4 text-primary"><i class="fas fa-bullhorn"></i> Novedades de Concursos: Educación Secundaria</h2>
    <div class="table-responsive">
        <table class="table table-hover table-bordered shadow-sm">
            <thead class="bg-dark text-white">
                <tr>
                    <th>Solicitud</th>
                    <th>Publicación</th>
                    <th>Establecimiento</th>
                    <th>Localidad</th>
                    <th>CUE</th>
                    <th>Detalle de Horas / Cargos</th>
                    <th>Fecha Concurso</th>
                    <th>Cargos SAGE</th>
                </tr>
            </thead>
            <tbody>
    `;

    results.forEach(r => {
        htmlOutput += `
                <tr>
                    <td class="font-weight-bold text-info">${r.solicitud}</td>
                    <td>${r.dateText}</td>
                    <td><strong>${r.establecimiento}</strong></td>
                    <td>${r.localidad}</td>
                    <td><code>${r.cue}</code></td>
                    <td style="font-size: 0.85rem;">
                        <ul class="list-unstyled mb-0">
                            ${r.detalleHoras.slice(0, 5).map(h => `<li>• ${h}</li>`).join('')}
                            ${r.detalleHoras.length > 5 ? '<li><em>... y más horas</em></li>' : ''}
                        </ul>
                    </td>
                    <td class="text-primary font-weight-bold">${r.fechaConcurso}</td>
                    <td>
                        ${r.plazas.map(p => `<span class="badge badge-secondary mr-1">${p}</span>`).join('')}
                    </td>
                </tr>
        `;
    });

    htmlOutput += `
            </tbody>
        </table>
    </div>
</div>
    `;

    fs.writeFileSync('expert_sec_output.html', htmlOutput);
    console.log('Results saved to expert_sec_output.json and expert_sec_output.html');
}

run();
