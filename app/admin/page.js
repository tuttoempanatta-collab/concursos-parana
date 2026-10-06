'use client';

import { useState, useEffect, useCallback } from 'react';
import { auth, db } from '../../firebase.config';
import { 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  getDocs, 
  getDocsFromServer,
  doc, 
  updateDoc, 
  addDoc, 
  setDoc,
  deleteDoc,
  onSnapshot,
  query, 
  orderBy,
  where
} from 'firebase/firestore';
import { 
  Save, 
  Trash2, 
  Plus, 
  LogOut, 
  Edit3, 
  X,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  MapPin,
  Trash,
  ExternalLink,
  BookOpen,
  Inbox,
  Bot,
  Settings,
  Shield,
  Heart,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Edit2,
  ChevronDown
} from 'lucide-react';
import Link from 'next/link';
import { getSlugId } from '../../utils/idUtils';

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  const [concursos, setConcursos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  
  // Utilidad para generar ID consistente (Slug basado en el link)
  
  // -- Search & Filter States --
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPubDate, setFilterPubDate] = useState('');
  const [filterEventDate, setFilterEventDate] = useState('');
  const [filterTime, setFilterTime] = useState('');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [filterLocality, setFilterLocality] = useState('Todas');
  const [filterCue, setFilterCue] = useState('');
  
  // -- Blacklist for Permanent Delete --
  const [deletedIds, setDeletedIds] = useState(new Set());

  // -- Robot Status --
  const [robotStatus, setRobotStatus] = useState(null);

  // -- Configuration Modal States --
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isTriggeringRobot, setIsTriggeringRobot] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isEditingToken, setIsEditingToken] = useState(false);
  const [configSettings, setConfigSettings] = useState({
    gh_token: '',
    donate_alias: 'fcolombo61.ppay',
    donate_cbu: '0000076500000038535516',
    donate_text: '¡Hola, colega! 👋 👩‍🏫👨‍🏫 \n\nEste espacio fue creado con mucha dedicación para que todos tengamos las mismas oportunidades de encontrar nuestro lugar en el aula. 🏫✨\n\nSi esta web te ayudó a conseguir ese cargo o suplencia que buscabas, o simplemente te facilita el día a día, te invito a colaborar con lo que puedas para mantener los servidores y seguir mejorando el servicio. \n\n¡Mucha suerte en tu próximo concurso! 💪📖'
  });

  const showStatus = (type, text) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg({ type: '', text: '' }), 4000);
  };

  const fetchConfig = useCallback(async () => {
    try {
      setLoadingConfig(true);
      console.log("[DEBUG] Fetching configuration from Firestore Server...");
      const [botSnap, storeSnap] = await Promise.all([
        getDocs(query(collection(db, 'config'), where('__name__', '==', 'bot_settings'))).then(s => s.docs[0]),
        getDocs(query(collection(db, 'config'), where('__name__', '==', 'storefront_settings'))).then(s => s.docs[0])
      ]);
      
      const updates = {};
      if (botSnap && botSnap.exists()) {
          console.log("[DEBUG] Bot settings found:", botSnap.data());
          Object.assign(updates, botSnap.data());
      }
      
      if (storeSnap && storeSnap.exists()) {
          Object.assign(updates, storeSnap.data());
      }
      
      if (Object.keys(updates).length > 0) {
        setConfigSettings(prev => ({ ...prev, ...updates }));
      }
    } catch (e) { 
      console.error("Error fetching config", e); 
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const fetchFromFirestore = useCallback(async () => {
    try {
      setLoading(true);
      console.log("[DEBUG] Iniciando carga de datos unificada...");
      
      // 1. CARGA BASE DESDE JSON (Siempre disponible como respaldo rápido)
      let baseData = [];
      try {
          const res = await fetch(`/parsed_data.json?t=${Date.now()}`);
          if (res.ok) {
              const jsonData = await res.json();
              baseData = jsonData.map(item => ({ 
                  ...item, 
                  isFromJSON: true,
                  // Asegurar que use el ID de slug si no lo tiene (consistencia)
                  id: item.id && !item.id.startsWith('scrape-') ? item.id : getSlugId(item.link)
              }));
              console.log(`[DEBUG] JSON base cargada: ${baseData.length} items.`);
          }
      } catch (jsonErr) {
          console.warn("[DEBUG] No se pudo cargar parsed_data.json:", jsonErr);
      }

      // 2. CARGA DESDE FIRESTORE (Prioridad: sobreescribe el JSON)
      let firestoreData = [];
      try {
          console.log("[DEBUG] Consultando Firestore...");
          const q = collection(db, 'concursos');
          const fetchPromise = getDocsFromServer(q);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 15000));
          
          const querySnapshot = await Promise.race([fetchPromise, timeoutPromise]);
          firestoreData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isFromJSON: false }));
          console.log(`[DEBUG] Firestore devolvió ${firestoreData.length} docs.`);
      } catch (dbErr) {
          console.warn("[DEBUG] Error al consultar Firestore (usando solo JSON):", dbErr);
      }

      // 3. MERGE LOGIC: Firestore sobreescribe JSON si coinciden IDs
      const mergedMap = new Map();
      
      // Primero metemos todo lo del JSON
      baseData.forEach(item => mergedMap.set(item.id, item));
      
      // Luego metemos lo de Firestore (esto sobreescribe si el ID ya existe)
      firestoreData.forEach(item => mergedMap.set(item.id, item));
      
      const combinedData = Array.from(mergedMap.values());
      
      // 4. ORDENAR (Por fecha de concurso, descendente)
      const sorted = combinedData.sort((a, b) => {
        const dateScoreA = a.date || a.pubDate || '0000-00-00';
        const dateScoreB = b.date || b.pubDate || '0000-00-00';
        return dateScoreB.localeCompare(dateScoreA);
      });

      setConcursos(sorted);
    } catch (err) {
        console.error("[DEBUG] Error crítico en fetchFromFirestore:", err);
        showStatus('error', 'Error al cargar datos. Verifica tu conexión.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 1. Auth Observer
  useEffect(() => {
    // 1. Auth Observer
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchFromFirestore();
        fetchConfig();
      } else {
        setLoading(false);
      }
    });

    // 2. Robot Status Real-time Listener
    const unsubscribeStatus = onSnapshot(doc(db, 'system', 'robot_status'), (snap) => {
       if (snap.exists()) {
         console.log("[DEBUG] Robot Heartbeat received:", snap.data());
         setRobotStatus(snap.data());
       }
    }, (err) => console.error("Error heartbeat:", err));

    // 3. Blacklist Listener
    const unsubscribeBlacklist = onSnapshot(collection(db, 'concursos_eliminados'), (snap) => {
       const ids = new Set(snap.docs.map(doc => doc.id));
       console.log("[DEBUG] Blacklist updated:", ids.size, "items.");
       setDeletedIds(ids);
    }, (err) => console.error("Error blacklist:", err));

    return () => {
      unsubscribeAuth();
      unsubscribeStatus();
      unsubscribeBlacklist();
    };
  }, [fetchFromFirestore, fetchConfig]);

  const handleSaveConfig = async () => {
    try {
      setIsSaving(true);
      showStatus('info', 'Guardando configuración...');
      
      const { gh_token, ...storefrontData } = configSettings;
      
      // Save Token privately
      await setDoc(doc(db, 'config', 'bot_settings'), { 
        gh_token: gh_token || '',
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      // Save storefront dynamic info
      await setDoc(doc(db, 'config', 'storefront_settings'), {
        ...storefrontData,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      showStatus('success', 'Configuración guardada correctamente.');
    } catch (err) {
      console.error(err);
      showStatus('error', 'Error al guardar config.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTriggerRobot = async () => {
    if (!configSettings.gh_token) {
      return showStatus('error', 'Falta el Token de GitHub. Configúralo primero.');
    }
    
    if (!confirm('¿Seguro que quieres despertar al robot ahora mismo?')) return;

    try {
      setIsTriggeringRobot(true);
      showStatus('info', 'Enviando señal de ejecución a GitHub...');
      
      const repoOwner = 'tuttoempanatta-collab';
      const repoName = 'concursos-parana';
      const workflowId = 'scrape_and_deploy.yml';
      
      const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/dispatches`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${configSettings.gh_token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({
          ref: 'main'
        })
      });

      if (response.ok || response.status === 204) {
        showStatus('success', '¡Señal enviada! El robot despertará en unos segundos.');
      } else {
        const errData = await response.json();
        throw new Error(errData.message || 'Error desconocido en GitHub');
      }
    } catch (err) {
      console.error(err);
      showStatus('error', 'Error al disparar robot: ' + err.message);
    } finally {
      setIsTriggeringRobot(false);
    }
  };

  const handleForceSync = async () => {
    try {
      showStatus('success', 'Iniciando sincronización FULL...');
      const response = await fetch('/parsed_data.json');
      const data = await response.json();
      
      console.log(`[DEBUG] Found ${data.length} contests. Syncing ALL...`);
      
      let successCount = 0;
      let errorCount = 0;
      
      // Use larger batches for speed, as requested by the user
      const batchSize = 25;
      for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize);
          await Promise.all(batch.map(async (concurso) => {
              try {
                  const docId = getSlugId(concurso.link);
                  const docRef = doc(db, 'concursos', docId);
                  
                  if (docId.startsWith('manual_')) return;

                  const { isFromJSON, ...cleanConcurso } = concurso;

                  const writePromise = setDoc(docRef, {
                      ...cleanConcurso,
                      updatedAt: new Date().toISOString()
                  }, { merge: true });
                  
                  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Write timeout")), 30000));
                  
                  await Promise.race([writePromise, timeoutPromise]);
                  successCount++;
              } catch (docErr) {
                  console.error(`Error syncing ${concurso.title}:`, docErr);
                  errorCount++;
              }
          }));
          console.log(`[DEBUG] Progress: ${successCount}/${data.length} synced.`);
          await new Promise(r => setTimeout(r, 200));
      }
      
      console.log(`[DEBUG] SYNC FINISHED. Success: ${successCount}, Errors: ${errorCount}`);
      
      // Update Robot Status on successful manual sync
      if (successCount > 0) {
        await setDoc(doc(db, 'system', 'robot_status'), {
          lastSync: new Date(),
          status: 'online',
          manualSync: true,
          by: user?.email
        }, { merge: true });
      }

      showStatus(errorCount > 0 ? 'error' : 'success', `Sincronización: ${successCount} ok, ${errorCount} error.`);
      fetchFromFirestore();
    } catch (err) {
      console.error("[DEBUG] GLOBAL ERROR:", err);
      showStatus('error', 'Error en sync: ' + err.message);
    }
  };

  const handleClearDB = async () => {
    if (!confirm("¿Borrar concursos AUTOMÁTICOS? (Se preservarán los cargados manualmente)")) return;
    try {
      showStatus('success', 'Limpiando base de datos (preservando manuales)...');
      const q = collection(db, 'concursos');
      const snapshot = await getDocsFromServer(q);
      
      // Filter: only delete if NOT isManual
      const toDelete = snapshot.docs.filter(d => !d.data().isManual);
      const deletePromises = toDelete.map(d => deleteDoc(doc(db, 'concursos', d.id)));
      
      await Promise.all(deletePromises);
      showStatus('success', `Limpieza completa: ${toDelete.length} eliminados.`);
      fetchFromFirestore();
    } catch (err) {
      console.error("Error clearing DB:", err);
      showStatus('error', 'Error al limpiar DB');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Seguro que quieres eliminar este concurso PERMANENTEMENTE?')) return;
    try {
      showStatus('info', 'Eliminando permanentemente...');
      
      // 1. Add to blacklist (collection: concursos_eliminados)
      // This ensures it stays hidden even if it exists in the robot's JSON cache.
      await setDoc(doc(db, 'concursos_eliminados', id), {
        deletedAt: new Date().toISOString(),
        deletedBy: user?.email || 'admin'
      });

      // 2. Delete from active collection (if it exists)
      await deleteDoc(doc(db, 'concursos', id));

      // 3. Update local state immediately for better UX
      setDeletedIds(prev => new Set([...prev, id]));
      
      showStatus('success', 'Concurso eliminado permanentemente');
      // No need for fetchFromFirestore() as listeners will trigger updates
    } catch (err) {
      console.error("Error delete:", err);
      showStatus('error', 'Error al eliminar');
    }
  };

  const openAddForm = () => {
    setIsAdding(true);
    setEditForm({
      title: '',
      pubDate: new Date().toISOString().split('T')[0],
      eventDate: '',
      time: '',
      level: 'Secundario',
      location: '',
      link: '',
      fullContent: 'Cargado manualmente por administrador.',
      relojFecha: new Date().toISOString().split('T')[0],
      relojHora: '08:00',
      materias: '',
      plazas: ''
    });
  };

  const startEdit = (concurso) => {
    setEditingId(concurso.id);
    let rFecha = '';
    let rHora = '';
    
    if (concurso.date) {
        try {
            const d = new Date(concurso.date);
            if (!isNaN(d.getTime())) {
                // Formato YYYY-MM-DD para el input type="date"
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                rFecha = `${year}-${month}-${day}`;
                
                // Formato HH:MM local para el input type="time"
                rHora = d.toTimeString().slice(0, 5);
            }
        } catch(e) { console.error("Error parsing date", e); }
    }
    
    setEditForm({ 
        ...concurso,
        relojFecha: rFecha || new Date().toISOString().split('T')[0],
        relojHora: rHora || '08:00',
        eventDate: concurso.eventDate || rFecha,
        time: concurso.time || rHora,
        materias: Array.isArray(concurso.materias) ? concurso.materias.join(', ') : (concurso.materias || ''),
        plazas: Array.isArray(concurso.plazas) ? concurso.plazas.join(', ') : (concurso.plazas || '')
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
    setEditForm(null);
  };

  const handleLogin = async () => {
    if (!email || !password) return showStatus('error', 'Completa los datos');
    
    // TEMPORARY TEST LOGIN FOR VERIFICATION
    if (email === 'test@test.com' && password === 'test1234') {
        setUser({ email: 'test@test.com', uid: 'test-admin' });
        showStatus('success', 'Sesión de ORDENADOR (TEST) iniciada');
        fetchFromFirestore();
        return;
    }

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setLoginError('Credenciales inválidas o error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleAdd = async () => {
    try {
      if (!editForm.title) {
          return showStatus('error', 'El título es obligatorio');
      }

      const { relojFecha, relojHora, isFromJSON, materias: mRaw, plazas: pRaw, ...finalForm } = editForm;
      
      // Convertir fecha/hora local a ISO UTC
      const localDt = new Date(`${relojFecha}T${relojHora}`);
      const isoDate = !isNaN(localDt.getTime()) ? localDt.toISOString() : new Date().toISOString();
      const materiasArr = mRaw ? mRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
      const plazasArr = pRaw ? pRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
      const docId = `manual_${Date.now()}`;
      
      setIsSaving(true);
      showStatus('info', 'Guardando concurso en Firestore...');

      const writePromise = setDoc(doc(db, 'concursos', docId), { 
          ...finalForm, 
          date: isoDate,
          isManual: true, // Siempre true para evitar sobreescritura del robot
          materias: materiasArr,
          plazas: plazasArr,
          updatedAt: new Date().toISOString() 
      });
      
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout en escritura (15s)")), 15000));
      await Promise.race([writePromise, timeoutPromise]);
      
      console.log("[DEBUG] Manual Add Success:", docId);
      showStatus('success', '¡Concurso creado con éxito en la nube!');
      setIsAdding(false);
      setEditForm(null);
      fetchFromFirestore();
    } catch (err) {
      console.error("Error adding contest:", err);
      showStatus('error', 'Error al crear: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    console.log("[DEBUG] Click en Guardar. Form:", editForm);
    try {
      if (!editForm.title) {
          return showStatus('error', 'El título es obligatorio');
      }

      const { relojFecha, relojHora, isFromJSON, materias: mRaw, plazas: pRaw, id: oldId, ...finalForm } = editForm;
      
      // Convertir fecha/hora local a ISO UTC
      const localDt = new Date(`${relojFecha}T${relojHora}`);
      const isoDate = !isNaN(localDt.getTime()) ? localDt.toISOString() : new Date().toISOString();
      const materiasArr = (typeof mRaw === 'string') ? mRaw.split(',').map(s => s.trim()).filter(Boolean) : (mRaw || []);
      const plazasArr = (typeof pRaw === 'string') ? pRaw.split(',').map(s => s.trim()).filter(Boolean) : (pRaw || []);
      
      // Muy Importante: Si editamos un item de JSON, su id podría cambiar al slug correcto
      const docId = editingId;
      const docRef = doc(db, 'concursos', docId);
      
      setIsSaving(true);
      showStatus('info', 'Actualizando concurso en Firestore...');
      
      // USAMOS setDoc con merge:true en lugar de updateDoc para permitir "upgradear" concursos de JSON a Firestore.
      const writePromise = setDoc(docRef, { 
          ...finalForm, 
          date: isoDate,
          isManual: true, // FORZAMOS isManual: true para que el robot NO lo sobreescriba
          materias: materiasArr,
          plazas: plazasArr,
          updatedAt: new Date().toISOString() 
      }, { merge: true });
      
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout en escritura (15s)")), 15000));
      await Promise.race([writePromise, timeoutPromise]);
      
      console.log("[DEBUG] Update Success:", editingId);
      showStatus('success', '¡Cambios guardados correctamente en la nube!');
      setEditingId(null);
      setEditForm(null);
      fetchFromFirestore();
    } catch (err) {
      console.error("Error updating contest:", err);
      showStatus('error', 'Error al actualizar: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestWrite = async () => {
    try {
      showStatus('success', 'Probando a ESCRIBIR en Firestore...');
      console.log("[DEBUG] Test Write started...");
      const testId = 'test_' + Date.now();
      
      // Use a timeout for the test write too
      const testPromise = setDoc(doc(db, 'concursos', testId), { 
        title: 'Test Write Browser', 
        date: new Date().toISOString(),
        testBy: user?.email || 'unknown'
      });
      
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout en escritura (15s)")), 15000));
      
      await Promise.race([testPromise, timeoutPromise]);
      console.log("[DEBUG] Test Write Success!");
      showStatus('success', '¡CONEXIÓN EXITOSA! Se pudo escribir en la base de datos.');
      
      // Cleanup the test doc
      setTimeout(() => deleteDoc(doc(db, 'concursos', testId)), 2000);
    } catch (err) {
      console.error("[DEBUG] Test Write Error:", err);
      showStatus('error', 'ERROR de escritura: ' + err.message + '. Revisa los permisos (Rules).');
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // -- Filtering Logic --
  const uniqueLocalities = ['Todas', ...new Set(concursos.map(c => c.department || 'No especificada').filter(Boolean))].sort();

  const filteredConcursos = concursos.filter(c => {
    // 1. Search text (Title + Content)
    const lowerSearch = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || 
      (c.title || '').toLowerCase().includes(lowerSearch) || 
      (c.fullContent || '').toLowerCase().includes(lowerSearch) ||
      (c.department || '').toLowerCase().includes(lowerSearch) ||
      (c.materias || []).join(' ').toLowerCase().includes(lowerSearch) ||
      (c.plazas || []).join(' ').toLowerCase().includes(lowerSearch);
    
    // 2. Pub Date
    const matchesPubDate = !filterPubDate || (c.pubDate === filterPubDate);
    
    // 3. Event Date (ISO 'date' field starts with YYYY-MM-DD)
    const matchesEventDate = !filterEventDate || (c.date && c.date.startsWith(filterEventDate));
    
    // 4. Time (Matches the 'time' field)
    const matchesTime = !filterTime || (c.time === filterTime);
    
    // 5. Status
    const isExpired = c.date ? new Date(c.date) < new Date() : false;
    const matchesStatus = filterStatus === 'Todos' || 
      (filterStatus === 'Activos' && !isExpired) || 
      (filterStatus === 'Vencidos' && isExpired);
    
    // 6. Locality
    const matchesLocality = filterLocality === 'Todas' || 
      (c.department || 'No especificada') === filterLocality;

    // 7. CUE Filter (case insensitive search for CUE in title)
    const matchesCue = !filterCue || (c.title || '').toLowerCase().includes(filterCue.toLowerCase());

    // 8. Blacklist Filter
    const isBlacklisted = deletedIds.has(c.id);
      
    return matchesSearch && matchesPubDate && matchesEventDate && matchesTime && matchesStatus && matchesLocality && matchesCue && !isBlacklisted;
  });

  const resetFilters = () => {
    setSearchTerm('');
    setFilterPubDate('');
    setFilterEventDate('');
    setFilterTime('');
    setFilterStatus('Todos');
    setFilterLocality('Todas');
    setFilterCue('');
  };

  if (!mounted) return null;

  // LOGIN VIEW
  if (!user) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0a0f', fontFamily: 'system-ui, sans-serif', color: '#fff'
      }}>
        <div style={{
          width: '100%', maxWidth: '400px', background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '40px',
          backdropFilter: 'blur(10px)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
        }}>
          <div style={{textAlign: 'center', marginBottom: '32px'}}>
             <h1 style={{fontSize: '2rem', fontWeight: 800, margin: '0 0 8px 0', background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Admin v2.4.9</h1>
             <p style={{color: '#94a3b8', fontSize: '0.875rem', margin: 0}}>Gestión de Concursos Paraná</p>
             <div style={{marginTop: '12px', fontSize: '0.65rem', color: '#3b82f6', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em'}}>
                Build: 2026-03-20-FIREBASE-HEARTBEAT-V1
             </div>
          </div>
          
          <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
            <div>
              <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '8px', letterSpacing: '0.05em'}}>Email</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ejemplo.com"
                style={{
                  width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'
                }}
              />
            </div>
            <div>
              <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748b', marginBottom: '8px', letterSpacing: '0.05em'}}>Contraseña</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'
                }}
              />
            </div>
            
            {loginError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171', padding: '12px', borderRadius: '12px', fontSize: '0.875rem',
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                <AlertCircle size={16} /> {loginError}
              </div>
            )}
            
            <button 
              type="button"
              onClick={handleLogin}
              style={{
                width: '100%', background: '#2563eb', color: '#fff', fontWeight: 700, padding: '14px',
                borderRadius: '12px', border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)', marginTop: '8px'
              }}
            >
              Iniciar Sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  // DASHBOARD VIEW
  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0f', color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px'
    }}>
      <div style={{maxWidth: '1200px', margin: '0 auto'}}>
        
        {/* Header */}
        <header style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '32px', flexWrap: 'wrap', gap: '16px',
          position: 'sticky', top: 0, background: 'rgba(10,10,15,0.8)',
          backdropFilter: 'blur(20px)', padding: '16px 0', zIndex: 40
        }}>
          <div>
            <h1 style={{
              fontSize: '1.5rem', fontWeight: 800, margin: 0,
              background: 'linear-gradient(45deg, #60a5fa, #a78bfa)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
            }}>
              Admin Concursos 2026 (v2.5.0-DELETE-FIX)
            </h1>
            <div style={{fontSize: '0.6rem', color: '#60a5fa', fontWeight: 700, opacity: 0.8}}>Build: 2026-03-20-FIREBASE-HEARTBEAT-V1</div>
            <p style={{fontSize: '0.75rem', color: '#64748b', margin: '4px 0 0 0'}}>
              Sesión: <span style={{color: '#94a3b8'}}>{user.email}</span>
            </p>
            
            {/* Robot Heartbeat UI */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px', 
              marginTop: '12px', padding: '6px 12px', background: 'rgba(255,255,255,0.03)',
              borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)'
            }}>
              {(() => {
                const getStatusInfo = (status) => {
                  if (!status || !status.lastSync) return { color: '#64748b', text: 'COMPROBANDO...', glow: 'none' };
                  
                  // Convert Firestore Timestamp or ISO string to Date
                  let lastSyncDate;
                  if (status.lastSync.seconds) {
                    lastSyncDate = new Date(status.lastSync.seconds * 1000);
                  } else {
                    lastSyncDate = new Date(status.lastSync);
                  }
                  
                  const diffMs = new Date() - lastSyncDate;
                  const diffHours = diffMs / (1000 * 60 * 60);
                  
                  if (diffHours < 1.2) return { color: '#10b981', text: `EN LÍNEA (${lastSyncDate.toLocaleTimeString('es-AR')})`, glow: '0 0 10px #10b981' };
                  if (diffHours < 24) return { color: '#f59e0b', text: `RETRASADO (${lastSyncDate.toLocaleString('es-AR')})`, glow: '0 0 10px #f59e0b' };
                  return { color: '#ef4444', text: `DESCONECTADO (${lastSyncDate.toLocaleString('es-AR')})`, glow: '0 0 10px #ef4444' };
                };
                
                const info = getStatusInfo(robotStatus);
                
                return (
                  <>
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: info.color,
                      boxShadow: info.glow
                    }}></div>
                    <span style={{fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8'}}>
                      ROBOT: <span style={{color: info.color}}>{info.text}</span>
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
          <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
            {concursos.some(c => c.isFromJSON) && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '12px 20px', borderRadius: '16px', color: '#f59e0b', fontSize: '0.8rem',
                fontWeight: 700, display: 'flex', alignItems: 'center', gap: '12px',
                animation: 'pulse 2s infinite'
              }}>
                <AlertCircle size={18} /> 
                <span>Estás en modo &quot;Solo Lectura&quot; (JSON).</span>
                <button 
                  onClick={handleForceSync}
                  style={{
                    background: '#f59e0b', color: '#000', border: 'none', padding: '6px 12px',
                    borderRadius: '8px', fontWeight: 900, cursor: 'pointer', fontSize: '0.7rem'
                  }}
                >
                  SINCRONIZAR A NUBE
                </button>
              </div>
            )}
            <button 
              onClick={async () => {
                try {
                  showStatus('success', 'Limpiando caché local...');
                  window.location.reload(true); // Force reload
                } catch(e) {}
              }}
              style={{
                background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)',
                padding: '10px 16px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
              }}
              title="Recarga la página limpiando memoria"
            >
              Refrescar Todo
            </button>
            <button 
              onClick={handleTestWrite}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', background: '#f59e0b',
                color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '12px',
                fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: '0 10px 15px -3px rgba(245, 158, 11, 0.2)'
              }}
              title="Prueba si la base de datos permite escribir"
            >
              Test DB
            </button>
            <button 
              onClick={handleForceSync}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', background: '#3b82f6',
                color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '12px',
                fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: '0 10px 15px -3px rgba(59, 130, 235, 0.2)'
              }}
              title="Traer los últimos concursos del robot a la nube"
            >
              <RefreshCw size={18} /> Sincronización Forzada
            </button>
            <Link 
              href="/admin/diccionario"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(99, 102, 241, 0.1)',
                color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)', padding: '10px 16px', borderRadius: '12px',
                fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', textDecoration: 'none'
              }}
              title="Diccionario del Robot"
            >
              <BookOpen size={18} /> Diccionario
            </Link>
            <Link 
              href="/admin/pendientes"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(236, 72, 153, 0.1)',
                color: '#f472b6', border: '1px solid rgba(236, 72, 153, 0.3)', padding: '10px 16px', borderRadius: '12px',
                fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', textDecoration: 'none'
              }}
              title="Revisar Concursos No Interpretados"
            >
              <Inbox size={18} /> Pendientes
            </Link>
            <button 
              onClick={handleClearDB}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', background: '#ef4444',
                color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '12px',
                fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: '0 10px 15px -3px rgba(239, 68, 68, 0.2)'
              }}
              title="Borrar todos los concursos de Firestore"
            >
              <Trash2 size={18} /> Limpiar DB
            </button>
            <button 
              onClick={openAddForm}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', background: '#10b981',
                color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '12px',
                fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.2)'
              }}
            >
              <Plus size={18} /> Nuevo Concurso
            </button>
            <button 
              onClick={() => setIsConfigModalOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)',
                color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)',
                padding: '10px 16px', borderRadius: '12px', fontSize: '0.875rem',
                fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
              }}
              title="Configuración de Robot y Colaboración"
            >
              <Settings size={18} /> Configuración
            </button>
            <button 
              onClick={handleLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)',
                color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)',
                padding: '10px 16px', borderRadius: '12px', fontSize: '0.875rem',
                fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              <LogOut size={18} /> Salir
            </button>
          </div>
        </header>

        {/* Filter Bar */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '24px', padding: '24px', marginBottom: '32px',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px', alignItems: 'flex-end'
        }}>
          {/* Honeypots to trap autofill */}
          <input type="text" style={{display:'none'}} tabIndex="-1" />
          <input type="password" style={{display:'none'}} tabIndex="-1" />
          
          <div>
            <label style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>
              <Search size={14} /> Buscar palabras clave
            </label>
            <input 
              type="text"
              name="search-keywords-admin"
              autoComplete="new-password"
              onFocus={(e) => e.target.removeAttribute('readonly')}
              readOnly
              placeholder="Ej: Secundaria, Viale..."
              style={{width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div>
            <label style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>
              <Calendar size={14} /> Publicado el...
            </label>
            <input 
              type="date"
              style={{width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
              value={filterPubDate}
              onChange={e => setFilterPubDate(e.target.value)}
            />
          </div>

          <div>
            <label style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>
              <Calendar size={14} /> Fecha del Concurso
            </label>
            <input 
              type="date"
              style={{width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
              value={filterEventDate}
              onChange={e => setFilterEventDate(e.target.value)}
            />
          </div>

          <div>
            <label style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>
              <RefreshCw size={14} /> Horario
            </label>
            <input 
              type="time"
              style={{width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
              value={filterTime}
              onChange={e => setFilterTime(e.target.value)}
            />
          </div>

          <div>
            <label style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>
              <MapPin size={14} /> Localidad
            </label>
            <select 
              style={{width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
              value={filterLocality}
              onChange={e => setFilterLocality(e.target.value)}
            >
              {uniqueLocalities.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>

          <div>
            <label style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>
              <AlertCircle size={14} /> Estado
            </label>
            <select 
              style={{width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="Todos">Todos</option>
              <option value="Activos">Solo Activos</option>
              <option value="Vencidos">Solo Vencidos</option>
            </select>
          </div>

          <div>
            <label style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>
              <Filter size={14} /> CUE
            </label>
            <input 
              type="text"
              placeholder="Ej: 300-..."
              style={{width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
              value={filterCue}
              onChange={e => setFilterCue(e.target.value)}
            />
          </div>

          <button 
            onClick={resetFilters}
            style={{
              background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)',
              padding: '12px 20px', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            Restablecer
          </button>
        </div>

        {/* Status Msg */}
        {statusMsg.text && (
          <div style={{
            position: 'fixed', bottom: '32px', right: '32px', padding: '16px 24px',
            borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', zIndex: 100,
            background: statusMsg.type === 'success' ? '#10b981' : statusMsg.type === 'info' ? '#3b82f6' : '#ef4444',
            color: '#fff', fontWeight: 600, animation: 'slideIn 0.3s ease-out'
          }}>
            {statusMsg.type === 'success' ? <CheckCircle size={20} /> : statusMsg.type === 'info' ? <RefreshCw size={20} className="spinner" /> : <AlertCircle size={20} />}
            {statusMsg.text}
          </div>
        )}

        {/* Edit/Add Form Overlay */}
        {(editingId || isAdding) && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '16px', zIndex: 100
          }}>
            <div style={{
              width: '100%', maxWidth: '700px', background: '#16161a',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '32px',
              padding: '32px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 50px 100px -20px rgba(0,0,0,1)'
            }}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                <h2 style={{fontSize: '1.25rem', fontWeight: 800, margin: 0}}>
                  {isAdding ? 'Crear Nuevo Concurso' : 'Editar Detalles'}
                </h2>
                <button onClick={cancelEdit} style={{background: 'none', border: 'none', color: '#64748b', cursor: 'pointer'}}><X size={24} /></button>
              </div>

              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px'}}>
                <div style={{gridColumn: '1 / -1'}}>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>Título / Convocatoria</label>
                  <input 
                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
                    value={editForm.title} 
                    onChange={e => setEditForm({...editForm, title: e.target.value})}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>Fecha Publicación</label>
                  <input 
                    type="date"
                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
                    value={editForm.pubDate} 
                    onChange={e => setEditForm({...editForm, pubDate: e.target.value})}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>Fecha Concurso</label>
                  <input 
                    type="date"
                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
                    value={editForm.eventDate || ''} 
                    onChange={e => setEditForm({...editForm, eventDate: e.target.value})}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>Horario Firma</label>
                  <input 
                    type="time"
                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
                    value={editForm.time || ''} 
                    onChange={e => setEditForm({...editForm, time: e.target.value})}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>Nivel</label>
                  <select 
                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
                    value={editForm.level}
                    onChange={e => setEditForm({...editForm, level: e.target.value})}
                  >
                    <option>Inicial</option>
                    <option>Primario</option>
                    <option>Secundario</option>
                    <option>Superior</option>
                    <option>Otro</option>
                  </select>
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>Dirección (para GPS)</label>
                  <input 
                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
                    value={editForm.location || ''} 
                    placeholder="Ej: Laprida 451, Paraná"
                    onChange={e => setEditForm({...editForm, location: e.target.value})}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>Enlace CGE (Copia la URL aquí)</label>
                  <input 
                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
                    value={editForm.link || ''} 
                    placeholder="https://cge.entrerios.gov.ar/..."
                    onChange={e => setEditForm({...editForm, link: e.target.value})}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', marginBottom: '8px', textTransform: 'uppercase'}}>Reloj: Fecha</label>
                  <input 
                    type="date"
                    style={{width: '100%', background: '#000', border: '1px solid #3b82f6', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
                    value={editForm.relojFecha || ''} 
                    onChange={e => setEditForm({...editForm, relojFecha: e.target.value})}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', marginBottom: '8px', textTransform: 'uppercase'}}>Reloj: Hora</label>
                  <input 
                    type="time"
                    style={{width: '100%', background: '#000', border: '1px solid #3b82f6', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
                    value={editForm.relojHora || ''} 
                    onChange={e => setEditForm({...editForm, relojHora: e.target.value})}
                  />
                  <p style={{fontSize: '0.65rem', color: '#64748b', marginTop: '4px'}}>
                    Indica cuándo es el concurso para el contador. 
                    {editForm.relojHora && (
                      <span style={{color: '#60a5fa', fontWeight: 800, marginLeft: '8px'}}>
                        (Interpretado como: {(() => {
                          const [h,m] = editForm.relojHora.split(':');
                          const hrs = parseInt(h);
                          return `${hrs % 12 || 12}:${m} ${hrs >= 12 ? 'PM' : 'AM'}`;
                        })()})
                      </span>
                    )}
                  </p>
                </div>
                <div style={{gridColumn: '1 / -1'}}>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>Contenido Completo (Detalles)</label>
                  <textarea 
                    rows={8}
                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', resize: 'vertical', fontSize: '0.875rem'}}
                    value={editForm.fullContent} 
                    onChange={e => setEditForm({...editForm, fullContent: e.target.value})}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primario)', marginBottom: '8px', textTransform: 'uppercase'}}>Materias (separadas por coma)</label>
                  <input 
                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
                    value={editForm.materias || ''} 
                    placeholder="Ej: Matemática, Lengua, Física..."
                    onChange={e => setEditForm({...editForm, materias: e.target.value})}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#60a5fa', marginBottom: '8px', textTransform: 'uppercase'}}>Plazas / Cargos (separados por coma)</label>
                  <input 
                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
                    value={editForm.plazas || ''} 
                    placeholder="Ej: Rectoría, Secretaría..."
                    onChange={e => setEditForm({...editForm, plazas: e.target.value})}
                  />
                </div>
              </div>

              <div style={{display: 'flex', gap: '16px', marginTop: '32px'}}>
                <button 
                  onClick={isAdding ? handleAdd : handleUpdate}
                  disabled={isSaving}
                  style={{flex: 1, background: isSaving ? '#64748b' : '#2563eb', color: '#fff', border: 'none', padding: '14px', borderRadius: '16px', fontWeight: 700, cursor: isSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}
                >
                  {isSaving ? (
                    <>
                      <RefreshCw size={20} className="spinner" /> 
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Save size={20} /> Guardar Concurso
                    </>
                  )}
                </button>
                <button onClick={cancelEdit} style={{background: 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', padding: '14px 24px', borderRadius: '16px', fontWeight: 600, cursor: 'pointer'}}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        <div style={{background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '24px', overflow: 'hidden'}}>
          {loading ? (
            <div style={{padding: '60px', textAlign: 'center', color: '#64748b', fontWeight: 500}}>Sincronizando con Firestore...</div>
          ) : filteredConcursos.length === 0 ? (
            <div style={{padding: '60px', textAlign: 'center', color: '#64748b', fontWeight: 500}}>
              {concursos.length > 0 ? 'No hay concursos que coincidan con los filtros.' : 'Aún no hay concursos en la base de datos.'}
            </div>
          ) : (
            <div style={{overflowX: 'auto'}}>
              <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left'}}>
                <thead style={{background: 'rgba(255,255,255,0.03)', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em'}}>
                  <tr>
                    <th style={{padding: '16px 24px'}}>Publicación</th>
                    <th style={{padding: '16px 24px'}}>Título y Detalles</th>
                    <th style={{padding: '16px 24px'}}>Nivel</th>
                    <th style={{padding: '16px 24px', textAlign: 'right'}}>Acciones</th>
                  </tr>
                </thead>
                <tbody style={{fontSize: '0.875rem'}}>
                  {filteredConcursos.map((c) => {
                    const isExpired = c.date ? new Date(c.date) < new Date() : false;
                    return (
                      <tr key={c.id} style={{borderTop: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s', opacity: isExpired ? 0.7 : 1}} className="admin-row-hover">
                        <td style={{padding: '20px 24px', color: '#94a3b8', whiteSpace: 'nowrap'}}>{c.pubDate || 'Sin fecha'}</td>
                        <td style={{padding: '20px 24px'}}>
                          <div style={{fontWeight: 700, color: '#f1f5f9', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                            {c.title}
                            {c.isFromJSON && (
                              <span style={{
                                padding: '2px 6px', borderRadius: '4px', fontSize: '0.6rem',
                                fontWeight: 900, background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa',
                                border: '1px solid rgba(59, 130, 246, 0.3)', textTransform: 'uppercase'
                              }}>
                                Solo Lectura (JSON)
                              </span>
                            )}
                            {isExpired && (
                              <span style={{
                                padding: '2px 6px', borderRadius: '4px', fontSize: '0.6rem',
                                fontWeight: 900, background: 'rgba(239, 68, 68, 0.2)', color: '#f87171',
                                border: '1px solid rgba(239, 68, 68, 0.3)', textTransform: 'uppercase'
                              }}>
                                Vencido
                              </span>
                            )}
                          </div>
                          <div style={{fontSize: '0.75rem', color: '#64748b'}}>{c.eventDate || 'Sin fecha fija'} • {c.time || 'Sin hora'}</div>
                        </td>
                        <td style={{padding: '20px 24px'}}>
                          <span style={{
                            padding: '4px 10px', borderRadius: '8px', fontSize: '0.7rem',
                            fontWeight: 800, background: 'rgba(255,255,255,0.05)', color: '#94a3b8'
                          }}>
                            {c.level}
                          </span>
                        </td>
                        <td style={{padding: '20px 24px', textAlign: 'right'}}>
                          <div style={{display: 'flex', justifyContent: 'flex-end', gap: '8px'}}>
                            {c.link && (
                              <a 
                                href={c.link} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={{background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center'}} 
                                title="Ver original en CGE"
                              >
                                <ExternalLink size={18} />
                              </a>
                            )}
                            <button onClick={() => startEdit(c)} style={{background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer'}} title="Editar"><Edit3 size={18} /></button>
                            <button onClick={() => handleDelete(c.id)} style={{background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer'}} title="Eliminar"><Trash2 size={18} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {/* Modal de Configuración */}
        {isConfigModalOpen && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
            padding: '20px'
          }}>
            <div style={{
              background: '#0f172a', width: '100%', maxWidth: '600px', 
              borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)',
              maxHeight: '90vh', overflowY: 'auto'
            }}>
              <div style={{padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#0f172a', zIndex: 10}}>
                <h2 style={{margin: 0, fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px'}}>
                  <Settings size={22} className="text-blue-400" /> Configuración Avanzada
                </h2>
                <button onClick={() => setIsConfigModalOpen(false)} style={{background: 'none', border: 'none', color: '#64748b', cursor: 'pointer'}}><X size={24} /></button>
              </div>

              <div style={{padding: '24px'}}>
                {/* Honeypots for Modal */}
                <input type="text" style={{display:'none'}} tabIndex="-1" />
                <input type="password" style={{display:'none'}} tabIndex="-1" />

                {/* Robot Section */}
                <div style={{marginBottom: '32px'}}>
                    <h3 style={{fontSize: '0.8rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <Bot size={16} /> Control del Robot
                    </h3>
                    
                    <div style={{background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '16px', padding: '20px'}}>
                        <div style={{marginBottom: '20px'}}>
                            <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px'}}>GitHub Personal Access Token</label>
                            <div style={{position: 'relative'}}>
                                <input 
                                    type={showToken ? "text" : "password"}
                                    placeholder={loadingConfig ? "Cargando..." : "github_pat_..."}
                                    readOnly={!isEditingToken}
                                    autoComplete="off"
                                    data-lpignore="true"
                                    spellCheck={false}
                                    style={{width: '100%', background: isEditingToken ? '#000' : 'rgba(0,0,0,0.4)', border: isEditingToken ? '1px solid #3b82f6' : '1px solid #333', borderRadius: '10px', padding: '12px 70px 12px 12px', color: isEditingToken ? '#fff' : '#94a3b8', outline: 'none', fontSize: '0.9rem', opacity: loadingConfig ? 0.5 : 1, transition: 'all 0.2s', cursor: isEditingToken ? 'text' : 'not-allowed'}}
                                    value={configSettings.gh_token}
                                    onChange={e => setConfigSettings({...configSettings, gh_token: e.target.value})}
                                />
                                <div style={{position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '8px'}}>
                                    <button 
                                        type="button"
                                        title={isEditingToken ? "Bloquear Edición" : "Editar Token"}
                                        onClick={() => setIsEditingToken(!isEditingToken)}
                                        style={{background: 'none', border: 'none', color: isEditingToken ? '#3b82f6' : '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center'}}
                                    >
                                        {isEditingToken ? <Unlock size={16} /> : <Lock size={16} />}
                                    </button>
                                    <button 
                                        type="button"
                                        title={showToken ? "Ocultar" : "Mostrar"}
                                        onClick={() => setShowToken(!showToken)}
                                        style={{background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center'}}
                                    >
                                        {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            {loadingConfig && <p style={{fontSize: '0.65rem', color: 'var(--color-primario)', marginTop: '6px'}}>Verificando token en la base de datos...</p>}
                            <p style={{fontSize: '0.65rem', color: '#64748b', marginTop: '6px'}}>Este token es necesario para despertar al robot manualmente.</p>
                        </div>

                        {/* Hardcoded Fallback Token Display */}
                        <div style={{background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.1)', marginBottom: '20px'}}>
                            <p style={{fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 900, marginBottom: '8px', letterSpacing: '0.05em'}}>Llave de Acceso (Copia Directa)</p>
                            <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                <code style={{fontSize: '0.7rem', color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '6px 10px', borderRadius: '6px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                    github_pat_11CACSEWI0dVQc8ogJ...PcoAA
                                </code>
                                <button 
                                    onClick={() => {
                                        if (configSettings.gh_token) {
                                            navigator.clipboard.writeText(configSettings.gh_token);
                                            showStatus('success', 'Llave copiada al portapapeles');
                                        } else {
                                            showStatus('error', 'No hay llave configurada');
                                        }
                                    }}
                                    style={{padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'}}
                                >
                                    Copiar
                                </button>
                            </div>
                        </div>

                        <button 
                            onClick={handleTriggerRobot}
                            disabled={isTriggeringRobot}
                            style={{
                                width: '100%',
                                background: isTriggeringRobot ? '#4b5563' : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '12px',
                                padding: '14px',
                                fontWeight: 800,
                                fontSize: '0.9rem',
                                cursor: isTriggeringRobot ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px',
                                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)',
                                transition: 'all 0.2s'
                            }}
                        >
                            {isTriggeringRobot ? (
                                <>
                                    <RefreshCw size={20} className="spinner" /> Validando...
                                </>
                            ) : (
                                <>
                                    <Bot size={20} /> DESPERTAR ROBOT AHORA
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Colaborar Section */}
                <div>
                    <h3 style={{fontSize: '0.8rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <Heart size={16} /> Sección &quot;Colaborar&quot;
                    </h3>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'}}>
                            <div>
                                <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px'}}>Alias</label>
                                <input 
                                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '10px', padding: '12px', color: '#fff', outline: 'none'}}
                                    value={configSettings.donate_alias}
                                    onChange={e => setConfigSettings({...configSettings, donate_alias: e.target.value})}
                                />
                            </div>
                            <div>
                                <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px'}}>CBU / CVU</label>
                                <input 
                                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '10px', padding: '12px', color: '#fff', outline: 'none'}}
                                    value={configSettings.donate_cbu}
                                    onChange={e => setConfigSettings({...configSettings, donate_cbu: e.target.value})}
                                />
                            </div>
                        </div>
                        <div>
                            <label style={{display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px'}}>Mensaje de Bienvenida</label>
                            <textarea 
                                rows={5}
                                style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '10px', padding: '12px', color: '#fff', outline: 'none', resize: 'vertical', fontSize: '0.9rem'}}
                                value={configSettings.donate_text}
                                onChange={e => setConfigSettings({...configSettings, donate_text: e.target.value})}
                            />
                        </div>
                    </div>
                </div>

                <div style={{marginTop: '32px', display: 'flex', gap: '12px'}}>
                    <button 
                        onClick={handleSaveConfig}
                        disabled={isSaving}
                        style={{
                            flex: 1, background: '#10b981', color: '#fff', border: 'none', 
                            padding: '14px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                        }}
                    >
                        {isSaving ? <RefreshCw size={20} className="spinner" /> : <Save size={20} />}
                        Guardar Toda la Configuración
                    </button>
                    <button 
                        onClick={() => setIsConfigModalOpen(false)}
                        style={{padding: '14px 24px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 600, cursor: 'pointer'}}
                    >
                        Cerrar
                    </button>
                </div>
              </div>
            </div>
          </div>
        )}

      <style dangerouslySetInnerHTML={{ __html: `
        .admin-row-hover:hover { background: rgba(255,255,255,0.02); }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}} />
    </div>
  );
}
