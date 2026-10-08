'use client';

import { useState, useEffect } from 'react';
import { differenceInSeconds, parseISO } from 'date-fns';
import { Clock, CalendarDays, ExternalLink, MapPin, EyeOff, Map as MapIcon, Route, BookOpen, Pin, CheckSquare, Square } from 'lucide-react';

// Haversine formula to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}

export default function ConcursoCard({ concurso, onHide, onTogglePin, isPinned, onToggleSeen, isSeen, userLocation, isRecent, isNew, isToday, isExpired: forceExpired }) {
  const [timeLeft, setTimeLeft] = useState(null);
  const [showAllPlazas, setShowAllPlazas] = useState(false);

  
  // Clean text function for fail-safe UI display
  const cleanText = (text) => {
    if (!text) return '';
    return text
      .replace(/moment\.updateLocale[\s\S]*?\}\s*\);/g, '')
      .replace(/window\.twttr[\s\S]*?\}\s*\(document, "script", "twitter-wjs"\)\);/g, '')
      .replace(/\{"prefetch"[\s\S]*? conservative"\}\}/g, '')
      .replace(/\/\* <!\[CDATA\[ \*\/[\s\S]*?\/\* \]\]> \*/g, '')
      .replace(/dlmXHRtranslations[\s\S]*?dlmXHRProgress = "\d"/g, '')
      .replace(/var params = \{[\s\S]*?script-js-extra/g, '')
      .replace(/var WPAS_Ajax = \{[\s\S]*?wpas-scripts-js-extra/g, '')
      .replace(/var swiper = new Swiper[\s\S]*?\}\);/g, '')
      // Remove common nav keywords if they appear at start (navigation junk)
      .replace(/^(?:window\.twttr|Autoridades|Contacto|Inicio|Buscar|DDE|Organismos|Infraestructura|Normativa|Compartir|Tweet|WhatsApp|Imprimir)[\s\S]*?Imprimir/m, '')
      .trim();
  };

  const [distance, setDistance] = useState(null);
  const [loadingDistance, setLoadingDistance] = useState(false);
  const [distanceError, setDistanceError] = useState(null);
  const targetDate = concurso.date ? parseISO(concurso.date) : null;

  // Timer logic
  useEffect(() => {
    const calculateTimeLeft = () => {
      if (!targetDate) return null;
      const now = new Date();
      const diffInSeconds = differenceInSeconds(targetDate, now);
      
      if (diffInSeconds <= 0) {
        return { isExpired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
      }

      const days = Math.floor(diffInSeconds / 86400);
      const hours = Math.floor((diffInSeconds % 86400) / 3600);
      const minutes = Math.floor((diffInSeconds % 3600) / 60);
      const seconds = diffInSeconds % 60;

      return { isExpired: false, days, hours, minutes, seconds };
    };

    // Initial calculation
    setTimeLeft(calculateTimeLeft());

    // Update every second
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [concurso.date]);

  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const isUrgent = timeLeft && !timeLeft.isExpired && (timeLeft.days === 0 && timeLeft.hours < 12);
  const isPast = timeLeft?.isExpired || false;
  // Never turn off or dim cards within the 2-week window; forceExpired is reserved for >14 days
  const isExpired = forceExpired || false; 

  const isOpportunity = concurso.isAdminOpportunity || (concurso.isAdminMatch && (concurso.isSegundoLlamado || /(?:2[°ºoª]?|2do|segundo)\s*llamado/i.test(`${concurso.primaryLlamado || ''} ${concurso.title || ''}`)));

  let themeColor = '#10b981'; // Green default for past (< 2 weeks)
  if (isOpportunity) {
    themeColor = '#f59e0b'; // Amber Gold for Admin Opportunities (2° Llamado)
  } else if (concurso.isAdminMatch) {
    themeColor = '#ffffff'; // White for Admin matches
  } else if (concurso.isTardio) {
    themeColor = '#facc15'; // Yellow for Late uploads
  } else if (isNew) {
    themeColor = '#f472b6'; // Pink
  } else if (!isPast) {
    if (isToday) themeColor = '#38bdf8'; // Cyan
    else if (isRecent) themeColor = '#fb923c'; // Orange
    else themeColor = 'var(--color-primario)'; // Brand blue
  } else {
    themeColor = '#10b981'; // Green for passed within 2 weeks
  }
  
  const isActive = !isPast;

  const cardBorderColor = isOpportunity
    ? '#f59e0b'
    : concurso.isAdminMatch 
      ? '#ffffff' 
      : concurso.isTardio 
        ? '#facc15' 
        : `${themeColor}44`;

  const cardBoxShadow = isOpportunity
    ? '0 0 32px rgba(245, 158, 11, 0.65), inset 0 0 0 2px #f59e0b'
    : concurso.isAdminMatch
      ? '0 0 25px rgba(255, 255, 255, 0.4), inset 0 0 0 1.5px #ffffff'
      : concurso.isTardio
        ? '0 10px 30px -10px rgba(250, 204, 21, 0.45), inset 0 0 0 1.5px rgba(250, 204, 21, 0.5)'
        : `0 10px 30px -10px ${themeColor}44, inset 0 0 0 1px ${themeColor}33`;

  const cardBackground = isOpportunity
    ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.09) 0%, rgba(255, 255, 255, 0.04) 100%)'
    : concurso.isAdminMatch
      ? 'rgba(255, 255, 255, 0.05)'
      : concurso.isTardio
        ? 'rgba(250, 204, 21, 0.03)'
        : undefined;

  // Resolve Caracteres (STF / STV / SCV) with resilient fallback
  const resolvedCaracteres = (concurso.caracteres && concurso.caracteres.length > 0)
    ? concurso.caracteres
    : (() => {
        const list = [];
        const combined = `${concurso.fullContent || ''} ${(concurso.plazas || []).join(' ')}`;
        if (/\bSTF\b|suplente\s*t[eé]rmino\s*fijo/i.test(combined)) {
          list.push({ codigo: 'STF', nombre: 'Suplente Término Fijo', badgeColor: '#38bdf8', badgeBg: 'rgba(56, 189, 248, 0.15)' });
        }
        if (/\bSTV\b|suplente\s*t[eé]rmino\s*vacante/i.test(combined)) {
          list.push({ codigo: 'STV', nombre: 'Suplente Término Vacante', badgeColor: '#a855f7', badgeBg: 'rgba(168, 85, 247, 0.15)' });
        }
        if (/\bSCV\b|suplente\s*cargo\s*vacante/i.test(combined)) {
          list.push({ codigo: 'SCV', nombre: 'Suplente Cargo Vacante', badgeColor: '#ec4899', badgeBg: 'rgba(236, 72, 153, 0.15)' });
        }
        return list;
      })();

  const handleCopyText = () => {
    if (concurso.fullContent) {
      navigator.clipboard.writeText(concurso.fullContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Resolve Plazas List with resilient fallback
  const resolvedPlazas = (concurso.plazasList && concurso.plazasList.length > 0)
    ? concurso.plazasList
    : (() => {
        if (!concurso.fullContent) return [];
        const lines = concurso.fullContent.split('\n').map(l => l.trim()).filter(l => l.length > 5);
        const list = [];
        for (const l of lines) {
          if (/(?:n[°º]?\s*(?:de\s*)?)?plazas?(?:\s*sage)?|p\s*:\s*\d+|p\.\s*:\s*\d+|\bpl\s*\d{4,8}\b/i.test(l)) {
            const horasM = l.match(/(?:^|[^\d])(\d{1,2})\s*(?:hs|h|horas)\b/i);
            const carM = l.match(/\b(STF|STV|SCV|TIT)\b/i);
            const plazasM = l.match(/\b(\d{4,7})\b/g) || [];
            let cleanM = l
              .replace(/(?:n[°º]?\s*(?:de\s*)?)?plazas?(?:\s*sage)?|p\s*:\s*|p\.\s*:|\bpl\b/gi, '')
              .replace(/\b\d{4,7}\b/g, '')
              .replace(/\(?\d+\s*(?:hs|horas)\)?/gi, '')
              .replace(/\b(?:STF|STV|SCV|TIT)\b/gi, '')
              .replace(/^[•\-\*–—\s:;,\.\/]+|[•\-\*–—\s:;,\.\/]+$/g, '')
              .slice(0, 45)
              .trim();
            list.push({
              materia: cleanM.length > 2 ? cleanM : null,
              horas: horasM ? parseInt(horasM[1], 10) : null,
              caracter: carM ? carM[1].toUpperCase() : null,
              plazas: plazasM.filter(n => parseInt(n, 10) > 1000 && !['2024','2025','2026'].includes(n))
            });
          }
        }
        return list;
      })();


  // Function to build a search query for Nominatim
  const getNominationQuery = () => {
    if (concurso.location && concurso.location.trim().length > 3) {
      return concurso.location;
    }
     // Clean up title to find school number/name better
     const basicMatch = concurso.title.match(/(ESCUELA[\w\sº°Nn]+(?:\d+|[A-Za-z]+))/i);
     let searchString = basicMatch ? basicMatch[0] : '';
     
     // Append department/city
     let city = (concurso.department || 'Paraná').replace('(Dpto)', '').trim();
     return `${searchString}, ${city}, Entre Rios, Argentina`;
  };

  const mapQuery = getNominationQuery();

  const handleFetchDistance = async () => {
    if (!userLocation) {
      setDistanceError("GPS no disponible.");
      return;
    }

    setLoadingDistance(true);
    setDistanceError(null);

    try {
      const query = encodeURIComponent(mapQuery);
      // Using Nominatim (OpenStreetMap)
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
      
      if (!res.ok) throw new Error("Error en la API");
      
      const data = await res.json();
      
      if (data && data.length > 0) {
        const destLat = parseFloat(data[0].lat);
        const destLon = parseFloat(data[0].lon);
        const distKm = calculateDistance(userLocation.lat, userLocation.lng, destLat, destLon);
        
        if (distKm < 1) {
            setDistance(`${(distKm * 1000).toFixed(0)} m`);
        } else {
            setDistance(`${distKm.toFixed(1)} km`);
        }
      } else {
        // Fallback search only by city if school not found
        const cityQuery = encodeURIComponent(`${concurso.department.replace('(Dpto)', '').trim()}, Entre Rios, Argentina`);
        const fallbackRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${cityQuery}&limit=1`);
        const fallbackData = await fallbackRes.json();
        
        if (fallbackData && fallbackData.length > 0) {
            const destLat = parseFloat(fallbackData[0].lat);
            const destLon = parseFloat(fallbackData[0].lon);
            const distKm = calculateDistance(userLocation.lat, userLocation.lng, destLat, destLon);
            setDistance(`~${distKm.toFixed(1)} km (al Centro)`);
        } else {
            setDistanceError("No encontrada.");
        }
      }
    } catch (err) {
      console.error(err);
      setDistanceError("Error");
    } finally {
      setLoadingDistance(false);
    }
  };

  return (
    <div 
      className={`glass-panel concurso-card ${forceExpired ? 'expired' : ''} ${isSeen ? 'seen-card' : ''}`} 
      data-level={concurso.nivel}
      style={{
        boxShadow: cardBoxShadow,
        borderColor: cardBorderColor,
        background: cardBackground,
        opacity: isSeen ? 0.88 : 1
      }}
    >
      {/* Decorative top bar */}
      <div 
        className="concurso-level-bar" 
        style={{
          background: concurso.isAdminMatch 
            ? 'linear-gradient(90deg, #ffffff, #94a3b8, #ffffff)' 
            : themeColor,
          boxShadow: concurso.isAdminMatch ? '0 0 10px #ffffff' : undefined
        }}
      ></div>

      <div className="card-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div style={{display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap'}}>
          {/* Admin Opportunity (2° Llamado) / Admin Match Badge */}
          {isOpportunity ? (
            <span 
              className="level-badge" 
              style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
                color: '#ffffff',
                fontWeight: 900,
                border: '1.5px solid #fbbf24',
                boxShadow: '0 0 18px rgba(245, 158, 11, 0.85)',
                letterSpacing: '0.04em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0.25rem 0.65rem'
              }}
              title="¡Concurso en 2° Llamado compatible con tu credencial docente! Alta prioridad de adjudicación."
            >
              🔥⭐ OPORTUNIDAD ADMIN · 2° LLAMADO {concurso.adminMatchedSubject ? `(${concurso.adminMatchedSubject})` : ''}
            </span>
          ) : concurso.isAdminMatch ? (
            <span 
              className="level-badge" 
              style={{
                background: '#ffffff',
                color: '#0f172a',
                fontWeight: 900,
                border: '1px solid #ffffff',
                boxShadow: '0 0 12px rgba(255, 255, 255, 0.7)',
                letterSpacing: '0.04em'
              }}
            >
              🌟 CONCURSO PARA EL ADMINISTRADOR {concurso.adminMatchedSubject ? `(${concurso.adminMatchedSubject})` : ''}
            </span>
          ) : null}

          {/* Late Upload Badge */}
          {concurso.isTardio && !concurso.isAdminMatch && (
            <span 
              className="level-badge" 
              style={{
                background: 'rgba(250, 204, 21, 0.2)',
                color: '#facc15',
                border: '1px solid rgba(250, 204, 21, 0.6)',
                fontWeight: 800,
                letterSpacing: '0.03em'
              }}
            >
              ⚠️ CARGA TARDÍA (Detectado Hoy)
            </span>
          )}

          <span 
            className="level-badge"
            style={{
              background: concurso.nivel === 'Secundaria Técnica' ? 'rgba(245, 158, 11, 0.2)' : undefined,
              color: concurso.nivel === 'Secundaria Técnica' ? '#f59e0b' : undefined,
              borderColor: concurso.nivel === 'Secundaria Técnica' ? 'rgba(245, 158, 11, 0.4)' : undefined
            }}
          >
            {concurso.nivel}
          </span>
          {isNew && <span className="level-badge" style={{background: 'rgba(244, 114, 182, 0.2)', color: '#f472b6', border: '1px solid rgba(244, 114, 182, 0.3)', fontWeight: 700}}>NOVEDAD</span>}
          {isRecent && isActive && <span className="level-badge" style={{background: 'rgba(251, 146, 60, 0.2)', color: '#fb923c', border: '1px solid rgba(251, 146, 60, 0.3)', fontWeight: 700}}>RECIENTE</span>}
          {isPast && !forceExpired && <span className="level-badge" style={{background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 700}}>REALIZADO</span>}
          {forceExpired && <span className="level-badge" style={{background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', fontWeight: 700}}>VENCIDO</span>}
          
          {concurso.primaryLlamado && (
            <span className="level-badge" title={concurso.primaryLlamado} style={{background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: 700}}>
              {concurso.primaryLlamado}
            </span>
          )}

          {concurso.distinctSubject && (!concurso.primaryLlamado || !concurso.primaryLlamado.toLowerCase().includes(concurso.distinctSubject.toLowerCase())) && (
            <span className="level-badge" title={concurso.distinctSubject} style={{background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', wordBreak: 'break-word', whiteSpace: 'normal'}}>
              {concurso.distinctSubject}
            </span>
          )}

          {/* Badges de Carácter del Cargo (STF / STV / SCV) */}
          {resolvedCaracteres.map((car, idx) => (
            <span 
              key={idx}
              className="level-badge" 
              title={`${car.codigo}: ${car.nombre} (${car.codigo === 'STF' ? 'Reemplazo transitorio por licencia' : 'Vacante sin titular definitivo'})`} 
              style={{
                background: car.badgeBg || (car.codigo === 'STF' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.15)'), 
                color: car.badgeColor || (car.codigo === 'STF' ? '#38bdf8' : '#a855f7'), 
                border: `1px solid ${car.badgeColor || '#38bdf8'}55`, 
                fontWeight: 800,
                letterSpacing: '0.04em'
              }}
            >
              {car.codigo} · {car.nombre.replace('Suplente ', '')}
            </span>
          ))}

          {isPinned && (
            <span 
              className="level-badge" 
              style={{
                background: 'rgba(245, 158, 11, 0.18)',
                color: '#f59e0b',
                border: '1.5px solid rgba(245, 158, 11, 0.5)',
                fontWeight: 900,
                letterSpacing: '0.04em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              📌 FIJADO AL TOPE
            </span>
          )}

          {isSeen && (
            <span 
              className="level-badge" 
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                fontWeight: 800,
                letterSpacing: '0.03em',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              ✓ VISTO
            </span>
          )}
        </div>

        <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
          {onToggleSeen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSeen();
              }}
              title={isSeen ? "Marcar como NO visto / No leído" : "Marcar concurso como VISTO"}
              style={{
                background: isSeen ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: isSeen ? '1.5px solid #10b981' : '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                color: isSeen ? '#34d399' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.2rem 0.45rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.68rem',
                fontWeight: 700,
                transition: 'all 0.2s ease'
              }}
              className="seen-btn"
            >
              {isSeen ? <CheckSquare size={13} color="#34d399" /> : <Square size={13} />}
              <span>{isSeen ? 'Visto' : 'Visto?'}</span>
            </button>
          )}

          {onTogglePin && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin();
              }}
              title={isPinned ? "Desfijar de la cima de la pantalla" : "Fijar al inicio de la pantalla"}
              style={{
                background: isPinned ? 'rgba(245, 158, 11, 0.2)' : 'none',
                border: isPinned ? '1px solid rgba(245, 158, 11, 0.5)' : 'none',
                borderRadius: '6px',
                color: isPinned ? '#f59e0b' : 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.25rem',
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.2s ease'
              }}
              className="pin-btn"
            >
              <Pin size={17} fill={isPinned ? '#f59e0b' : 'none'} style={{ transform: isPinned ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
          )}

          <button 
            onClick={onHide} 
            title="Ocultar de la lista"
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center'
            }}
            className="hide-btn"
          >
            <EyeOff size={18} />
          </button>
        </div>
      </div>

      {/* School Name Label */}
      {concurso.schoolName && (
        <div style={{
          fontSize: '0.82rem',
          fontWeight: 700,
          color: isOpportunity ? '#fbbf24' : concurso.isAdminMatch ? '#ffffff' : '#38bdf8',
          margin: '0.35rem 0 0.15rem 0',
          display: 'flex',
          alignItems: 'center',
          gap: '5px'
        }}>
          <span>🏫</span>
          <span>{concurso.schoolName}</span>
        </div>
      )}

      <h3 className="card-title" style={{
        fontSize: '1rem', 
        lineHeight: 1.3, 
        margin: '0.2rem 0 0.5rem 0',
        color: '#f1f5f9',
        fontWeight: 600
      }}>
        {concurso.title}
      </h3>

      <div className="card-details" style={{ fontSize: '0.75rem', gap: '8px', flexWrap: 'wrap' }}>
        {/* Date format display */}
        <div className="detail-row" title="Fecha Programada" style={{ gap: '4px' }}>
          <CalendarDays size={14} style={{ flexShrink: 0 }} />
          <span>{targetDate ? targetDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' }) : 'Fecha a confirmar'}</span>
        </div>
        <div className="detail-row" title="Departamento" style={{ gap: '4px' }}>
           <MapPin size={14} style={{ flexShrink: 0 }} /> <span>{concurso.department?.replace('(Dpto)', '').trim()}</span>
        </div>
        {concurso.detectedAt && (
          <div className="detail-row" title="Fecha y hora en que el robot detectó la publicación en la web" style={{ gap: '4px', color: '#94a3b8' }}>
            <Clock size={14} style={{ flexShrink: 0 }} />
            <span>Detectado: {new Date(concurso.detectedAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} hs</span>
          </div>
        )}
      </div>

      {/* Sección Destacada de Materias y Horas a Concursar */}
      {(resolvedPlazas.length > 0 || concurso.materiasSummary || concurso.distinctSubject) && (
        <div style={{
          margin: '0.45rem 0',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          padding: '0.45rem 0.6rem'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.35rem',
            fontSize: '0.72rem'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: '#38bdf8' }}>
              <BookOpen size={13} />
              Materias a Concursar {resolvedPlazas.length > 0 ? `(${resolvedPlazas.length} ${resolvedPlazas.length === 1 ? 'plaza' : 'plazas'})` : ''}
            </span>
            {(concurso.totalHoras > 0 || resolvedPlazas.some(p => p.horas)) && (
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: '#34d399',
                background: 'rgba(52, 211, 153, 0.12)',
                padding: '0.15rem 0.4rem',
                borderRadius: '4px',
                border: '1px solid rgba(52, 211, 153, 0.25)'
              }}>
                {concurso.totalHoras || resolvedPlazas.reduce((acc, p) => acc + (p.horas || 0), 0)} hs totales
              </span>
            )}
          </div>

          {resolvedPlazas.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {(showAllPlazas ? resolvedPlazas : resolvedPlazas.slice(0, 2)).map((p, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(0, 0, 0, 0.25)',
                  padding: '0.35rem 0.5rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  fontSize: '0.75rem',
                  gap: '6px'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#f1f5f9', wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.25 }}>
                      {p.materia || concurso.distinctSubject || 'Materia a concursar'}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '1px' }}>
                      {p.plazas && p.plazas.length > 0 && <span>Plaza {p.plazas.join(', ')}</span>}
                      {p.curso && <span>· {p.curso}</span>}
                      {p.turno && <span>· {p.turno}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                    {p.horas && (
                      <span style={{
                        fontWeight: 700,
                        color: '#38bdf8',
                        background: 'rgba(56, 189, 248, 0.12)',
                        padding: '0.15rem 0.35rem',
                        borderRadius: '4px',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        fontSize: '0.7rem'
                      }}>
                        {p.horas} hs
                      </span>
                    )}
                    {p.caracter && (
                      <span style={{
                        fontWeight: 700,
                        color: p.caracter === 'STF' ? '#38bdf8' : '#a855f7',
                        background: p.caracter === 'STF' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(168, 85, 247, 0.12)',
                        padding: '0.15rem 0.35rem',
                        borderRadius: '4px',
                        fontSize: '0.65rem'
                      }}>
                        {p.caracter}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {resolvedPlazas.length > 2 && (
                <button
                  onClick={() => setShowAllPlazas(!showAllPlazas)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#93c5fd',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '0.2rem 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '2px'
                  }}
                >
                  {showAllPlazas ? 'Mostrar menos' : `+ ${resolvedPlazas.length - 2} plazas más...`}
                </button>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 500 }}>
              {concurso.materiasSummary || concurso.distinctSubject}
            </div>
          )}
        </div>
      )}

      {/* Full Content Toggle */}
      {concurso.fullContent && (
        <div style={{margin: '0.25rem 0'}}>
          <button 
            onClick={() => setShowDetails(!showDetails)}
            style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', 
              color: 'var(--text-muted)', borderRadius: '6px',
              fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
              padding: '0.3rem 0.6rem', width: '100%',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px'
            }}
          >
            <span>{showDetails ? 'Ocultar' : 'Detalles'}</span>
            <ExternalLink size={12} />
          </button>
          
          {showDetails && (
            <div className="full-content-container" style={{
              marginTop: '0.75rem', position: 'relative'
            }}>
              {resolvedPlazas.length > 0 && (
                <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', marginBottom: '2px' }}>
                    Desglose de Plazas y Horarios ({resolvedPlazas.length}):
                  </div>
                  {resolvedPlazas.map((p, idx) => (
                    <div key={idx} style={{
                      background: 'rgba(255,255,255,0.04)',
                      padding: '0.4rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      border: '1px solid rgba(255,255,255,0.06)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#f8fafc' }}>
                        <span>{p.materia || 'Materia a concursar'}</span>
                        <span style={{ color: '#38bdf8' }}>{p.horas ? `${p.horas} hs` : ''} {p.caracter ? `(${p.caracter})` : ''}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                        {p.plazas && p.plazas.length > 0 && <span>Plaza: {p.plazas.join(', ')} · </span>}
                        {p.curso && <span>Curso: {p.curso} · </span>}
                        {p.turno && <span>Turno: {p.turno} · </span>}
                        {p.schedule && <span>Horario: {p.schedule}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{
                padding: '1rem', 
                background: 'rgba(0,0,0,0.3)', borderRadius: '8px', 
                fontSize: '0.8125rem', color: 'rgba(255,255,255,0.85)',
                maxHeight: '300px', overflowY: 'auto', whiteSpace: 'pre-wrap',
                border: '1px solid rgba(255,255,255,0.05)',
                lineHeight: '1.6', fontFamily: 'monospace'
              }}>
                {cleanText(concurso.fullContent)}
              </div>

              <button 
                onClick={handleCopyText}
                style={{
                  position: 'absolute', top: '0.5rem', right: '0.5rem',
                  background: copied ? '#059669' : 'rgba(255,255,255,0.1)', 
                  border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem',
                  color: 'white', fontSize: '0.7rem', cursor: 'pointer',
                  transition: 'background 0.2s', zIndex: 5
                }}
              >
                {copied ? '¡Copiado!' : 'Copiar'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className={`countdown-timer ${isUrgent ? 'urgent' : ''}`}>
        <div className="countdown-header-row">
          <div className="detail-row" style={{ color: 'var(--text-main)', fontSize: '0.85rem' }}>
            <Clock size={15} />
            <span style={{ fontWeight: 700, color: themeColor }}>
              {!timeLeft ? 'Fecha a confirmar' : isActive ? 'Concurso Activo' : 'Concurso Realizado'}
            </span>
          </div>
          
          {timeLeft && !timeLeft.isExpired && (
            <div className="time-blocks">
              {timeLeft.days > 0 && (
                <>
                  <div className="time-block">
                    <span className="time-value">{String(timeLeft.days).padStart(2, '0')}</span>
                    <span className="time-label">DÍAS</span>
                  </div>
                  <div className="time-block">
                    <span className="time-value" style={{opacity: 0.5}}>:</span>
                  </div>
                </>
              )}
              <div className="time-block">
                <span className="time-value">{String(timeLeft.hours).padStart(2, '0')}</span>
                <span className="time-label">HRS</span>
              </div>
              <div className="time-block">
                <span className="time-value" style={{opacity: 0.5}}>:</span>
              </div>
              <div className="time-block">
                <span className="time-value">{String(timeLeft.minutes).padStart(2, '0')}</span>
                <span className="time-label">MIN</span>
              </div>
              <div className="time-block">
                <span className="time-value" style={{opacity: 0.5}}>:</span>
              </div>
              <div className="time-block">
                <span className="time-value" style={{opacity: 0.8}}>{String(timeLeft.seconds).padStart(2, '0')}</span>
                <span className="time-label">SEG</span>
              </div>
            </div>
          )}
        </div>

        {isPast && !forceExpired && (
          <div style={{fontSize: '0.78rem', color: '#34d399', fontWeight: 600}}>
            ✓ Llevado a cabo {targetDate ? `el ${targetDate.toLocaleDateString('es-AR', {day: '2-digit', month: '2-digit'})} (${targetDate.toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'})} hs)` : ''}
          </div>
        )}

        {concurso.llamadosSummary && (
          <div style={{fontSize: '0.74rem', color: '#f1f5f9', background: 'rgba(255,255,255,0.06)', padding: '0.35rem 0.55rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)', wordBreak: 'break-word', width: '100%', boxSizing: 'border-box'}}>
            <strong style={{color: '#fbbf24'}}>Convocatoria: </strong>{concurso.llamadosSummary}
          </div>
        )}

        {resolvedCaracteres.length > 0 && (
          <div style={{fontSize: '0.72rem', color: '#94a3b8', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px'}}>
            <strong style={{color: '#cbd5e1'}}>Designación:</strong>
            {resolvedCaracteres.map(c => `${c.codigo} (${c.nombre})`).join(' · ')}
          </div>
        )}
        
        {!timeLeft && !isExpired && (
           <div style={{fontSize: '0.72rem', color: 'var(--text-muted)'}}>
             Consultar detalle para horario exacto
           </div>
        )}
        
        {/* Distance Button / Result */}
        {!isExpired && (
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.2rem'}}>
                {distance ? (
                    <span style={{fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primario)', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px'}}>
                        <Route size={14} /> {distance}
                    </span>
                ) : distanceError ? (
                    <span style={{fontSize: '0.72rem', color: '#ef4444'}}>{distanceError}</span>
                ) : (
                    <button 
                        onClick={handleFetchDistance}
                        disabled={loadingDistance || !userLocation}
                        style={{
                            fontSize: '0.72rem', padding: '0.25rem 0.55rem', borderRadius: '6px',
                            background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-light)',
                            color: 'var(--text-main)', cursor: (loadingDistance || !userLocation) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.35rem', opacity: (!userLocation) ? 0.6 : 1
                        }}
                        title={!userLocation ? "Esperando ubicación..." : "Calcular distancia aproximada"}
                    >
                        <MapIcon size={13} className={loadingDistance ? 'spinner' : ''} style={loadingDistance ? {marginBottom: 0, width: 13, height: 13, border: 'none'} : {}} /> 
                        {loadingDistance ? 'Calculando...' : 'Ver Distancia'}
                    </button>
                )}
            </div>
        )}
      </div>

      <div className="card-actions" style={{display: 'flex', gap: '6px', flexWrap: 'wrap', width: '100%'}}>
        <a 
          href={`https://www.google.com/maps/dir/?api=1&origin=${userLocation ? `${userLocation.lat},${userLocation.lng}` : ''}&destination=${encodeURIComponent(mapQuery)}`}
          target="_blank" 
          rel="noopener noreferrer" 
          className="btn-primary"
          style={{flex: 1, backgroundColor: 'rgba(52, 211, 153, 0.1)', color: '#34d399', fontSize: '0.75rem', padding: '0.5rem'}}
          title="Abrir ruta en Google Maps"
        >
          <span style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'}}>
            <MapIcon size={14} /> Mapa
          </span>
        </a>
        <a 
          href={concurso.link ? (concurso.link.startsWith('http') ? concurso.link : `https://${concurso.link}`) : '#'} 
          target={concurso.link ? "_blank" : "_self"}
          rel="noopener noreferrer" 
          className="btn-primary"
          style={{
            flex: 2,
            opacity: concurso.link ? 1 : 0.4,
            cursor: concurso.link ? 'pointer' : 'not-allowed',
            pointerEvents: concurso.link ? 'auto' : 'none',
            fontSize: '0.75rem',
            padding: '0.5rem'
          }}
        >
          <span style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'}}>
            Ver Concurso <ExternalLink size={14} />
          </span>
        </a>
      </div>
    </div>
  );
}
