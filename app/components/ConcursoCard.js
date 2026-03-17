'use client';

import { useState, useEffect } from 'react';
import { differenceInSeconds, parseISO } from 'date-fns';
import { Clock, CalendarDays, ExternalLink, MapPin, EyeOff, Map as MapIcon, Route } from 'lucide-react';

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

export default function ConcursoCard({ concurso, onHide, userLocation }) {
  const [timeLeft, setTimeLeft] = useState(null);
  
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
  const isExpired = timeLeft?.isExpired || false;

  const handleCopyText = () => {
    if (concurso.fullContent) {
      navigator.clipboard.writeText(concurso.fullContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Replaced: if (!timeLeft) return null; 
  // We want to render the card even if timeLeft is null (e.g. no date)

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
    <div className={`glass-panel concurso-card ${isExpired ? 'expired' : ''}`} data-level={concurso.nivel}>
      {/* Decorative top bar */}
      <div className="concurso-level-bar"></div>

      <div className="card-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <span className="level-badge">{concurso.nivel}</span>
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

      <h3 className="card-title">{concurso.title}</h3>

      <div className="card-details">
        {/* Date format display */}
        <div className="detail-row" title="Fecha Programada">
          <CalendarDays size={16} />
          <span>{targetDate ? targetDate.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit' }) : 'Fecha por confirmar'}</span>
        </div>
        <div className="detail-row" title="Departamento">
           <MapPin size={16} /> <span>{concurso.department}</span>
        </div>
      </div>

      {/* New: Subjects and Plazas info */}
      {(concurso.materias?.length > 0 || concurso.plazas?.length > 0) && (
        <div className="extra-info-panel" style={{
            margin: '0.75rem 0', padding: '0.75rem', 
            background: 'rgba(255,255,255,0.03)', borderRadius: '8px', 
            border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8125rem'
        }}>
          {concurso.materias?.length > 0 && (
            <div style={{marginBottom: concurso.plazas?.length > 0 ? '0.75rem' : '0'}}>
              <span style={{color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.25rem', fontSize: '0.7rem', textTransform: 'uppercase'}}>Materias:</span>
              <div style={{color: 'var(--color-primario)', fontWeight: 500, lineHeight: 1.4}}>
                {concurso.materias.join(', ')}
              </div>
            </div>
          )}
          {concurso.plazas?.length > 0 && (
            <div>
              <span style={{color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.25rem', fontSize: '0.7rem', textTransform: 'uppercase'}}>Plazas / Cargos:</span>
              <div style={{color: '#60a5fa', fontWeight: 500, lineHeight: 1.4}}>
                {concurso.plazas.join(', ')}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Content Toggle */}
      {concurso.fullContent && (
        <div style={{margin: '0.5rem 0'}}>
          <button 
            onClick={() => setShowDetails(!showDetails)}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', 
              color: 'var(--text-main)', borderRadius: '6px',
              fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
              padding: '0.4rem 0.75rem', width: '100%',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}
          >
            <span>{showDetails ? 'Ocultar descripción' : 'Ver descripción completa'}</span>
            <ExternalLink size={14} style={{opacity: 0.6}} />
          </button>
          
          {showDetails && (
            <div className="full-content-container" style={{
              marginTop: '0.75rem', position: 'relative'
            }}>
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
        <div className="detail-row" style={{ color: 'var(--text-main)', fontSize: '0.875rem' }}>
          <Clock size={16} />
            <span style={{ fontWeight: 500 }}>
            {!timeLeft ? 'Fecha a confirmar' : timeLeft.isExpired ? 'Finalizado / En curso' : 'Faltan:'}
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
        
        {!timeLeft && !isExpired && (
           <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem'}}>
             Consultar detalle para horario exacto
           </div>
        )}
        
        {/* Distance Button / Result directly besides timer */}
        {!isExpired && (
            <div style={{marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                {distance ? (
                    <span style={{fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-primario)', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px'}}>
                        <Route size={14} /> {distance}
                    </span>
                ) : distanceError ? (
                    <span style={{fontSize: '0.75rem', color: '#ef4444'}}>{distanceError}</span>
                ) : (
                    <button 
                        onClick={handleFetchDistance}
                        disabled={loadingDistance || !userLocation}
                        style={{
                            fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '4px',
                            background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border-light)',
                            color: 'var(--text-main)', cursor: (loadingDistance || !userLocation) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.25rem', opacity: (!userLocation) ? 0.5 : 1
                        }}
                        title={!userLocation ? "Esperando ubicación..." : "Calcular distancia aproximada"}
                    >
                        <MapIcon size={14} className={loadingDistance ? 'spinner' : ''} style={loadingDistance ? {marginBottom: 0, width: 14, height: 14, border: 'none'} : {}} /> 
                        {loadingDistance ? 'Calculando...' : 'Ver Distancia'}
                    </button>
                )}
            </div>
        )}
      </div>

      <div className="card-actions" style={{display: 'flex', gap: '0.5rem'}}>
        <a 
          href={`https://www.google.com/maps/dir/?api=1&origin=${userLocation ? `${userLocation.lat},${userLocation.lng}` : ''}&destination=${encodeURIComponent(mapQuery)}`}
          target="_blank" 
          rel="noopener noreferrer" 
          className="btn-primary"
          style={{flex: 1, backgroundColor: '#34d399', color: '#064e3b'}}
          title="Abrir ruta en Google Maps"
        >
          <span style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'}}>
            <MapIcon size={16} /> Mapa
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
            pointerEvents: concurso.link ? 'auto' : 'none'
          }}
        >
          <span style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'}}>
            Ver Concurso <ExternalLink size={16} />
          </span>
        </a>
      </div>
    </div>
  );
}
