'use client';

import { useState, useEffect } from 'react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import ConcursoCard from './components/ConcursoCard';
import PresenceManager from './components/PresenceManager';
import { RefreshCw, Search, Heart, X, Users, Activity, ExternalLink, Bell, Star } from 'lucide-react';

import { db } from '../firebase.config';
import { collection, getDocs, query, orderBy, doc, getDoc, setDoc, updateDoc, increment, onSnapshot } from 'firebase/firestore';
import { 
  normalizeConcursoItem, 
  extractSchoolName, 
  formatCanonicalSchoolName, 
  classifyLevel, 
  checkAdminCredentialMatch,
  checkIsSegundoLlamado,
  checkAdminOpportunity,
  isWithinRetentionWindow
} from '../utils/concursoNormalizer';

export default function Home() {
  const [concursos, setConcursos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Visibility, Pin & Seen State
  const [hideInactive, setHideInactive] = useState(false);
  const [hiddenCardIds, setHiddenCardIds] = useState([]);
  const [pinnedCardIds, setPinnedCardIds] = useState([]);
  const [seenCardIds, setSeenCardIds] = useState([]);
  const [hideSeen, setHideSeen] = useState(false);
  
  // Filter state
  const [activeFilters, setActiveFilters] = useState({
    Inicial: true,
    Primario: true,
    Secundario: true,
    'Secundaria Técnica': true,
    Superior: true,
    Otro: true
  });
  const [selectedSchool, setSelectedSchool] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [onlyAdminMatches, setOnlyAdminMatches] = useState(false);
  const [onlyAdminOpportunities, setOnlyAdminOpportunities] = useState(false);
  const [showAdminDrawer, setShowAdminDrawer] = useState(false);

  // User Location State
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);

  // Social/Analytics State
  const [visitorCount, setVisitorCount] = useState(0);
  const [showDonate, setShowDonate] = useState(false);
  const [robotStatus, setRobotStatus] = useState(null);
  const [storefrontSettings, setStorefrontSettings] = useState({
    donate_alias: 'fcolombo61.ppay',
    donate_cbu: '0000076500000038535516',
    donate_text: '¡Hola, colega! 👋 👩‍🏫👨‍🏫 \n\nEste espacio fue creado con mucha dedicación para que todos tengamos las mismas oportunidades de encontrar nuestro lugar en el aula. 🏫✨\n\nSi esta web te ayudó a conseguir ese cargo o suplencia que buscabas, o simplemente te facilita el día a día, te invito a colaborar con lo que puedas para mantener los servidores y seguir mejorando el servicio. \n\n¡Mucha suerte en tu próximo concurso! 💪📖'
  });
  const [liveCount, setLiveCount] = useState(1);

  // Persistence: Load hidden and pinned IDs on mount
  useEffect(() => {
    const saved = localStorage.getItem('hiddenConcursos');
    if (saved) {
      try {
        setHiddenCardIds(JSON.parse(saved));
      } catch (e) { console.error("Error loading hidden contests", e); }
    }

    const savedPinned = localStorage.getItem('pinnedConcursos');
    if (savedPinned) {
      try {
        setPinnedCardIds(JSON.parse(savedPinned));
      } catch (e) { console.error("Error loading pinned contests", e); }
    }

    const savedSeen = localStorage.getItem('seenConcursos');
    if (savedSeen) {
      try {
        setSeenCardIds(JSON.parse(savedSeen));
      } catch (e) { console.error("Error loading seen contests", e); }
    }
    
    // Fetch dynamic settings from Firestore
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'storefront_settings'));
        if (snap.exists()) {
          setStorefrontSettings(prev => ({ ...prev, ...snap.data() }));
        }
      } catch (e) { console.error("Error loading storefront settings", e); }
    };
    fetchSettings();
  }, []);

  // Persistence: Save hidden IDs on change
  useEffect(() => {
    localStorage.setItem('hiddenConcursos', JSON.stringify(hiddenCardIds));
  }, [hiddenCardIds]);

  // Persistence: Save pinned IDs on change
  useEffect(() => {
    localStorage.setItem('pinnedConcursos', JSON.stringify(pinnedCardIds));
  }, [pinnedCardIds]);

  // Persistence: Save seen IDs on change
  useEffect(() => {
    localStorage.setItem('seenConcursos', JSON.stringify(seenCardIds));
  }, [seenCardIds]);

  const handleTogglePin = (id) => {
    setPinnedCardIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleToggleSeen = (id) => {
    setSeenCardIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Visitor Counter Logic
  useEffect(() => {
    const handleVisitor = async () => {
      try {
        const statsRef = doc(db, 'metadata', 'stats');
        
        // Check if we counted this visit in this session
        const sessionCounted = sessionStorage.getItem('visitCounted');
        
        if (!sessionCounted) {
          // Increment in Firestore
          await setDoc(statsRef, { visitors: increment(1) }, { merge: true });
          sessionStorage.setItem('visitCounted', 'true');
        }

        // Fetch current count
        const snap = await getDoc(statsRef);
        if (snap.exists()) {
          setVisitorCount(snap.data().visitors || 0);
        }
      } catch (e) {
        console.error("Error handling visitor stats:", e);
      }
    };

    handleVisitor();
  }, []);

  // Robot Status Listener
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'system', 'robot_status'), 
      (snap) => {
        if (snap.exists()) setRobotStatus(snap.data());
      },
      (err) => {
        console.warn("Robot status listener notice:", err.message);
      }
    );
    return () => unsub();
  }, []);

  const fetchConcursos = async () => {
    let finalData = [];
    try {
      setLoading(true);
      setError(null);
      
      let data = [];
      try {
        console.log("Attempting Firestore fetch...");
        const q = query(collection(db, 'concursos'), orderBy('pubDate', 'desc'));
        
        // Timeout extendido a 10s para redes móviles 4G/LTE
        const fetchPromise = getDocs(q);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 10000));
        
        const querySnapshot = await Promise.race([fetchPromise, timeoutPromise]);
        if (!querySnapshot.empty) {
            data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`[DEBUG] Firestore returned ${data.length} docs.`);
        }
      } catch (dbError) {
        console.warn("Firestore fetch error/timeout, fallback incoming:", dbError.message);
      }

      // FALLBACK 1: INTENTAR LEER DESDE LA RÉPLICA WEB EN VIVO (CDN)
      if (data.length === 0 && Capacitor.isNativePlatform()) {
        try {
          console.log("Attempting Remote Web CDN fetch...");
          const cdnRes = await Promise.race([
            fetch('https://concursos-entre-rios.web.app/parsed_data.json', { cache: 'no-cache' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("CDN timeout")), 4000))
          ]);
          if (cdnRes.ok) {
            data = await cdnRes.json();
            console.log(`[DEBUG] Loaded ${data.length} items from live Web CDN.`);
          }
        } catch (cdnErr) {
          console.warn("Live Web CDN fetch failed, trying local bundled fallback:", cdnErr.message);
        }
      }

      // FALLBACK 2: RECURRIR A JSON ESTÁTICO LOCAL
      if (data.length === 0) {
        try {
          console.log("Fetching static JSON fallback...");
          const res = await fetch('/parsed_data.json');
          data = await res.json();
          console.log(`[DEBUG] Loaded ${data.length} items from JSON fallback.`);
        } catch (jsonError) {
          console.error("Static JSON fallback failed:", jsonError);
        }
      }

      if (data.length > 0) {
          const validRecent = data.filter(c => isWithinRetentionWindow(c, 14));
          const normalized = validRecent.map(normalizeConcursoItem);
          setConcursos(normalized);
          setLoading(false);
          return; // Tanto la web como el APK utilizan la misma base sincronizada con Firestore
      }

      if (Capacitor.isNativePlatform()) {
        const urls = [
          'https://cge.entrerios.gov.ar/concursos-docentes/',
          'https://cge.entrerios.gov.ar/departamental-parana/'
        ];
        
        const scrapedConcursos = [];
        
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
        const numRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;

        const extractEventDate = (text, urlHint = null) => {
            // Avoid matching dates inside email addresses
            const cleanText = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
            
            const match = cleanText.match(dateRegex);
            const numMatch = cleanText.match(numRegex);
            const tmRegex = /(?:a las\s*)?(\d{1,2})[:,\.](\d{2})\s*(?:hs|horas|h)?|(\d{1,2})\s*(?:hs|horas|h)/i;
            const tmMatch = cleanText.match(tmRegex);
            let h = 0, m = 0, tSet = false;

            // Extract year hint from URL (e.g. /2025/)
            let urlYear = null;
            if (urlHint) {
                const yMatch = urlHint.match(/\/20(\d{2})\//);
                if (yMatch) urlYear = parseInt('20' + yMatch[1], 10);
            }
            const curYear = urlYear || new Date().getFullYear();

            if (tmMatch) {
               h = tmMatch[1] ? parseInt(tmMatch[1], 10) : parseInt(tmMatch[3], 10);
               m = tmMatch[2] ? parseInt(tmMatch[2], 10) : 0;
               tSet = true;
            }

            if (match) {
                let d = parseInt(match[1], 10);
                let mo = months.indexOf(match[2].toLowerCase());
                let y = match[3] ? parseInt(match[3], 10) : curYear;
                if (y < 100) y += 2000;
                if (!tSet) { h = 23; m = 59; }
                return new Date(y, mo, d, h, m, 0);
            }

            if (numMatch) {
                let d = parseInt(numMatch[1], 10);
                let mo = parseInt(numMatch[2], 10) - 1;
                let y = parseInt(numMatch[3], 10);
                if (y < 100) y += 2000;
                if (!tSet) { h = 23; m = 59; }
                return new Date(y, mo, d, h, m, 0);
            }
            return null;
        };

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);

        for (const url of urls) {
          const response = await CapacitorHttp.get({ url });
          if (typeof window === 'undefined') continue;
          const parser = new DOMParser();
          const doc = parser.parseFromString(response.data, 'text/html');
          const links = doc.querySelectorAll('a');
          
          links.forEach((el, i) => {
             const text = el.textContent.trim();
             const href = el.getAttribute('href');
             if (!href || href.startsWith('javascript:')) return;
             
             const lowerText = text.toLowerCase();
             const fullHref = href.startsWith('http') ? href : `https://cge.entrerios.gov.ar${href.startsWith('/') ? '' : '/'}${href}`;
             
             if (lowerText.includes('concurso') || lowerText.includes('llama a')) {
                  // Year Filter
                  if (!fullHref.includes('/2026/') && !fullHref.includes('/2025/')) return;

                  let nivel = 'Otro';
                  if (lowerText.includes('inicial') || lowerText.includes('jardin') || lowerText.includes('jardín')) nivel = 'Inicial';
                  else if (lowerText.includes('primari') || lowerText.includes('nep') || lowerText.includes('nina') || lowerText.includes('integral') || lowerText.includes('especial') || lowerText.includes('escuela n°') || lowerText.includes('esc. nro') || lowerText.includes('esc. nº') || lowerText.includes('idioma extranjero') || /esc(?:uela|\.?)\s*(?:n[ro|º|°\.? ]*)?\\d+/i.test(lowerText)) nivel = 'Primario';
                  else if (
                      lowerText.includes('secundari') || lowerText.includes('sec.') || lowerText.includes('sec ') || 
                      lowerText.includes('jovenes') || lowerText.includes('jóvenes') || 
                      lowerText.includes('esja') || lowerText.includes('e.s.j.a') ||
                      lowerText.includes('eeat') || lowerText.includes('e.e.a.t') ||
                      lowerText.includes('eet') || lowerText.includes('e.e.t') ||
                      lowerText.includes('técnica') || lowerText.includes('tecnica') || 
                      lowerText.includes('esa ') || lowerText.includes('e.s.a') ||
                      lowerText.includes('orientada')
                  ) nivel = 'Secundario';
                  else if (lowerText.includes('superior')) nivel = 'Superior';
                  
                  const isParana = url.includes('departamental-parana') || lowerText.includes('paran') || lowerText.includes('pná') || lowerText.includes('pna');
                  if (!isParana) return;
                  if (!url.includes('departamental-parana') && !fullHref.includes('/2026/') && !fullHref.includes('/2025/')) return;
                       const eventDate = extractEventDate(text, fullHref);
                       if (eventDate && eventDate < cutoffDate) return; 

                     let priority = 3;
                      if (eventDate && eventDate >= new Date().setHours(0,0,0,0) && eventDate <= new Date().setHours(47,59,59,999)) priority = 1;
                      else if (nivel === 'Secundario' && !eventDate) priority = 1;
                      else if (eventDate && eventDate > new Date(Date.now() + 172800000)) priority = 2;
                     
                      if(!scrapedConcursos.find(c => c.link === fullHref)) {
                          // Stable hash ID based on link
                          const safeId = hashString(fullHref);
                          scrapedConcursos.push({
                              id: `native-${safeId}`,
                              title: text,
                              link: fullHref,
                              nivel: nivel,
                              date: eventDate ? eventDate.toISOString() : null,
                              department: 'Paraná (Dpto)',
                              priority
                          });
                      }
             }
          });
        }

        // Sort by priority for deep scraping
        scrapedConcursos.sort((a,b) => a.priority - b.priority);

        // Deep scrape top 60 (increased for better coverage)
        for (let i = 0; i < Math.min(scrapedConcursos.length, 60); i++) {
            const it = scrapedConcursos[i];
            try {
              const res = await CapacitorHttp.get({ url: it.link });
              if (typeof window === 'undefined') continue;
              const dDoc = new DOMParser().parseFromString(res.data, 'text/html');
              
              // REMOVE SCRIPTS AND STYLES before extracting text
              const scripts = dDoc.querySelectorAll('script, style, iframe, ins, footer, header, .lat-not');
              scripts.forEach(s => s.remove());

              // Capture all innerText/textContent from the body
              const rawText = dDoc.body.textContent || '';
              // Secondary regex cleaning
              const dText = rawText
                .replace(/moment\.updateLocale[\s\S]*?\}\s*\);/g, '')
                .replace(/window\.twttr[\s\S]*?\}\s*\(document, "script", "twitter-wjs"\)\);/g, '')
                .replace(/\{"prefetch"[\s\S]*? conservative"\}\}/g, '')
                .replace(/\/\* <!\[CDATA\[ \*\/[\s\S]*?\/\* \]\]> \*/g, '')
                .trim();

              it.fullContent = dText; 

              const tmRegex = /(?:a las\s*)?(\d{1,2})[:,\.](\d{2})\s*(?:hs|horas|h)?|(\d{1,2})\s*(?:hs|horas|h)/i;
              const tmMatch = dText.match(tmRegex);
              if (tmMatch && it.date) {
                  const d = new Date(it.date);
                  let h = tmMatch[1] ? parseInt(tmMatch[1], 10) : parseInt(tmMatch[3], 10);
                  let m = tmMatch[2] ? parseInt(tmMatch[2], 10) : 0;
                  d.setHours(h, m, 0);
                  it.date = d.toISOString();
              }

              it.plazas = [];
              
              // Find date in body if missing or priority
              if (dText && (!it.date || it.date.includes('23:59'))) {
                  const bDateStr = dText.match(/(\d{1,2})\s*(?:de|al)?\s*(marzo|abril)\s*(?:de|del)?\s*2026/i);
                  if (bDateStr) {
                      const day = parseInt(bDateStr[1], 10);
                      const monthStr = bDateStr[2].toLowerCase();
                      const monthIndex = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'].indexOf(monthStr);
                      const d = new Date(2026, monthIndex, day, 10, 0, 0); // Default 10am
                      it.date = d.toISOString();
                  }
              }

              // Body-based classification for mobile
              if (dText && (it.nivel === 'Otro' || it.nivel === 'No especificado')) {
                   const bt = dText.toLowerCase();
                   if (bt.includes('secundari') || bt.includes('e.e.t') || bt.includes('e.e.a.t') || bt.includes('e.s.j.a')) it.nivel = 'Secundario';
              }
              const plMatch = dText.match(/PLAZA SAGE[^\d]*(\d+)/gi);
              if (plMatch) plMatch.forEach(m => { const id = m.match(/\d+/); if (id) it.plazas.push(`Plaza ${id[0]}`); });
              
              it.materias = [];
              const mtMatch = dText.match(/\d+\s*hs\s*de\s*([A-ZÁÉÍÓÚÑ\s]{3,40})/g);
              if (mtMatch) mtMatch.forEach(m => { const n = m.split(' de ')[1]?.trim(); if (n && !it.materias.includes(n)) it.materias.push(n); });
            } catch(e) {}
        }
        finalData = scrapedConcursos;
      } else {
        // --- WEB BROWSER SCRAPING (API Route) ---
        if (typeof window === 'undefined') return;
        const res = await fetch('/api/concursos');
        const data = await res.json();
        if (data.success) {
          finalData = data.data;
        } else {
          throw new Error(data.error);
        }
      }
      
      const validRecentFinal = finalData.filter(c => isWithinRetentionWindow(c, 14));
      const normalizedFinal = validRecentFinal.map(normalizeConcursoItem);
      // Sort by original CGE publication order (0 is newest)
      const sorted = normalizedFinal.sort((a, b) => {
          const orderA = typeof a.cgeOrder === 'number' ? a.cgeOrder : 9999;
          const orderB = typeof b.cgeOrder === 'number' ? b.cgeOrder : 9999;
          if (orderA !== orderB) return orderA - orderB;
          
          // Fallback to event date
          return new Date(a.date) - new Date(b.date);
      });
      setConcursos(sorted);
      
    } catch (err) {
      setError(err.message || 'Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  const fetchLocation = async () => {
    try {
      // Pedimos permiso explícitamente primero en dispositivos móviles nativos mediante capacitor, en web el explorador lo hace solo
      if (Capacitor.isNativePlatform()) {
        const permissions = await Geolocation.checkPermissions();
        if (permissions.location !== 'granted') {
          const permResult = await Geolocation.requestPermissions();
          console.log('Permisos GPS:', permResult);
          if (permResult.location !== 'granted') {
             throw new Error("Permiso de ubicación denegado.");
          }
        }
      }
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      setUserLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
      setLocationError(null);
    } catch (err) {
      console.error("Error getting location:", err);
      setLocationError(err.message || "No se pudo obtener la ubicación.");
    }
  };

  useEffect(() => {
    fetchConcursos();
  }, []);

  const toggleFilter = (level) => {
    setActiveFilters(prev => ({
      ...prev,
      [level]: !prev[level]
    }));
  };

  const handleHideCard = (id) => {
    setHiddenCardIds(prev => [...prev, id]);
  };

  const restoreHiddenCards = () => {
    setHiddenCardIds([]);
  };

  const handleMarkAllVisibleSeen = () => {
    const idsToMark = filteredConcursos.map(c => c.id);
    setSeenCardIds(prev => Array.from(new Set([...prev, ...idsToMark])));
  };

  const handleClearAllSeen = () => {
    setSeenCardIds([]);
  };

  const now = new Date();
  const cutoffDate = new Date();
  cutoffDate.setDate(now.getDate() - 14); // Estricto a 14 días (2 semanas)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfToday = new Date(startOfToday.getTime() + 86400000);
  const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
  const startOfDayAfter = new Date(startOfToday.getTime() + 172800000);
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(now);

  const resolveLevel = (c) => {
    if (!c) return 'No especificado';
    if (c.nivel === 'Secundaria Técnica') return 'Secundaria Técnica';
    const sch = c.schoolName || '';
    const t = `${sch} ${c.title || ''} ${(c.fullContent || '').slice(0, 300)}`.toLowerCase();
    if (/(?:\be\.?e\.?t\.?\b|\be\.?e\.?a\.?t\.?\b|t[eé]cnica|agrot[eé]cnica|\be\.?t\.?\s*n[°º]?)/i.test(t)) {
      return 'Secundaria Técnica';
    }
    return c.nivel || 'No especificado';
  };

  const resolveSchoolName = (c) => {
    if (c.schoolName && c.schoolName !== 'Escuela Departamental' && c.schoolName !== 'ES' && c.schoolName !== 'Es') {
      return formatCanonicalSchoolName(c.schoolName);
    }
    return extractSchoolName(c.title, c.fullContent);
  };

  const validConcursos = concursos.filter(c => isWithinRetentionWindow(c, 14));

  const totalSeenCount = validConcursos.filter(c => seenCardIds.includes(c.id)).length;
  const totalUnseenCount = Math.max(0, validConcursos.length - totalSeenCount);

  const uniqueSchools = Array.from(new Set(
    validConcursos
      .map(c => resolveSchoolName(c))
      .filter(Boolean)
      .filter(s => s !== 'Escuela Departamental' && s.length > 3)
  )).sort((a, b) => a.localeCompare(b));

  const uniqueCities = Array.from(new Set(
    validConcursos
      .map(c => (c.department || '').replace('(Dpto)', '').trim())
      .filter(Boolean)
  )).sort();

  const resolveAdminOpportunity = (c) => {
    if (!isWithinRetentionWindow(c, 14)) return false;
    if (c.isAdminOpportunity !== undefined) return c.isAdminOpportunity;
    const isAdm = c.isAdminMatch !== undefined ? c.isAdminMatch : checkAdminCredentialMatch(c).isMatch;
    const isSeg = c.isSegundoLlamado !== undefined ? c.isSegundoLlamado : checkIsSegundoLlamado(c);
    return Boolean(isAdm && isSeg);
  };

  const adminMatchesList = validConcursos.filter(c => {
    if (c.isAdminMatch !== undefined) return c.isAdminMatch;
    return checkAdminCredentialMatch(c).isMatch;
  });

  const adminOpportunityList = validConcursos.filter(c => resolveAdminOpportunity(c));

  const filteredConcursos = validConcursos.filter(c => {
    // 1. Level filter
    const cLevel = resolveLevel(c);
    const levelMatch = activeFilters[cLevel] || (cLevel === 'No especificado' && activeFilters['Otro']);
    
    // 2. School filter
    const cSchool = resolveSchoolName(c);
    const schoolMatch = !selectedSchool || cSchool === selectedSchool;

    // 3. City filter
    const cCity = (c.department || '').replace('(Dpto)', '').trim();
    const cityMatch = !selectedCity || cCity.toLowerCase() === selectedCity.toLowerCase();

    // 4. Admin match & Opportunity filter
    const cIsAdmin = c.isAdminMatch !== undefined ? c.isAdminMatch : checkAdminCredentialMatch(c).isMatch;
    const cIsOpp = resolveAdminOpportunity(c);
    if (onlyAdminOpportunities && !cIsOpp) return false;
    if (onlyAdminMatches && !cIsAdmin) return false;

    // 5. Search query
    const searchMatch = searchQuery === '' || 
      (c.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      cSchool.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.department || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.primaryLlamado || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.materiasSummary || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.distinctSubject || '').toLowerCase().includes(searchQuery.toLowerCase());
      
    const docDate = c.date ? new Date(c.date) : null;
    
    // Regla de retención estricta: Eliminar de la vista cualquier concurso > 14 días
    if (!isWithinRetentionWindow(c, 14)) return false;

    const isPast = docDate && docDate < now;
    const hideMatch = !(hideInactive && isPast) && !hiddenCardIds.includes(c.id);
    if (hideSeen && seenCardIds.includes(c.id)) return false;
      
    return levelMatch && schoolMatch && cityMatch && searchMatch && hideMatch;
  });

  const isNovedad = (c) => {
    if (c.pubDate !== todayStr) return false;
    if (!c.date) return true;
    const d = new Date(c.date);
    return d >= startOfToday;
  };

  // 0. Concursos Fijados (Siempre visibles primero en la pantalla)
  const concursosFijados = filteredConcursos.filter(c => pinnedCardIds.includes(c.id));

  // 1. Novedades del día (publicadas hoy y vigentes, excluyendo fijados)
  const concursosNuevos = filteredConcursos.filter(c => !pinnedCardIds.includes(c.id) && isNovedad(c));

  // 2. Concursos de hoy activos (horario posterior o en curso, excluyendo fijados)
  const concursosHoy = filteredConcursos.filter(c => {
    if (pinnedCardIds.includes(c.id) || !c.date || isNovedad(c)) return false;
    const d = new Date(c.date);
    return d >= now && d < endOfToday;
  });

  // 3. Concursos de mañana (excluyendo fijados)
  const concursosManana = filteredConcursos.filter(c => {
    if (pinnedCardIds.includes(c.id) || !c.date || isNovedad(c)) return false;
    const d = new Date(c.date);
    return d >= startOfTomorrow && d < startOfDayAfter;
  });

  // 4. Próximos Concursos (más allá de mañana o sin fecha fija, excluyendo fijados)
  const concursosFuturos = filteredConcursos.filter(c => {
    if (pinnedCardIds.includes(c.id) || isNovedad(c)) return false;
    if (!c.date) return true;
    const d = new Date(c.date);
    return d >= startOfDayAfter;
  });

  // 5. Concursos que ya pasaron su hora pero tienen < 2 semanas (excluyendo fijados)
  const concursosPasadosRecientes = filteredConcursos.filter(c => {
    if (pinnedCardIds.includes(c.id) || isNovedad(c)) return false;
    if (!c.date) return false;
    const d = new Date(c.date);
    return d < now && d >= cutoffDate;
  });

  return (
    <div className="container">
      <PresenceManager onCountChange={setLiveCount} />
      <header className="header app-header">
        <div className="header-title-container">
           <h1>Concursos Docentes</h1>
           <p>Gestión ágil y dinámica para el Departamento Paraná</p>
        </div>
        <div className="header-actions-col">
          <div className="header-top-row">
            <a href="/admin" style={{fontSize: '0.7rem', color: 'rgba(255,255,255,0.05)', textDecoration: 'none'}}>Admin</a>
            <div style={{background: 'rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)'}}>
              v2.5.0-SYNC-ACTIVO
            </div>
          </div>
          
          {/* Robot Heartbeat UI */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', 
            padding: '4px 10px', background: 'rgba(255,255,255,0.04)',
            borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)',
            maxWidth: '100%', flexWrap: 'wrap', justifyContent: 'center'
          }}>
            {(() => {
              const getStatusInfo = (status) => {
                if (!status || !status.lastSync) return { color: '#64748b', text: 'Conectando robot...' };
                
                let lastSyncDate;
                if (status.lastSync.seconds) {
                  lastSyncDate = new Date(status.lastSync.seconds * 1000);
                } else {
                  lastSyncDate = new Date(status.lastSync);
                }
                
                const diffMs = new Date() - lastSyncDate;
                const diffHours = diffMs / (1000 * 60 * 60);
                
                const timeStr = lastSyncDate.toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'});
                if (diffHours < 1.5) return { color: '#10b981', text: `Robot al día: ${timeStr} hs` };
                if (diffHours < 24) return { color: '#f59e0b', text: `Última sinc: ${lastSyncDate.toLocaleDateString('es-AR', {day: '2-digit', month:'short'})} ${timeStr} hs` };
                return { color: '#ef4444', text: `Desconectado (${lastSyncDate.toLocaleDateString('es-AR', {day: '2-digit', month:'2-digit'})})` };
              };
              
              const info = getStatusInfo(robotStatus);
              
              return (
                <>
                  <div style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: info.color,
                    boxShadow: `0 0 6px ${info.color}`
                  }}></div>
                  <span style={{fontSize: '0.65rem', fontWeight: 800, color: info.color, textTransform: 'uppercase', letterSpacing: '0.02em'}}>
                    {info.text}
                  </span>
                </>
              );
            })()}
          </div>
          <div className="header-buttons-row">
            {/* Real-time Presence Badge */}
            <div className="live-badge" title="Usuarios mirando el sitio ahora mismo">
              <div className="live-dot"></div>
              <span>{liveCount} EN VIVO</span>
            </div>

            {/* Admin Contests Drawer Button */}
            {adminMatchesList.length > 0 && (
              <button 
                onClick={() => setShowAdminDrawer(true)}
                style={{
                  background: adminOpportunityList.length > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.12)', 
                  border: adminOpportunityList.length > 0 ? '1.5px solid #f59e0b' : '1.5px solid #ffffff',
                  color: '#ffffff', 
                  padding: '0.25rem 0.65rem', 
                  borderRadius: '6px', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.4rem',
                  fontSize: '0.75rem', 
                  fontWeight: 800,
                  boxShadow: adminOpportunityList.length > 0 ? '0 0 16px rgba(245, 158, 11, 0.6)' : '0 0 14px rgba(255, 255, 255, 0.4)'
                }}
                title="Avisos de Concursos para el Administrador (Colombo Francisco)"
              >
                <Star size={14} fill={adminOpportunityList.length > 0 ? '#f59e0b' : '#ffffff'} color={adminOpportunityList.length > 0 ? '#f59e0b' : '#ffffff'} />
                Avisos Admin ({adminMatchesList.length})
                {adminOpportunityList.length > 0 && (
                  <span style={{
                    background: '#f59e0b',
                    color: '#0f172a',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    fontSize: '0.65rem',
                    fontWeight: 900
                  }}>
                    🔥 {adminOpportunityList.length} en 2°
                  </span>
                )}
              </button>
            )}
            
            <button 
              onClick={() => setShowDonate(true)}
              style={{
                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#f87171', padding: '0.25rem 0.6rem', borderRadius: '6px', 
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                fontSize: '0.75rem', fontWeight: 600
              }}
              title="Colaborar con el proyecto"
              className="admin-row-hover"
            >
              <Heart size={14} fill="#f87171" />
              Colaborar
            </button>

            {!userLocation ? (
              <button
                onClick={fetchLocation}
                className="btn-primary"
                style={{padding: '0.25rem 0.75rem', fontSize: '0.75rem', background: locationError ? '#ef4444' : 'var(--color-primario)'}}
              >
                {locationError ? 'GPS!' : 'Activar GPS'}
              </button>
            ) : (
              <div style={{fontSize: '0.75rem', color: '#34d399', fontWeight: 600, background: 'rgba(52, 211, 153, 0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px'}}>
                📍 GPS Activo
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        {/* Sidebar Filters */}
        <aside className="filters-container glass-panel">
          
          <div style={{marginBottom: '1rem', opacity: 0.3, fontSize: '0.65rem', letterSpacing: '0.1em', fontWeight: 600, textTransform: 'uppercase', textAlign: 'left'}}>
            Created by Colombo Francisco
          </div>

          <div style={{position: 'relative', marginBottom: '1.5rem'}}>
            <Search size={18} style={{position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)'}} />
            <input 
              type="text" 
              placeholder="Buscar escuela, localidad..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', 
                borderRadius: '8px', border: '1px solid var(--border-light)', 
                background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-main)',
                outline: 'none', fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
            <h2 style={{margin: 0}}>Filtros</h2>
            <button 
                onClick={fetchConcursos}
                disabled={loading}
                style={{
                    background: 'none', border: 'none', color: 'var(--text-muted)', 
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                    opacity: loading ? 0.5 : 1
                }}
                title="Actualizar datos"
            >
                <RefreshCw size={18} className={loading ? 'spinner' : ''} style={loading ? {marginBottom: 0, width: 18, height: 18, border: 'none'} : {}} />
            </button>
          </div>
          
          <div className="filter-group">
            {Object.keys(activeFilters).map(level => {
              const count = concursos.filter(c => {
                const cL = resolveLevel(c);
                if (level === 'Otro') return cL === 'Otro' || cL === 'No especificado';
                return cL === level;
              }).length;
              const color = level === 'Secundaria Técnica' 
                ? 'var(--color-secundaria-tecnica)' 
                : level === 'Otro'
                  ? 'var(--color-otro)'
                  : `var(--color-${level.toLowerCase()})`;

              return (
                <button
                  key={level}
                  onClick={() => toggleFilter(level)}
                  className={`filter-btn ${activeFilters[level] ? 'active' : ''}`}
                >
                  <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                    <span 
                      className="level-indicator" 
                      style={{backgroundColor: color}}
                    ></span>
                    {level}
                  </div>
                  <span style={{fontSize: '0.875rem', color: 'var(--text-muted)'}}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick toggle for only Admin Matches and 2° Llamado Opportunities */}
          {adminMatchesList.length > 0 && (
            <div style={{marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
              <button
                onClick={() => {
                  setOnlyAdminMatches(!onlyAdminMatches);
                  if (!onlyAdminMatches) setOnlyAdminOpportunities(false);
                }}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.8rem',
                  borderRadius: '8px',
                  border: onlyAdminMatches ? '1.5px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                  background: onlyAdminMatches ? '#ffffff' : 'rgba(255, 255, 255, 0.05)',
                  color: onlyAdminMatches ? '#0f172a' : '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: onlyAdminMatches ? '0 0 15px rgba(255,255,255,0.5)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                <span>🌟</span>
                <span>{onlyAdminMatches ? 'Mostrando solo Admin' : `Solo Concursos Admin (${adminMatchesList.length})`}</span>
              </button>

              {/* Quick toggle for only Admin 2° Llamado Opportunities */}
              {adminOpportunityList.length > 0 && (
                <button
                  onClick={() => {
                    setOnlyAdminOpportunities(!onlyAdminOpportunities);
                    if (!onlyAdminOpportunities) setOnlyAdminMatches(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.8rem',
                    borderRadius: '8px',
                    border: onlyAdminOpportunities ? '1.5px solid #f59e0b' : '1px solid rgba(245, 158, 11, 0.35)',
                    background: onlyAdminOpportunities ? 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)' : 'rgba(245, 158, 11, 0.08)',
                    color: onlyAdminOpportunities ? '#ffffff' : '#fbbf24',
                    fontWeight: 800,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: onlyAdminOpportunities ? '0 0 18px rgba(245, 158, 11, 0.5)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                  title="Ver únicamente concursos afines al administrador que están en 2° Llamado"
                >
                  <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                    <span>🔥</span>
                    <span>Oportunidades 2° Llamado</span>
                  </div>
                  <span style={{
                    background: onlyAdminOpportunities ? 'rgba(0,0,0,0.3)' : 'rgba(245, 158, 11, 0.2)',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 900
                  }}>
                    {adminOpportunityList.length}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Dropdown Filtro por Escuela */}
          <div style={{marginTop: '1.25rem'}}>
            <label style={{fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem'}}>
              🏫 Filtrar por Escuela
            </label>
            <select
              value={selectedSchool}
              onChange={(e) => setSelectedSchool(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                background: '#1e293b',
                color: 'var(--text-main)',
                outline: 'none',
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas las Escuelas ({uniqueSchools.length})</option>
              {uniqueSchools.map(sch => (
                <option key={sch} value={sch}>
                  {sch}
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown Filtro por Ciudad */}
          <div style={{marginTop: '1rem'}}>
            <label style={{fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.4rem'}}>
              📍 Filtrar por Ciudad / Localidad
            </label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.8rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                background: '#1e293b',
                color: 'var(--text-main)',
                outline: 'none',
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas las Ciudades ({uniqueCities.length})</option>
              {uniqueCities.map(city => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          
          <div style={{marginTop: '2rem', fontSize: '0.875rem', color: 'var(--text-muted)'}}>
            Mostrando {filteredConcursos.length} de {concursos.length} resultados.
          </div>

          {/* Tracking & Seen Controls */}
          <div style={{marginTop: '1.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '1.25rem'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem'}}>
              <h3 style={{fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0}}>
                Control de Lectura
              </h3>
              <span style={{fontSize: '0.72rem', fontWeight: 800, color: totalUnseenCount > 0 ? '#38bdf8' : '#10b981', background: totalUnseenCount > 0 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: '10px'}}>
                {totalUnseenCount > 0 ? `🆕 ${totalUnseenCount} sin ver` : '✓ Al día'}
              </span>
            </div>

            <label style={{display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginBottom: '0.75rem', color: 'var(--text-main)', fontSize: '0.85rem'}}>
              <input 
                type="checkbox" 
                checked={hideSeen}
                onChange={(e) => setHideSeen(e.target.checked)}
                style={{accentColor: '#10b981', width: '16px', height: '16px', cursor: 'pointer'}}
              />
              <span>Ocultar ya Vistos ({totalSeenCount})</span>
            </label>

            <div style={{display: 'flex', gap: '0.5rem', marginTop: '0.5rem'}}>
              <button 
                onClick={handleMarkAllVisibleSeen}
                style={{
                  flex: 1,
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: '#34d399',
                  padding: '0.45rem 0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                title="Marcar todos los concursos actualmente visibles como vistos"
              >
                ✓ Marcar visibles
              </button>
              {seenCardIds.length > 0 && (
                <button 
                  onClick={handleClearAllSeen}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#f87171',
                    padding: '0.45rem 0.6rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  title="Reiniciar casilleros de vistos"
                >
                  Reiniciar
                </button>
              )}
            </div>
          </div>

          {/* Visibility Controls */}
          <div style={{marginTop: '1.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '1.25rem'}}>
            <h3 style={{fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem'}}>Visualización</h3>
            
            <label style={{display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginBottom: '1rem', color: 'var(--text-main)', fontSize: '0.85rem'}}>
              <input 
                type="checkbox" 
                checked={hideInactive}
                onChange={(e) => setHideInactive(e.target.checked)}
                style={{accentColor: 'var(--color-primario)', width: '16px', height: '16px', cursor: 'pointer'}}
              />
              Ocultar Inactivos/Vencidos
            </label>

            {hiddenCardIds.length > 0 && (
              <button 
                onClick={restoreHiddenCards}
                className="btn-primary"
                style={{width: '100%', fontSize: '0.875rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)'}}
              >
                Restaurar {hiddenCardIds.length} ocultos
              </button>
            )}
          </div>
        </aside>

        {/* Main Grid */}
        <section>
          {loading ? (
            <div className="loading-container glass-panel">
              <div className="spinner"></div>
              <p>Sincronizando con el CGE Entre Ríos...</p>
            </div>
          ) : error ? (
            <div className="glass-panel" style={{padding: '2rem', textAlign: 'center', color: '#ef4444'}}>
              <p>{error}</p>
              <button onClick={fetchConcursos} className="btn-primary" style={{width: 'auto', marginTop: '1rem', display: 'inline-block'}}>
                Reintentar
              </button>
            </div>
          ) : filteredConcursos.length === 0 ? (
            <div className="glass-panel" style={{padding: '3rem', textAlign: 'center'}}>
              <h3>No hay resultados</h3>
              <p style={{color: 'var(--text-muted)', marginTop: '0.5rem'}}>
                Intenta ajustar los filtros de nivel.
              </p>
            </div>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: '2.5rem'}}>
               {/* 0. SECTOR PRIORITARIO: CONCURSOS FIJADOS (PINNED) - SIEMPRE VISIBLES PRIMERO */}
               {concursosFijados.length > 0 && (
                <div style={{
                  marginBottom: '1rem',
                  padding: '1.25rem',
                  background: 'rgba(245, 158, 11, 0.04)',
                  borderRadius: '16px',
                  border: '1.5px solid rgba(245, 158, 11, 0.35)',
                  boxShadow: '0 0 25px rgba(245, 158, 11, 0.1)'
                }}>
                  <div style={{
                    marginBottom: '1.25rem', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}>
                    <h2 style={{
                      margin: 0, 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.6rem', 
                      color: '#f59e0b',
                      fontSize: '1.2rem',
                      fontWeight: 800
                    }}>
                      <span style={{ fontSize: '1.35rem' }}>📌</span>
                      Concursos Fijados ({concursosFijados.length})
                    </h2>
                    <span style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 600, background: 'rgba(245, 158, 11, 0.15)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                      ⭐ Siempre visibles al inicio de la pantalla
                    </span>
                  </div>
                  <div className="concursos-grid">
                    {concursosFijados.map(concurso => (
                      <ConcursoCard 
                        key={`pinned-${concurso.id}`} 
                        concurso={{ 
                          ...concurso, 
                          nivel: resolveLevel(concurso), 
                          schoolName: resolveSchoolName(concurso),
                          isAdminOpportunity: resolveAdminOpportunity(concurso)
                        }} 
                        onHide={() => handleHideCard(concurso.id)}
                        onTogglePin={() => handleTogglePin(concurso.id)}
                        isPinned={true}
                        isSeen={seenCardIds.includes(concurso.id)}
                        onToggleSeen={() => handleToggleSeen(concurso.id)}
                        userLocation={userLocation}
                      />
                    ))}
                  </div>
                </div>
              )}

               {concursosNuevos.length > 0 && (
                <div>
                  <h2 style={{marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#f472b6'}}>
                    <span style={{width: '12px', height: '12px', borderRadius: '50%', background: '#f472b6', boxShadow: '0 0 10px #f472b6'}}></span>
                    Novedades del día (Recién Publicados)
                  </h2>
                  <div className="concursos-grid">
                    {concursosNuevos.map(concurso => (
                      <ConcursoCard 
                        key={concurso.id} 
                        concurso={{ 
                          ...concurso, 
                          nivel: resolveLevel(concurso), 
                          schoolName: resolveSchoolName(concurso),
                          isAdminOpportunity: resolveAdminOpportunity(concurso)
                        }} 
                        onHide={() => handleHideCard(concurso.id)}
                        onTogglePin={() => handleTogglePin(concurso.id)}
                        isPinned={pinnedCardIds.includes(concurso.id)}
                        isSeen={seenCardIds.includes(concurso.id)}
                        onToggleSeen={() => handleToggleSeen(concurso.id)}
                        userLocation={userLocation}
                        isNew={true}
                      />
                    ))}
                  </div>
                </div>
              )}
              {concursosHoy.length > 0 && (
                <div>
                  <h2 style={{marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#34d399'}}>
                    <span style={{width: '12px', height: '12px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 10px #34d399'}}></span>
                    Concursos de Hoy
                  </h2>
                  <div className="concursos-grid">
                    {concursosHoy.map(concurso => (
                      <ConcursoCard 
                        key={concurso.id} 
                        concurso={{ 
                          ...concurso, 
                          nivel: resolveLevel(concurso), 
                          schoolName: resolveSchoolName(concurso),
                          isAdminOpportunity: resolveAdminOpportunity(concurso)
                        }} 
                        onHide={() => handleHideCard(concurso.id)}
                        onTogglePin={() => handleTogglePin(concurso.id)}
                        isPinned={pinnedCardIds.includes(concurso.id)}
                        isSeen={seenCardIds.includes(concurso.id)}
                        onToggleSeen={() => handleToggleSeen(concurso.id)}
                        userLocation={userLocation}
                        isToday={true}
                      />
                    ))}
                  </div>
                </div>
              )}

              {concursosManana.length > 0 && (
                <div>
                  <h2 style={{marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#60a5fa'}}>
                    <span style={{width: '12px', height: '12px', borderRadius: '50%', background: '#60a5fa', boxShadow: '0 0 10px #60a5fa'}}></span>
                    Concursos de Mañana
                  </h2>
                  <div className="concursos-grid">
                    {concursosManana.map(concurso => (
                      <ConcursoCard 
                        key={concurso.id} 
                        concurso={{ 
                          ...concurso, 
                          nivel: resolveLevel(concurso), 
                          schoolName: resolveSchoolName(concurso),
                          isAdminOpportunity: resolveAdminOpportunity(concurso)
                        }} 
                        onHide={() => handleHideCard(concurso.id)}
                        onTogglePin={() => handleTogglePin(concurso.id)}
                        isPinned={pinnedCardIds.includes(concurso.id)}
                        isSeen={seenCardIds.includes(concurso.id)}
                        onToggleSeen={() => handleToggleSeen(concurso.id)}
                        userLocation={userLocation}
                      />
                    ))}
                  </div>
                </div>
              )}

              {concursosFuturos.length > 0 && (
                <div>
                  <h2 style={{marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--color-primario)'}}>
                    <span style={{width: '12px', height: '12px', borderRadius: '50%', background: 'var(--color-primario)', boxShadow: '0 0 10px var(--color-primario)'}}></span>
                    Próximos Concursos
                  </h2>
                  <div className="concursos-grid">
                    {concursosFuturos.map(concurso => (
                      <ConcursoCard 
                        key={concurso.id} 
                        concurso={{ 
                          ...concurso, 
                          nivel: resolveLevel(concurso), 
                          schoolName: resolveSchoolName(concurso),
                          isAdminOpportunity: resolveAdminOpportunity(concurso)
                        }} 
                        onHide={() => handleHideCard(concurso.id)}
                        onTogglePin={() => handleTogglePin(concurso.id)}
                        isPinned={pinnedCardIds.includes(concurso.id)}
                        isSeen={seenCardIds.includes(concurso.id)}
                        onToggleSeen={() => handleToggleSeen(concurso.id)}
                        userLocation={userLocation}
                      />
                    ))}
                  </div>
                </div>
              )}

              {concursosPasadosRecientes.length > 0 && !hideInactive && (
                <div>
                  <h2 style={{marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#10b981'}}>
                    <span style={{width: '12px', height: '12px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 10px #10b981'}}></span>
                    Concursos Realizados / Pasados (Últimas 2 Semanas)
                  </h2>
                  <div className="concursos-grid">
                    {concursosPasadosRecientes.map(concurso => (
                      <ConcursoCard 
                        key={concurso.id} 
                        concurso={{ 
                          ...concurso, 
                          nivel: resolveLevel(concurso), 
                          schoolName: resolveSchoolName(concurso),
                          isAdminOpportunity: resolveAdminOpportunity(concurso)
                        }} 
                        onHide={() => handleHideCard(concurso.id)}
                        onTogglePin={() => handleTogglePin(concurso.id)}
                        isPinned={pinnedCardIds.includes(concurso.id)}
                        isSeen={seenCardIds.includes(concurso.id)}
                        onToggleSeen={() => handleToggleSeen(concurso.id)}
                        userLocation={userLocation}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
      {/* Modal Donación */}
      {showDonate && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="glass-panel" style={{
            maxWidth: '500px', width: '100%', padding: '2rem', borderRadius: '24px',
            position: 'relative', border: '1px solid rgba(248, 113, 113, 0.3)'
          }}>
            <button 
              onClick={() => setShowDonate(false)}
              style={{position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer'}}
            >
              <X size={24} />
            </button>

            <div style={{textAlign: 'center', marginBottom: '1.5rem'}}>
              <div style={{background: 'rgba(239, 68, 68, 0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 1rem'}}>
                <Heart size={30} color="#f87171" fill="#f87171" />
              </div>
              <h2 style={{margin: 0, color: '#f1f5f9'}}>Cofre de Solidaridad</h2>
            </div>

            <p style={{lineHeight: '1.6', color: '#cbd5e1', fontSize: '0.95rem', marginBottom: '2rem', whiteSpace: 'pre-line'}}>
              {storefrontSettings.donate_text}
            </p>

            <div style={{background: 'rgba(255,255,255,0.05)', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)'}}>
              <div style={{marginBottom: '1rem', cursor: 'pointer'}} onClick={() => { navigator.clipboard.writeText(storefrontSettings.donate_alias); alert('Alias copiado!'); }}>
                <span style={{display: 'block', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em'}}>Alias (Click p/ copiar)</span>
                <code style={{fontSize: '1.1rem', color: 'var(--color-primario)', fontWeight: 800}}>{storefrontSettings.donate_alias}</code>
              </div>
              <div style={{cursor: 'pointer'}} onClick={() => { navigator.clipboard.writeText(storefrontSettings.donate_cbu); alert('CBU copiado!'); }}>
                <span style={{display: 'block', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em'}}>CBU (Click p/ copiar)</span>
                <code style={{fontSize: '1rem', color: '#f1f5f9'}}>{storefrontSettings.donate_cbu}</code>
              </div>
            </div>

            <button 
              onClick={() => setShowDonate(false)}
              className="btn-primary"
              style={{width: '100%', marginTop: '1.5rem', padding: '1rem'}}
            >
              Entendido ❤️
            </button>
          </div>
        </div>
      )}

      {/* Modal Avisos para el Administrador */}
      {showAdminDrawer && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100,
          padding: '1rem'
        }}>
          <div className="glass-panel" style={{
            maxWidth: '650px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            padding: '1.75rem', borderRadius: '24px', position: 'relative',
            border: '1.5px solid #ffffff', boxShadow: '0 0 35px rgba(255, 255, 255, 0.25)'
          }}>
            <button 
              onClick={() => setShowAdminDrawer(false)}
              style={{position: 'absolute', top: '1.25rem', right: '1.25rem', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer'}}
            >
              <X size={24} />
            </button>

            <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem'}}>
              <div style={{background: '#ffffff', width: '42px', height: '42px', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                <span style={{fontSize: '1.5rem'}}>🌟</span>
              </div>
              <div>
                <h2 style={{margin: 0, color: '#ffffff', fontSize: '1.25rem'}}>Avisos para el Administrador</h2>
                <p style={{margin: 0, fontSize: '0.75rem', color: '#94a3b8'}}>
                  Docente: COLOMBO, FRANCISCO JUAN GUILLERMO (DNI: 34581536)
                </p>
              </div>
            </div>

            <div style={{marginBottom: '0.75rem', fontSize: '0.8rem', color: '#cbd5e1', background: 'rgba(255,255,255,0.06)', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)'}}>
              Se encontraron <strong>{adminMatchesList.length} concursos</strong> vigentes compatibles con tus títulos y habilitaciones docentes oficiales (TIC, Computación, Preceptor, Taller STE, Dibujo Técnico, Bromatología, Educación Tecnológica).
            </div>

            {adminOpportunityList.length > 0 && (
              <div style={{
                marginBottom: '0.75rem',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(180, 83, 9, 0.25) 100%)',
                border: '1.5px solid #f59e0b',
                borderRadius: '10px',
                padding: '0.65rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 0 16px rgba(245, 158, 11, 0.3)'
              }}>
                <span style={{ fontSize: '1.4rem' }}>🔥</span>
                <div style={{ fontSize: '0.82rem', color: '#fef3c7' }}>
                  <strong>¡Atención Francisco!</strong> Tienes <strong>{adminOpportunityList.length} concurso(s) en 2° Llamado</strong> de tu especialidad. Al estar en segundo llamado, las posibilidades de adjudicación son mayores.
                </div>
              </div>
            )}

            <div style={{overflowY: 'auto', flex: 1, paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
              {adminMatchesList.length === 0 ? (
                <p style={{color: '#94a3b8', textAlign: 'center', padding: '2rem 0'}}>No hay concursos activos para el administrador en este momento.</p>
              ) : (
                [...adminMatchesList]
                  .sort((a, b) => (resolveAdminOpportunity(b) ? 1 : 0) - (resolveAdminOpportunity(a) ? 1 : 0))
                  .map(item => {
                    const isOpp = resolveAdminOpportunity(item);
                    return (
                      <div key={item.id} style={{
                        background: isOpp ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(255, 255, 255, 0.04) 100%)' : 'rgba(255, 255, 255, 0.04)',
                        border: isOpp ? '1.5px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.2)',
                        boxShadow: isOpp ? '0 0 16px rgba(245, 158, 11, 0.25)' : 'none',
                        borderRadius: '12px',
                        padding: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        position: 'relative'
                      }}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap'}}>
                          <div style={{display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap'}}>
                            <span style={{
                              background: isOpp ? '#f59e0b' : '#ffffff',
                              color: '#0f172a',
                              fontWeight: 800,
                              fontSize: '0.7rem',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px'
                            }}>
                              {item.adminMatchedSubject || 'Perfil Administrador'}
                            </span>
                            {isOpp && (
                              <span style={{
                                background: 'rgba(245, 158, 11, 0.25)',
                                color: '#fbbf24',
                                border: '1px solid #f59e0b',
                                fontWeight: 800,
                                fontSize: '0.68rem',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}>
                                🔥 2° LLAMADO
                              </span>
                            )}
                          </div>
                          <span style={{fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600}}>
                            {item.department?.replace('(Dpto)', '').trim()}
                          </span>
                        </div>
                        <div style={{fontWeight: 700, fontSize: '0.88rem', color: isOpp ? '#fef3c7' : '#f8fafc'}}>
                          {item.schoolName || item.title}
                        </div>
                        {item.materiasSummary && (
                          <div style={{fontSize: '0.78rem', color: '#34d399'}}>
                            📖 {item.materiasSummary}
                          </div>
                        )}
                        {item.primaryLlamado && (
                          <div style={{fontSize: '0.75rem', color: isOpp ? '#f59e0b' : '#fbbf24', fontWeight: isOpp ? 700 : 500}}>
                            ⏰ {item.primaryLlamado}
                          </div>
                        )}
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px'}}>
                          <span style={{fontSize: '0.7rem', color: '#94a3b8'}}>
                            {item.date ? new Date(item.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Fecha a confirmar'} hs
                          </span>
                          <a 
                            href={item.link} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            style={{
                              fontSize: '0.75rem', color: '#ffffff', textDecoration: 'none', background: isOpp ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.15)',
                              border: isOpp ? '1px solid rgba(245, 158, 11, 0.5)' : 'none',
                              padding: '0.25rem 0.6rem', borderRadius: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                          >
                            Ver en CGE <ExternalLink size={12} />
                          </a>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            <button 
              onClick={() => setShowAdminDrawer(false)}
              className="btn-primary"
              style={{marginTop: '1.25rem', padding: '0.75rem', background: '#ffffff', color: '#0f172a', fontWeight: 800}}
            >
              Cerrar Avisos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
