'use client';

import { useState, useEffect } from 'react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import ConcursoCard from './components/ConcursoCard';
import { RefreshCw, Search as SearchIcon } from 'lucide-react';

import { db } from '../firebase.config';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

export default function Home() {
  const [concursos, setConcursos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Visibility State
  const [hideInactive, setHideInactive] = useState(true);
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

  const fetchConcursos = async () => {
    let finalData = [];
    try {
      setLoading(true);
      setError(null);
      
      // 1. TRY FIRESTORE FIRST (Cloud sync, live data)
      try {
        console.log("Fetching from Firestore...");
        const q = query(collection(db, 'concursos'), orderBy('pubDate', 'desc'));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setConcursos(data);
            setLoading(false);
            return; // SUCCESS!
        }
      } catch (dbError) {
        console.warn("Firestore fetch failed, falling back...", dbError);
      }

      // 2. FALLBACK TO STATIC JSON (If Firestore is empty or fails)
      const FIREBASE_DATA_URL = 'https://concursos-entre-rios.web.app/parsed_data.json';

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
            const tmRegex = /(?:a las\s*)?(\d{1,2})[:,\.]?(\d{2})?\s*(?:hs|horas|h)/i;
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
               h = parseInt(tmMatch[1], 10);
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

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);

        for (const url of urls) {
          const response = await CapacitorHttp.get({ url });
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
                     let priority = 3;
                      if (eventDate && eventDate >= startOfToday && eventDate <= endOfTomorrow) priority = 1;
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

              const tmRegex = /(\d{1,2})[:,\.](\d{2})\s*(?:hs|horas|h)?|(\d{1,2})\s*(?:hs|horas|h)/i;
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
        const res = await fetch('/api/concursos');
        const data = await res.json();
        if (data.success) {
          finalData = data.data;
        } else {
          throw new Error(data.error);
        }
      }
      
      // Sort by date (closest first)
      const sorted = finalData.sort((a, b) => new Date(a.date) - new Date(b.date));
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

  const filteredConcursos = concursos.filter(c => {
    const levelMatch = activeFilters[c.nivel] || (c.nivel === 'No especificado' && activeFilters['Otro']);
    const searchMatch = searchQuery === '' || 
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.department.toLowerCase().includes(searchQuery.toLowerCase());
      
    const isInactive = c.date && new Date(c.date) < new Date(new Date().setHours(0,0,0,0));
    const hideMatch = !(hideInactive && isInactive) && !hiddenCardIds.includes(c.id);
      
    return levelMatch && searchMatch && hideMatch;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  const concursosHoy = filteredConcursos.filter(c => {
    if (!c.date) return false;
    const d = new Date(c.date);
    return d >= today && d < tomorrow;
  });

  const concursosManana = filteredConcursos.filter(c => {
    if (!c.date) return false;
    const d = new Date(c.date);
    return d >= tomorrow && d < dayAfterTomorrow;
  });

  const concursosFuturos = filteredConcursos.filter(c => {
    if (!c.date) return true; // Items without date are shown in future/general
    const d = new Date(c.date);
    return d >= dayAfterTomorrow;
  });

  const concursosPasados = filteredConcursos.filter(c => {
    if (!c.date) return false;
    const d = new Date(c.date);
    return d < today;
  });

  return (
    <div className="container">
      <header className="header" style={{position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div>
           <h1>Concursos Docentes</h1>
           <p>Gestión ágil y dinámica para el Departamento Paraná</p>
        </div>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
            <a href="/admin" style={{fontSize: '0.7rem', color: 'rgba(255,255,255,0.05)', textDecoration: 'none'}}>Admin</a>
            <div style={{background: 'rgba(255,255,255,0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)'}}>
              v1.0.9
            </div>
          </div>
          {/* Global Location Toggle */}
          {!userLocation ? (
            <button
               onClick={fetchLocation}
               className="btn-primary"
               style={{padding: '0.25rem 0.75rem', fontSize: '0.75rem', background: locationError ? '#ef4444' : 'var(--color-primario)'}}
            >
               {locationError ? 'Error en GPS - Reintentar' : 'Activar GPS para Distancias'}
            </button>
          ) : (
            <div style={{fontSize: '0.75rem', color: '#34d399', fontWeight: 600}}>
               📍 GPS Activado
            </div>
          )}
        </div>
      </header>

      <main className="main-content">
        {/* Sidebar Filters */}
        <aside className="filters-container glass-panel">
          
          <div style={{marginBottom: '1rem', opacity: 0.3, fontSize: '0.65rem', letterSpacing: '0.1em', fontWeight: 600, textTransform: 'uppercase', textAlign: 'left'}}>
            Created by Colombo Francisco
          </div>

          <div style={{position: 'relative', marginBottom: '1.5rem'}}>
            <SearchIcon size={18} style={{position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)'}} />
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

              {concursosPasados.length > 0 && !hideInactive && (
                <div>
                  <h2 style={{marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)'}}>
                    <span style={{width: '12px', height: '12px', borderRadius: '50%', background: 'var(--text-muted)'}}></span>
                    Concursos Pasados
                  </h2>
                  <div className="concursos-grid" style={{opacity: 0.7}}>
                    {concursosPasados.map(concurso => (
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
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
