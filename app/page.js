'use client';

import { useState, useEffect } from 'react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import ConcursoCard from './components/ConcursoCard';
import { RefreshCw, Search, Heart, X, Users } from 'lucide-react';

import { db } from '../firebase.config';
import { collection, getDocs, query, orderBy, doc, getDoc, setDoc, updateDoc, increment, onSnapshot } from 'firebase/firestore';

export default function Home() {
  const [concursos, setConcursos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Visibility State
  const [hideInactive, setHideInactive] = useState(false);
  const [hiddenCardIds, setHiddenCardIds] = useState([]);
  
  // Filter state
  const [activeFilters, setActiveFilters] = useState({
    Inicial: true,
    Primario: true,
    Secundario: true,
    Superior: true,
    Otro: true
  });

  // User Location State
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);

  // Social/Analytics State
  const [visitorCount, setVisitorCount] = useState(0);
  const [showDonate, setShowDonate] = useState(false);
  const [robotStatus, setRobotStatus] = useState(null);

  // Persistence: Load hidden IDs on mount
  useEffect(() => {
    const saved = localStorage.getItem('hiddenConcursos');
    if (saved) {
      try {
        setHiddenCardIds(JSON.parse(saved));
      } catch (e) { console.error("Error loading hidden contests", e); }
    }
  }, []);

  // Persistence: Save hidden IDs on change
  useEffect(() => {
    localStorage.setItem('hiddenConcursos', JSON.stringify(hiddenCardIds));
  }, [hiddenCardIds]);

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
    const unsub = onSnapshot(doc(db, 'system', 'robot_status'), (snap) => {
      if (snap.exists()) setRobotStatus(snap.data());
    });
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
        
        // Timeout to avoid hang
        const fetchPromise = getDocs(q);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 4000));
        
        const querySnapshot = await Promise.race([fetchPromise, timeoutPromise]);
        if (!querySnapshot.empty) {
            data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`[DEBUG] Firestore returned ${data.length} docs.`);
        }
      } catch (dbError) {
        console.warn("Firestore fetch error/timeout, fallback incoming:", dbError);
      }

      // FALLBACK TO STATIC JSON
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
          setConcursos(data);
          setLoading(false);
          if (!Capacitor.isNativePlatform()) return; // On web, we are done with static data
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
                  // Prioritize Secondary types first
                  if (
                      lowerText.includes('secundari') || lowerText.includes('sec.') || lowerText.includes('sec ') || 
                      lowerText.includes('jovenes') || lowerText.includes('jóvenes') || 
                      lowerText.includes('esja') || lowerText.includes('e.s.j.a') ||
                      lowerText.includes('eeat') || lowerText.includes('e.e.a.t') ||
                      lowerText.includes('eet') || lowerText.includes('e.e.t') ||
                      lowerText.includes('técnica') || lowerText.includes('tecnica') || 
                      lowerText.includes('esa ') || lowerText.includes('e.s.a')
                  ) nivel = 'Secundario';
                  else if (lowerText.includes('inicial') || lowerText.includes('integral') || lowerText.includes('especial') || lowerText.includes('jardin') || lowerText.includes('jardín')) nivel = 'Inicial';
                  else if (lowerText.includes('primari') || lowerText.includes('nep') || lowerText.includes('nina') || lowerText.includes('escuela n°') || lowerText.includes('esc. nro') || lowerText.includes('esc. nº') || lowerText.includes('idioma extranjero') || /esc(?:uela|\.?)\s*(?:n[ro|º|°\.? ]*)?\d+/i.test(lowerText)) nivel = 'Primario';
                  else if (lowerText.includes('superior')) nivel = 'Superior';
                  
                  const isParana = url.includes('departamental-parana') || lowerText.includes('paran') || lowerText.includes('pná') || lowerText.includes('pna');
                  if (!isParana) return;
                  if (!url.includes('departamental-parana') && !fullHref.includes('/2026/') && !fullHref.includes('/2025/')) return;
                       const eventDate = extractEventDate(text, fullHref);
                       if (eventDate && eventDate < cutoffDate) return; 

                     let priority = 3;
                      if (eventDate && eventDate >= new Date().setHours(0,0,0,0) && eventDate <= new Date().setHours(47,59,59,999)) priority = 1;
                      else if (nivel === 'Secundario' && !eventDate) priority = 1;
                      else if (eventDate && eventDate > endOfTomorrow) priority = 2;
                     
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
      
      // Sort by original CGE publication order (0 is newest)
      const sorted = finalData.sort((a, b) => {
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

  const now = new Date();
  const cutoffDate = new Date();
  cutoffDate.setDate(now.getDate() - 30);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayStr = now.toISOString().split('T')[0];

  const filteredConcursos = concursos.filter(c => {
    const levelMatch = activeFilters[c.nivel] || (c.nivel === 'No especificado' && activeFilters['Otro']);
    const searchMatch = searchQuery === '' || 
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.department.toLowerCase().includes(searchQuery.toLowerCase());
      
    const docDate = c.date ? new Date(c.date) : null;
    const isTooOld = docDate && docDate < cutoffDate;
    
    // hideMatch: Hide if (Too Old AND user wants to hide inactive) OR (Hidden manually)
    const hideMatch = !(hideInactive && isTooOld) && !hiddenCardIds.includes(c.id);
      
    return levelMatch && searchMatch && hideMatch;
  });

  const concursosNuevos = filteredConcursos.filter(c => {
    return c.pubDate === todayStr;
  });

  const concursosHoy = filteredConcursos.filter(c => {
    if (!c.date || c.pubDate === todayStr) return false;
    const d = new Date(c.date);
    return d >= startOfToday && d < new Date(startOfToday.getTime() + 86400000);
  });

  const concursosManana = filteredConcursos.filter(c => {
    if (!c.date || c.pubDate === todayStr) return false;
    const d = new Date(c.date);
    const startOfTomorrow = new Date(startOfToday.getTime() + 86400000);
    const startOfDayAfter = new Date(startOfToday.getTime() + 172800000);
    return d >= startOfTomorrow && d < startOfDayAfter;
  });

  const concursosFuturos = filteredConcursos.filter(c => {
    if (!c.date) return true; 
    if (c.pubDate === todayStr) return false;
    const d = new Date(c.date);
    const startOfDayAfter = new Date(startOfToday.getTime() + 172800000);
    return d >= startOfDayAfter;
  });

  const concursosRecientes = filteredConcursos.filter(c => {
    if (!c.date || c.pubDate === todayStr) return false;
    const d = new Date(c.date);
    return d < startOfToday && d >= cutoffDate; 
  });

  const concursosVencidos = filteredConcursos.filter(c => {
    if (!c.date) return false;
    const d = new Date(c.date);
    return d < cutoffDate; // Truly expired
  });

  return (
    <div className="container">
      <header className="header" style={{position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div>
           <h1>Concursos Docentes</h1>
           <p>Gestión ágil y dinámica para el Departamento Paraná</p>
        </div>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
            <a href="/admin" style={{fontSize: '0.7rem', color: 'rgba(255,255,255,0.05)', textDecoration: 'none'}}>Admin</a>
            <div style={{background: 'rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)'}}>
              v2.4.9-ROBOT-MONITOR-V2
            </div>
          </div>
          
          {/* Robot Heartbeat UI */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px', 
            padding: '4px 8px', background: 'rgba(255,255,255,0.03)',
            borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)'
          }}>
            {(() => {
              const getStatusInfo = (status) => {
                if (!status || !status.lastSync) return { color: '#64748b', text: '...' };
                
                let lastSyncDate;
                if (status.lastSync.seconds) {
                  lastSyncDate = new Date(status.lastSync.seconds * 1000);
                } else {
                  lastSyncDate = new Date(status.lastSync);
                }
                
                const diffMs = new Date() - lastSyncDate;
                const diffHours = diffMs / (1000 * 60 * 60);
                
                if (diffHours < 1.2) return { color: '#10b981', text: `Sincronizado: ${lastSyncDate.toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'})}` };
                if (diffHours < 24) return { color: '#f59e0b', text: `Última sinc: ${lastSyncDate.toLocaleDateString('es-AR', {day: '2-digit', month:'short'})}` };
                return { color: '#ef4444', text: 'Robot Desconectado' };
              };
              
              const info = getStatusInfo(robotStatus);
              
              return (
                <>
                  <div style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: info.color,
                    boxShadow: `0 0 5px ${info.color}`
                  }}></div>
                  <span style={{fontSize: '0.65rem', fontWeight: 700, color: info.color, textTransform: 'uppercase', letterSpacing: '0.02em'}}>
                    {info.text}
                  </span>
                </>
              );
            })()}
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: 0.6, fontSize: '0.7rem', color: 'var(--text-muted)'}}>
              <Users size={14} />
              <span>{visitorCount.toLocaleString()}</span>
            </div>
            
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
            {Object.keys(activeFilters).map(level => (
              <button
                key={level}
                onClick={() => toggleFilter(level)}
                className={`filter-btn ${activeFilters[level] ? 'active' : ''}`}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
                  <span 
                    className="level-indicator" 
                    style={{backgroundColor: `var(--color-${level.toLowerCase()})`}}
                  ></span>
                  {level}
                </div>
                <span style={{fontSize: '0.875rem', color: 'var(--text-muted)'}}>
                  ({concursos.filter(c => c.nivel === level).length})
                </span>
              </button>
            ))}
          </div>

          
          <div style={{marginTop: '2rem', fontSize: '0.875rem', color: 'var(--text-muted)'}}>
            Mostrando {filteredConcursos.length} de {concursos.length} resultados.
          </div>

          {/* Visibility Controls */}
          <div style={{marginTop: '2rem', borderTop: '1px solid var(--border-light)', paddingTop: '1.5rem'}}>
            <h3 style={{fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '1rem'}}>Visualización</h3>
            
            <label style={{display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginBottom: '1rem', color: 'var(--text-main)'}}>
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
                        concurso={concurso} 
                        onHide={() => handleHideCard(concurso.id)}
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
                        concurso={concurso} 
                        onHide={() => handleHideCard(concurso.id)}
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
                        concurso={concurso} 
                        onHide={() => handleHideCard(concurso.id)}
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
                        concurso={concurso} 
                        onHide={() => handleHideCard(concurso.id)}
                        userLocation={userLocation}
                      />
                    ))}
                  </div>
                </div>
              )}

              {concursosRecientes.length > 0 && (
                <div>
                  <h2 style={{marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#fb923c'}}>
                    <span style={{width: '12px', height: '12px', borderRadius: '50%', background: '#fb923c', boxShadow: '0 0 10px #fb923c'}}></span>
                    Concursos Recientes (Activos)
                  </h2>
                  <div className="concursos-grid">
                    {concursosRecientes.map(concurso => (
                      <ConcursoCard 
                        key={concurso.id} 
                        concurso={concurso} 
                        onHide={() => handleHideCard(concurso.id)}
                        userLocation={userLocation}
                        isRecent={true}
                      />
                    ))}
                  </div>
                </div>
              )}

              {concursosVencidos.length > 0 && !hideInactive && (
                <div>
                  <h2 style={{marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)'}}>
                    <span style={{width: '12px', height: '12px', borderRadius: '50%', background: 'var(--text-muted)'}}></span>
                    Concursos Vencidos
                  </h2>
                  <div className="concursos-grid" style={{opacity: 0.7}}>
                    {concursosVencidos.map(concurso => (
                      <ConcursoCard 
                        key={concurso.id} 
                        concurso={concurso} 
                        onHide={() => handleHideCard(concurso.id)}
                        userLocation={userLocation}
                        isExpired={true}
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

            <p style={{lineHeight: '1.6', color: '#cbd5e1', fontSize: '0.95rem', marginBottom: '2rem'}}>
              ¡Hola, colega! 👋 👩‍🏫👨‍🏫 <br /><br />
              Este espacio fue creado con mucha dedicación para que todos tengamos las mismas oportunidades de encontrar nuestro lugar en el aula. 🏫✨<br /><br />
              Si esta web te ayudó a conseguir ese cargo o suplencia que buscabas, o simplemente te facilita el día a día, te invito a colaborar con lo que puedas para mantener los servidores y seguir mejorando el servicio. <br /><br />
              ¡Mucha suerte en tu próximo concurso! 💪📖
            </p>

            <div style={{background: 'rgba(255,255,255,0.05)', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)'}}>
              <div style={{marginBottom: '1rem'}}>
                <span style={{display: 'block', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em'}}>Alias Mercado Pago</span>
                <code style={{fontSize: '1.1rem', color: 'var(--color-primario)', fontWeight: 800}}>fcolombo61.ppay</code>
              </div>
              <div>
                <span style={{display: 'block', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em'}}>CBU</span>
                <code style={{fontSize: '1rem', color: '#f1f5f9'}}>0000076500000038535516</code>
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
    </div>
  );
}
