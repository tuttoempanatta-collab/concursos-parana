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
      setLoginError('Credenciales inválidas o error de conexión.');
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

  // LOGIN VIEW
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4 font-sans">
        <div className="w-full max-w-md bg-[#1a1a1a] border border-[#333] rounded-2xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-white mb-2 text-center">Panel Admin</h1>
          <p className="text-gray-400 mb-8 text-center text-sm">Gestiona los concursos del DDE Paraná</p>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Email</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ejemplo.com"
                className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contraseña</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
                required
              />
            </div>
            
            {loginError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle size={16} /> {loginError}
              </div>
            )}
            
            <button 
              type="submit" 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98]"
            >
              Iniciar Sesión
            </button>
          </form>
        </div>
      </div>
    );
  }

  // DASHBOARD VIEW
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-xl py-4 z-40">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              Admin Concursos 2026
            </h1>
            <p className="text-xs text-gray-500">Sesión iniciada como: {user.email}</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={openAddForm}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg shadow-green-600/20"
            >
              <Plus size={18} /> Nuevo Concurso
            </button>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 bg-[#222] hover:bg-[#333] px-4 py-2 rounded-lg text-sm font-medium transition-all"
            >
              <LogOut size={18} /> Salir
            </button>
          </div>
        </header>

        {/* Status Msg */}
        {statusMsg.text && (
          <div className={`fixed bottom-8 right-8 p-4 rounded-xl flex items-center gap-3 shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 ${
            statusMsg.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {statusMsg.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            <span className="font-semibold">{statusMsg.text}</span>
          </div>
        )}

        {/* Edit/Add Form Overlay */}
        {(editingId || isAdding) && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-2xl bg-[#1a1a1a] border border-[#333] rounded-3xl p-8 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">{isAdding ? 'Nuevo Concurso' : 'Editar Concurso'}</h2>
                <button onClick={cancelEdit} className="text-gray-500 hover:text-white"><X size={24} /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500 font-bold mb-1 block">TÍTULO / DESCRIPCIÓN CORTA</label>
                  <input 
                    className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-2" 
                    value={editForm.title} 
                    onChange={e => setEditForm({...editForm, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-bold mb-1 block">FECHA PUBLICACIÓN</label>
                  <input 
                    type="date"
                    className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-2" 
                    value={editForm.pubDate} 
                    onChange={e => setEditForm({...editForm, pubDate: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-bold mb-1 block">FECHA CONCURSO</label>
                  <input 
                    className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-2" 
                    value={editForm.eventDate} 
                    placeholder="Ej: 16 de marzo"
                    onChange={e => setEditForm({...editForm, eventDate: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-bold mb-1 block">HORARIO FIRMA</label>
                  <input 
                    className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-2" 
                    value={editForm.time} 
                    placeholder="Ej: 10:30 hs"
                    onChange={e => setEditForm({...editForm, time: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-bold mb-1 block">NIVEL</label>
                  <select 
                    className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-2"
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
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500 font-bold mb-1 block">DESCRIPCIÓN COMPLETA (TEXTO)</label>
                  <textarea 
                    rows={6}
                    className="w-full bg-[#111] border border-[#333] rounded-xl px-4 py-2 text-sm" 
                    value={editForm.fullContent} 
                    onChange={e => setEditForm({...editForm, fullContent: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  onClick={isAdding ? handleAdd : handleUpdate}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                >
                  <Save size={20} /> Guardar Cambios
                </button>
                <button onClick={cancelEdit} className="bg-[#222] px-6 rounded-xl font-medium">Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        <div className="bg-[#111] border border-[#333] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500 font-medium">Cargando concursos de Firestore...</div>
          ) : concursos.length === 0 ? (
            <div className="p-12 text-center text-gray-500 font-medium">No hay concursos en la base de datos.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#1a1a1a] text-xs text-gray-400 uppercase tracking-widest border-b border-[#333]">
                  <tr>
                    <th className="px-6 py-4">Fecha Pub.</th>
                    <th className="px-6 py-4">Título / Concurso</th>
                    <th className="px-6 py-4">Nivel</th>
                    <th className="px-6 py-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222]">
                  {concursos.map((c) => (
                    <tr key={c.id} className="hover:bg-blue-600/5 transition-colors group">
                      <td className="px-6 py-4 text-sm whitespace-nowrap">{c.pubDate}</td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-200 line-clamp-1">{c.title}</div>
                        <div className="text-xs text-gray-500">{c.eventDate || 'Sin fecha'} - {c.time || 'Sin hora'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] bg-[#333] font-bold text-gray-400">
                          {c.level}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(c)} className="p-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all">
                            <Edit3 size={18} />
                          </button>
                          <button onClick={() => handleDelete(c.id)} className="p-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600 hover:text-white transition-all">
                            <Trash2 size={18} />
                          </button>
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
    </div>
  );
}
