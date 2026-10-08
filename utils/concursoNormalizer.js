// Normalization and extraction helpers safe for client-side and server-side

export const ADMIN_MATCH_PATTERNS = [
    // 1. Cargos Docentes e Iniciales
    { id: 'preceptor', regex: /\bpreceptor(?:a)?\b|\bpreceptor(?:a)?\s*residencia\b/i, label: 'Preceptor' },
    { id: 'jefe_practica', regex: /\bjefe(?:\s*de)?\s*enseñanza\s*pr[aá]ctica\b|\bjefe(?:\s*de)?\s*ensenanza\s*practica\b/i, label: 'Jefe de Enseñanza Práctica' },
    { id: 'aux_laboratorio', regex: /\bauxiliar\s*docente\s*(?:de\s*)?laboratorio\b|\bauxiliar\s*de\s*laboratorio\b/i, label: 'Auxiliar Docente de Laboratorio' },
    { id: 'aux_trabajos_practicos', regex: /\bauxiliar\s*docente\s*(?:de\s*)?trabajos\s*pr[aá]cticos\b|\batp\b/i, label: 'Auxiliar Docente de Trabajos Prácticos' },
    { id: 'bibliotecario', regex: /\bbibliotecari[oa]\b/i, label: 'Bibliotecario Nivel Secundario' },
    { id: 'mep_ens_pract', regex: /\bmaestro\s*ayud(?:ante)?\.?\s*ens(?:eñanza)?\.?\s*pr[aá]ct(?:ica)?\b|\bmaestro\s*ens(?:eñanza)?\.?\s*pr[aá]ct(?:ica)?\b|\bmep\b/i, label: 'Maestro de Enseñanza Práctica (MEP)' },
    { id: 'instructor_agro', regex: /\binstructor\s*agrot[eé]cnico\b|\binstructor\s*complejo\s*agrario\b/i, label: 'Instructor Agrotécnico' },

    // 2. Computación, Informática y TIC
    { id: 'computacion', regex: /\bcomputaci[oó]n\b|\bcomputadoras?\s*electr[oó]nicas?\b|\blaboratorio\s*(?:de\s*)?computadoras?\b/i, label: 'Computación' },
    { id: 'informatica', regex: /\binform[aá]tica\b|\btaller\s*(?:de\s*)?inform[aá]tica\b/i, label: 'Informática' },
    { id: 'tic', regex: /\bt\.?i\.?c\.?\b|\btecnolog[ií]a\s*(?:de\s*la)?\s*informaci[oó]n\s*(?:y\s*(?:la)?\s*comunicaci[oó]n)?\b/i, label: 'TIC / Tecnologías de la Información' },
    { id: 'programacion', regex: /\bprogramaci[oó]n(?:\s*[iI]{1,3})?\b/i, label: 'Programación' },
    { id: 'sistemas_datos', regex: /\bsistemas\s*(?:de\s*)?procesamiento\s*(?:de\s*)?datos\b|\bprocesamiento\s*(?:de\s*)?datos\b|\btaller\s*procesamiento\s*datos\b/i, label: 'Procesamiento de Datos' },
    { id: 'algoritmos_analisis', regex: /\balgoritmos\b|\ban[aá]lisis\s*(?:de\s*)?sistemas\b|\bl[oó]gica\b|\bsimulaci[oó]n\b/i, label: 'Sistemas / Algoritmos' },
    { id: 'tecnicas_digitales', regex: /\bt[eé]cnicas\s*digitales\b/i, label: 'Técnicas Digitales' },
    { id: 'practicas_prof_comp', regex: /\bpr[aá]cticas\s*profesionalizantes\b|\bproyecto\s*final\b|\bproyecto\s*tecnol[oó]gico\b/i, label: 'Prácticas Profesionalizantes / Proyecto Tecnológico' },

    // 3. Talleres Técnicos (STE) y Dibujo Técnico
    { id: 'dibujo_tecnico', regex: /\bdibujo\s*t[eé]cnico\b|\bcad\b/i, label: 'Dibujo Técnico / CAD' },
    { id: 'ste_talleres', regex: /\bste\b|\bcarpinter[ií]a\b|\bconstrucciones\s*met[aá]licas\b|\belectricidad\b|\bherrer[ií]a\b|\bhojalater[ií]a\b|\bmec[aá]nica\b|\bmoldeo\b|\bfundici[oó]n\b|\btorner[ií]a\b|\bajuste\b/i, label: 'Talleres Técnicos (STE)' },
    { id: 'oficina_tecnica', regex: /\boficina\s*t[eé]cnica\b/i, label: 'Oficina Técnica' },

    // 4. Bromatología, Alimentos y Control
    { id: 'bromatologia', regex: /\bbromatolog[ií]a\b/i, label: 'Bromatología' },
    { id: 'control_calidad', regex: /\bcontrol\s*(?:de\s*)?calidad\b|\bcontrol\s*(?:de\s*)?procesos\b/i, label: 'Control de Calidad / Procesos' },
    { id: 'alimentos', regex: /\belaboraci[oó]n\s*(?:de\s*)?alimentos\b|\bindustria\s*(?:de\s*la\s*)?alimentaci[oó]n\b|\bconservaci[oó]n\s*(?:de\s*)?alimentos\b|\btecnolog[ií]a\s*(?:de\s*los\s*)?alimentos\b|\bnutrici[oó]n\b/i, label: 'Alimentos / Nutrición' },
    { id: 'biologia_aplicada', regex: /\bbiolog[ií]a\s*aplicada\b|\bmicrobiolog[ií]a\b/i, label: 'Biología Aplicada / Microbiología' },

    // 5. Física y Química
    { id: 'fisica', regex: /\bf[ií]sica\s*aplicada\b|\bf[ií]sica\s*y\s*qu[ií]mica\b|\btrabajos\s*pr[aá]cticos\s*(?:de\s*)?f[ií]sica\b/i, label: 'Física / Física Aplicada' },
    { id: 'quimica', regex: /\bqu[ií]mica\s*aplicada\b|\bqu[ií]mica\s*anal[ií]tica\b|\bqu[ií]mica\s*industrial\b|\bqu[ií]mica\s*org[aá]nica\b|\bqu[ií]mica\s*inorg[aá]nica\b|\btrabajos\s*pr[aá]cticos\s*(?:de\s*)?qu[ií]mica\b|\bprocesos\s*y\s*operaciones\s*qu[ií]micas\b/i, label: 'Química Aplicada / Industrial' },

    // 6. Educación Tecnológica
    { id: 'educacion_tecnologica', regex: /\beducaci[oó]n\s*tecnol[oó]gica\b|\btecnolog[ií]a\s*(?:de\s*los\s*)?materiales\b/i, label: 'Educación Tecnológica' }
];

export function checkAdminCredentialMatch(item) {
    if (!item) return { isMatch: false, matchedSubject: null };

    // 1. Check in structured plazasList
    if (item.plazasList && item.plazasList.length > 0) {
        for (const p of item.plazasList) {
            const text = `${p.materia || ''} ${p.raw || ''}`;
            for (const pat of ADMIN_MATCH_PATTERNS) {
                if (pat.regex.test(text)) return { isMatch: true, matchedSubject: pat.label };
            }
        }
    }

    // 2. Check in plazas array of strings
    if (item.plazas && Array.isArray(item.plazas) && item.plazas.length > 0) {
        for (const p of item.plazas) {
            if (typeof p === 'string') {
                for (const pat of ADMIN_MATCH_PATTERNS) {
                    if (pat.regex.test(p)) return { isMatch: true, matchedSubject: pat.label };
                }
            }
        }
    }

    // 3. Check in materiasSummary or distinctSubject
    const summaryText = `${item.materiasSummary || ''} ${item.distinctSubject || ''}`;
    if (summaryText.trim()) {
        for (const pat of ADMIN_MATCH_PATTERNS) {
            if (pat.regex.test(summaryText)) return { isMatch: true, matchedSubject: pat.label };
        }
    }

    // 4. Check in title
    const title = item.title || item.originalText || '';
    if (title.trim()) {
        for (const pat of ADMIN_MATCH_PATTERNS) {
            if (pat.regex.test(title)) return { isMatch: true, matchedSubject: pat.label };
        }
    }

    return { isMatch: false, matchedSubject: null };
}

export function formatCanonicalSchoolName(name) {
    if (!name || name === 'Escuela Departamental') return name;
    let s = name.trim().replace(/[“”″«»]/g, '"');
    s = s.replace(/\s+A\.?F\.?P\.?$/i, '');
    s = s.replace(/(?:E\.?E\.?T\.?|EET)\s*(?:N[°ºo\.]*\s*)?(\d+)/i, 'E.E.T. Nº $1');
    s = s.replace(/(?:E\.?E\.?A\.?T\.?|EEAT)\s*(?:N[°ºo\.]*\s*)?(\d+)/i, 'E.E.A.T. Nº $1');
    s = s.replace(/\b(?:Escuela\s+Secundaria(?:\s*[-–—]?\s*Orientada)?|Esc\.\s*Sec\.?)\s*(?:N[°ºo\.]*\s*)?(\d+)/i, 'Escuela Secundaria Nº $1');
    s = s.replace(/\b(?:ESJA|E\.?S\.?J\.?A\.?)\s*(?:N[°ºo\.]*\s*)?(\d+)/i, 'ESJA Nº $1');
    s = s.replace(/\b(?:Escuela\s+Primaria(?:\s+de\s+J[oó]venes\s+y\s+Adultos)?|Esc\.\s*Prim\.?)\s*(?:N[°ºo\.]*\s*)?(\d+)/i, 'Escuela Primaria Nº $1');
    s = s.replace(/\bEscuela\s+NINA\s*(?:N[°ºo\.]*\s*)?(\d+)/i, 'Escuela NINA Nº $1');
    s = s.replace(/(\d+)\"/g, '$1 "');
    s = s.replace(/\s+/g, ' ');

    s = s.replace(/"([^"]+)"/g, (match, p1) => {
        if (p1 === p1.toUpperCase() && p1.length > 3) {
            const tc = p1.toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());
            return '"' + tc + '"';
        }
        return match;
    });

    return s.trim();
}

export function extractSchoolName(title, content = '') {
    const cleanStr = (s) => {
        if (!s) return '';
        let str = s.trim().replace(/[“”″«»]/g, '"');
        str = str.replace(/^(?:dptal\.?\s*pn[aá]\.?|dde\s*paran[aá]|dpatal\s*,\s*pn[aá]\.?)\s*[-–—:\.]*\s*/i, '');
        str = str.replace(/^(?:1[°º]|2[°º]|3[°º]|1er|2do|3er|1\.er|2\.do|primer[oa]?|segund[oa]?|tercer[oa]?)\s*(?:desconvocatoria(?:\s*parcial)?|convocatoria|llamado)(?:\s*(?:a\s*)?concurso)?\s*[-–—:\.]*\s*/i, '');
        str = str.replace(/^(?:desconvocatoria(?:\s*parcial)?|desconvoca|convocatoria|llamado)(?:\s*(?:a\s*)?concurso)?\s*[-–—:\.]*\s*/i, '');
        str = str.replace(/^(?:por\s+presentaci[oó]n\s*de\s*proyectos?|por\s*proyectos?|talleres\s*escuela\s*nina|supervisi[oó]n[^\-–—]*|horas\s*c[aá]tedras?|horas\s*nina|cargo[^\-–—]*)\s*[-–—:\.]*\s*/i, '');
        str = str.replace(/\s*[-–—:]*\s*\b(?:cue|localidad|tel[eé]f)\b.*$/i, '');
        str = str.replace(/^[-–—\s:\.]+|[-–—\s:\.]+$/g, '');
        return str.trim();
    };

    const quotedRegex = /(?:E\.?E\.?T\.?|E\.?E\.?A\.?T\.?|E\.?T\.?|Escuela\s+Secundaria(?:\s*[-–—]?\s*Orientada)?|Escuela\s+Normal(?:\s+Superior)?|Escuela\s+Primaria(?:\s+de\s+J[oó]venes\s+y\s+Adultos|\s+NINA)?|Escuela\s+NINA|Escuela\s+Integral|Escuela\s+Especial|Escuela|Esc\.\s*Sec\.?|Esc\.\s*Prim\.?|Esc\.\s*N[°ºo\.]*|ESJA|E\.?S\.?J\.?A\.?|EPJA|E\.?P\.?J\.?A\.?|Colegio\s+Nacional|Colegio|Liceo|Instituto\s+de\s+Educaci[oó]n\s+Superior|Instituto\s+Superior|ISFD|IES|Centro\s+de\s+(?:Arte|Educaci[oó]n\s*F[ií]sica)|CEF)[^–—\(\)]*?"[^"]+?"(?:\s*A\.?F\.?P\.?)?/i;

    const unquotedRegex = /(?:E\.?E\.?T\.?|E\.?E\.?A\.?T\.?|E\.?T\.?|Escuela\s+Secundaria(?:\s*[-–—]?\s*Orientada)?|Escuela\s+Normal(?:\s+Superior)?|Escuela\s+Primaria(?:\s+de\s+J[oó]venes\s+y\s+Adultos|\s+NINA)?|Escuela\s+NINA|Escuela\s+Integral|Escuela\s+Especial|Esc\.\s*Sec\.?|Esc\.\s*Prim\.?|ESJA|E\.?S\.?J\.?A\.?|EPJA|Colegio\s+Nacional|Colegio|Liceo|Instituto\s+de\s+Educaci[oó]n\s+Superior|Instituto\s+Superior|Centro\s+de\s+(?:Arte|Educaci[oó]n\s*F[ií]sica))\s*(?:N[°ºo\.]*\s*\d+)?\s+([A-Za-zÁÉÍÓÚÑa-z\s]{3,35})(?=\s*[-–—\(\)\.,]|\s*\bCUE\b|\s*\bLocalidad\b|$)/i;

    const isValidSchool = (name) => {
        if (!name || name === 'Escuela Departamental' || name.length < 4) return false;
        if (/^(?:ciclo\s+lectivo|convoca|desconvoca|dpta|dde|primer|segundo|llamado|por\s+proyecto|horas\s+c)/i.test(name)) return false;
        return /(?:escuela|e\.?e\.?t|e\.?e\.?a\.?t|e\.?t\b|esja|epja|colegio|liceo|instituto|centro\s+de\s+(?:arte|educaci[oó]n)|cef|isdf|ies)/i.test(name);
    };

    if (title) {
        const cleanTitle = cleanStr(title);
        const qm = cleanTitle.match(quotedRegex);
        if (qm) {
            const sch = formatCanonicalSchoolName(cleanStr(qm[0]));
            if (isValidSchool(sch)) return sch;
        }
        const uqm = cleanTitle.match(unquotedRegex);
        if (uqm) {
            const sch = formatCanonicalSchoolName(cleanStr(uqm[0]));
            if (isValidSchool(sch)) return sch;
        }
    }

    if (content) {
        const topContent = cleanStr(content.slice(0, 600));
        const qm = topContent.match(quotedRegex);
        if (qm) {
            const sch = formatCanonicalSchoolName(cleanStr(qm[0]));
            if (isValidSchool(sch)) return sch;
        }
        const uqm = topContent.match(unquotedRegex);
        if (uqm) {
            const sch = formatCanonicalSchoolName(cleanStr(uqm[0]));
            if (isValidSchool(sch)) return sch;
        }
    }

    if (title && /(?:escuela|eet|eeat|esja|colegio|liceo|instituto|ceef)/i.test(title)) {
        let fallback = cleanStr(title).split(/–|-|\(/)[0].trim();
        if (fallback.length > 5) {
            const sch = formatCanonicalSchoolName(fallback);
            if (isValidSchool(sch)) return sch;
        }
    }

    return 'Escuela Departamental';
}

export function classifyLevel(title, content = '', schoolName = '') {
    const text = `${schoolName || ''} ${title || ''} ${(content || '').slice(0, 300)}`.toLowerCase();

    // 1. Technical Secondary Schools (EET, EEAT, Técnica, Agrotécnica)
    if (
        /\be\.?e\.?t\.?\b/i.test(text) ||
        /\be\.?e\.?a\.?t\.?\b/i.test(text) ||
        /t[eé]cnica/i.test(text) ||
        /agrot[eé]cnica/i.test(text) ||
        /\be\.?t\.?\s*n[°º]?/i.test(text) ||
        (schoolName && /e\.?e\.?t\.?/i.test(schoolName))
    ) {
        return 'Secundaria Técnica';
    }

    // 2. Regular Secondary Schools
    if (
        text.includes('secundari') || text.includes('sec.') || text.includes('sec ') || 
        text.includes('esja') || text.includes('e.s.j.a') || text.includes('orientada') || 
        text.includes('liceo') || text.includes('colegio')
    ) {
        return 'Secundario';
    }

    // 3. Primary Schools
    if (
        text.includes('primari') || text.includes('nep') || text.includes('nina') || 
        text.includes('integral') || text.includes('especial') || 
        /esc(?:uela|\.?)\s*(?:n[ro|º|°\.? ]*)?\d+/i.test(text)
    ) {
        return 'Primario';
    }

    if (text.includes('inicial') || text.includes('jardin') || text.includes('jardín')) return 'Inicial';
    if (text.includes('superior') || text.includes('isdf') || text.includes('instituto') || text.includes('profesorado')) return 'Superior';

    return 'No especificado';
}

export function normalizeConcursoItem(item) {
    if (!item) return item;
    const title = item.title || item.originalText || '';
    const content = item.fullContent || '';

    // 1. Resolve school name
    let schoolName = item.schoolName;
    if (!schoolName || schoolName === 'Escuela Departamental' || schoolName === 'ES' || schoolName === 'Es') {
        schoolName = extractSchoolName(title, content);
    } else {
        schoolName = formatCanonicalSchoolName(schoolName);
    }

    // 2. Resolve educational level with Secundaria Técnica priority
    let nivel = item.nivel;
    const textToCheck = `${schoolName || ''} ${title} ${content.slice(0, 300)}`.toLowerCase();
    const isTecnica = (
        /\be\.?e\.?t\.?\b/i.test(textToCheck) ||
        /\be\.?e\.?a\.?t\.?\b/i.test(textToCheck) ||
        /t[eé]cnica/i.test(textToCheck) ||
        /agrot[eé]cnica/i.test(textToCheck) ||
        /\be\.?t\.?\s*n[°º]?/i.test(textToCheck)
    );

    if (isTecnica) {
        nivel = 'Secundaria Técnica';
    } else if (!nivel || nivel === 'No especificado' || nivel === 'Otro') {
        nivel = classifyLevel(title, content, schoolName);
    }

    // 3. Resolve admin match if missing
    let isAdminMatch = item.isAdminMatch;
    let adminMatchedSubject = item.adminMatchedSubject;
    if (isAdminMatch === undefined) {
        const adminRes = checkAdminCredentialMatch(item);
        isAdminMatch = adminRes.isMatch;
        adminMatchedSubject = adminRes.matchedSubject;
    }

    return {
        ...item,
        nivel,
        schoolName,
        isAdminMatch,
        adminMatchedSubject
    };
}
