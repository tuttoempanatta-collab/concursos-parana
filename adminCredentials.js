/**
 * Credencial de Puntaje Oficial de Entre Ríos
 * Docente: COLOMBO, FRANCISCO JUAN GUILLERMO (DNI: 34581536)
 * Títulos: Técnico en Computación, Técnico en Control Bromatológico, Profesor en Concurrencia
 */

const ADMIN_CREDENTIAL_INFO = {
    docente: "COLOMBO, FRANCISCO JUAN GUILLERMO",
    dni: "34581536",
    fechaEmision: "12/02/2026",
    titulos: [
        "TECNICO A EN COMPUTACION",
        "TECNICO EN CONTROL BROMATOLOGICO",
        "PROFESOR A DE EDUCACION SECUNDARIA EN LA MODALIDAD TECNICO PROFESIONAL EN CONCURRENCIA CON TITULO DE BASE TECNICO EN COMPUTACION"
    ]
};

// Normalized regex keywords for all subjects and positions enabled in the 12-page credential
const ADMIN_MATCH_PATTERNS = [
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

/**
 * Checks if a contest matches the administrator's credential
 * @param {Object} contestItem 
 * @returns {Object} { isMatch: boolean, matchedSubject: string | null }
 */
function checkAdminCredentialMatch(contestItem) {
    if (!contestItem) return { isMatch: false, matchedSubject: null };

    // 1. Check in structured plazasList (materia and raw line)
    if (contestItem.plazasList && contestItem.plazasList.length > 0) {
        for (const p of contestItem.plazasList) {
            const text = `${p.materia || ''} ${p.raw || ''}`;
            for (const pat of ADMIN_MATCH_PATTERNS) {
                if (pat.regex.test(text)) {
                    return { isMatch: true, matchedSubject: pat.label };
                }
            }
        }
    }

    // 2. Check in materiasSummary or distinctSubject
    const summaryText = `${contestItem.materiasSummary || ''} ${contestItem.distinctSubject || ''}`;
    if (summaryText.trim()) {
        for (const pat of ADMIN_MATCH_PATTERNS) {
            if (pat.regex.test(summaryText)) {
                return { isMatch: true, matchedSubject: pat.label };
            }
        }
    }

    // 3. Check in title
    const title = contestItem.title || '';
    if (title.trim()) {
        for (const pat of ADMIN_MATCH_PATTERNS) {
            if (pat.regex.test(title)) {
                return { isMatch: true, matchedSubject: pat.label };
            }
        }
    }

    return { isMatch: false, matchedSubject: null };
}

module.exports = {
    ADMIN_CREDENTIAL_INFO,
    ADMIN_MATCH_PATTERNS,
    checkAdminCredentialMatch
};
