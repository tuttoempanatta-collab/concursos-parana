'use client';

import { useState, useEffect } from 'react';
import { auth, db } from '../../firebase.config';
import { 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { 
  Save, 
  Trash2, 
  Plus, 
  LogOut, 
  Edit3, 
  X,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

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
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

  // 1. Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchFromFirestore();
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Data Fetching
  const fetchFromFirestore = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'concursos'), orderBy('pubDate', 'desc'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setConcursos(data);
    } catch (err) {
      console.error("Error fetching Firestore:", err);
      showStatus('error', 'Error al cargar datos de Firestore');
    } finally {
      setLoading(false);
    }
  };

  // 3. Actions
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error("Login error:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setLoginError('Email o contraseña incorrectos.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setLoginError('Error: El inicio de sesión con Email/Password no está habilitado en Firebase.');
      } else {
        setLoginError('Error: ' + err.message);
      }
    }
  };

  const handleLogout = () => signOut(auth);

  const showStatus = (type, text) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg({ type: '', text: '' }), 4000);
  };

  const startEdit = (concurso) => {
    setEditingId(concurso.id);
    setEditForm({ ...concurso });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
    setIsAdding(false);
  };

  const handleUpdate = async () => {
    try {
      const { id, ...data } = editForm;
      await updateDoc(doc(db, 'concursos', id), data);
      showStatus('success', 'Concurso actualizado correctamente');
      setEditingId(null);
      fetchFromFirestore();
    } catch (err) {
      showStatus('error', 'Error al actualizar');
    }
  };

  const handleAdd = async () => {
    try {
      await addDoc(collection(db, 'concursos'), {
        ...editForm,
        id: Math.random().toString(36).substr(2, 9), // Fallback ID
        createdAt: new Date().toISOString()
      });
      showStatus('success', 'Nuevo concurso agregado');
      setIsAdding(false);
      setEditForm(null);
      fetchFromFirestore();
    } catch (err) {
      showStatus('error', 'Error al agregar');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Seguro que quieres eliminar este concurso?')) return;
    try {
      await deleteDoc(doc(db, 'concursos', id));
      showStatus('success', 'Concurso eliminado');
      fetchFromFirestore();
    } catch (err) {
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
      fullContent: 'Cargado manualmente por administrador.'
    });
  };

  // Final robust check to avoid hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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
             <h1 style={{fontSize: '2rem', fontWeight: 800, margin: '0 0 8px 0', background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Panel Admin</h1>
             <p style={{color: '#94a3b8', fontSize: '0.875rem', margin: 0}}>Gestión de Concursos Paraná</p>
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
              Admin Concursos 2026
            </h1>
            <p style={{fontSize: '0.75rem', color: '#64748b', margin: '4px 0 0 0'}}>
              Sesión: <span style={{color: '#94a3b8'}}>{user.email}</span>
            </p>
          </div>
          <div style={{display: 'flex', gap: '12px'}}>
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

        {/* Status Msg */}
        {statusMsg.text && (
          <div style={{
            position: 'fixed', bottom: '32px', right: '32px', padding: '16px 24px',
            borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '12px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', zIndex: 100,
            background: statusMsg.type === 'success' ? '#10b981' : '#ef4444',
            color: '#fff', fontWeight: 600, animation: 'slideIn 0.3s ease-out'
          }}>
            {statusMsg.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
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
                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
                    value={editForm.eventDate} 
                    placeholder="Ej: 16 de marzo"
                    onChange={e => setEditForm({...editForm, eventDate: e.target.value})}
                  />
                </div>
                <div>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>Horario Firma</label>
                  <input 
                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none'}}
                    value={editForm.time} 
                    placeholder="Ej: 10:30 hs"
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
                <div style={{gridColumn: '1 / -1'}}>
                  <label style={{display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase'}}>Contenido Completo (Detalles)</label>
                  <textarea 
                    rows={8}
                    style={{width: '100%', background: '#000', border: '1px solid #333', borderRadius: '12px', padding: '12px 16px', color: '#fff', outline: 'none', resize: 'vertical', fontSize: '0.875rem'}}
                    value={editForm.fullContent} 
                    onChange={e => setEditForm({...editForm, fullContent: e.target.value})}
                  />
                </div>
              </div>

              <div style={{display: 'flex', gap: '16px', marginTop: '32px'}}>
                <button 
                  onClick={isAdding ? handleAdd : handleUpdate}
                  style={{flex: 1, background: '#2563eb', color: '#fff', border: 'none', padding: '14px', borderRadius: '16px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'}}
                >
                  <Save size={20} /> Guardar Concurso
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
          ) : concursos.length === 0 ? (
            <div style={{padding: '60px', textAlign: 'center', color: '#64748b', fontWeight: 500}}>Aún no hay concursos en la base de datos.</div>
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
                  {concursos.map((c) => (
                    <tr key={c.id} style={{borderTop: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s'}} className="admin-row-hover">
                      <td style={{padding: '20px 24px', color: '#94a3b8', whiteSpace: 'nowrap'}}>{c.pubDate}</td>
                      <td style={{padding: '20px 24px'}}>
                        <div style={{fontWeight: 700, color: '#f1f5f9', marginBottom: '4px'}}>{c.title}</div>
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
                          <button onClick={() => startEdit(c)} style={{background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer'}} title="Editar"><Edit3 size={18} /></button>
                          <button onClick={() => handleDelete(c.id)} style={{background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer'}} title="Eliminar"><Trash2 size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .admin-row-hover:hover { background: rgba(255,255,255,0.02); }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}} />
    </div>
  );
}
