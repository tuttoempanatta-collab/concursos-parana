'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '../../../firebase.config';
import { collection, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { ArrowLeft, Inbox, CheckCircle, Trash2, Edit3, X } from 'lucide-react';
import Link from 'next/link';

export default function PendientesPage() {
    const [user, setUser] = useState(null);
    const [pendientes, setPendientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);

    // Modal state for manual classification
    const [editItem, setEditItem] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                fetchPendientes();
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const fetchPendientes = async () => {
        try {
            setLoading(true);
            const snapshot = await getDocs(collection(db, 'concursos_pendientes_revision'));
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // sort by date discovered
            data.sort((a,b) => (b.discoveredAt?.seconds || 0) - (a.discoveredAt?.seconds || 0));
            setPendientes(data);
        } catch(e) {
            console.error(e);
            alert("Error cargando la bandeja de revisión");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if(!confirm('¿Ignorar y eliminar este concurso?')) return;
        setProcessingId(id);
        try {
            await deleteDoc(doc(db, 'concursos_pendientes_revision', id));
            setPendientes(prev => prev.filter(p => p.id !== id));
        } catch(e) {
            alert('Error');
        } finally {
            setProcessingId(null);
        }
    };

    const handleSaveManualClassification = async (e) => {
        e.preventDefault();
        setProcessingId(editItem.id);
        try {
            // First, save it to the main 'concursos' collection as a valid resolved contest!
            const mainDocRef = doc(db, 'concursos', editItem.id);
            await updateDoc(mainDocRef, {
                nivel: editItem.nivel || 'No especificado',
                date: editItem.date || null,
                isManual: true, // We flag it as manual so the robot doesn't overwrite it immediately
                updatedAt: new Date().toISOString()
            });

            // Then, remove it from the pending bucket
            await deleteDoc(doc(db, 'concursos_pendientes_revision', editItem.id));
            setPendientes(prev => prev.filter(p => p.id !== editItem.id));
            setEditItem(null);
        } catch(error) {
            console.error(error);
            alert("Error procesando concurso.");
        } finally {
            setProcessingId(null);
        }
    };

    if (loading) return <div className="p-10 text-center">Revisando bandeja...</div>;
    if (!user) return <div className="p-10 text-center text-red-500">Acceso denegado.</div>;

    return (
        <div className="max-w-6xl mx-auto p-6 bg-slate-50 min-h-screen font-sans text-slate-800">
            <div className="mb-8">
                <Link href="/admin" className="text-pink-600 hover:text-pink-800 font-medium flex items-center mb-2">
                    <ArrowLeft size={16} className="mr-1" /> Volver al Panel
                </Link>
                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                    <Inbox size={30} className="text-indigo-600"/>
                    Bandeja de Revisión
                </h1>
                <p className="text-slate-600 mt-2">Aquí llegan los concursos que el robot NO pudo interpretar, listos para que los clasifiques manualmente o los ignores.</p>
            </div>

            {pendientes.length === 0 ? (
                <div className="bg-white rounded-xl p-10 text-center shadow-sm border border-slate-200">
                    <CheckCircle className="mx-auto text-emerald-500 mb-3" size={48} />
                    <h2 className="text-xl font-bold text-slate-700">¡Todo al día!</h2>
                    <p className="text-slate-500">El robot pudo interpretar todos los concursos de la última pasada con éxito.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {pendientes.map(item => (
                        <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row gap-4 items-start md:items-center">
                            <div className="flex-1">
                                <h3 className="font-bold text-lg text-slate-900">{item.title}</h3>
                                <p className="text-sm text-slate-500 mt-1 line-clamp-2">{item.originalText || "Sin contexto adicional"}</p>
                                
                                <div className="flex gap-3 mt-3">
                                    <span className="text-xs font-semibold bg-rose-100 text-rose-700 px-2 py-1 rounded">Nivel: {item.nivel}</span>
                                    <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded">Falta Fecha: {!item.date ? 'Sí' : 'No'}</span>
                                    <a href={item.link} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">Ver en CGE</a>
                                </div>
                            </div>
                            
                            <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
                                <button 
                                    disabled={processingId === item.id}
                                    onClick={() => setEditItem({...item})} 
                                    className="flex-1 md:flex-none flex items-center justify-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-medium transition"
                                >
                                    <Edit3 size={16}/> Clasificar
                                </button>
                                <button 
                                    disabled={processingId === item.id}
                                    onClick={() => handleDelete(item.id)} 
                                    className="flex-none flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg font-medium transition"
                                >
                                    <Trash2 size={16}/>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal de Clasificación */}
            {editItem && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm shadow-2xl flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
                            <h2 className="text-xl font-bold text-slate-800">Clasificar Concurso</h2>
                            <button onClick={() => setEditItem(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSaveManualClassification} className="p-5 flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Título Original</label>
                                <p className="text-sm bg-slate-100 p-2 rounded text-slate-600">{editItem.title}</p>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Nivel</label>
                                <select 
                                    value={editItem.nivel || 'No especificado'}
                                    onChange={e => setEditItem({...editItem, nivel: e.target.value})}
                                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                >
                                    <option value="No especificado">-- Seleccionar Nivel --</option>
                                    <option value="Primario">Primario / Inicial</option>
                                    <option value="Secundario">Secundario / Técnica / ESJA</option>
                                    <option value="Superior">Superior</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Fecha de Evento</label>
                                <input 
                                    type="datetime-local"
                                    value={editItem.date ? editItem.date.slice(0, 16) : ''}
                                    onChange={e => {
                                        let iso = '';
                                        if (e.target.value) {
                                            const d = new Date(e.target.value);
                                            iso = d.toISOString();
                                        }
                                        setEditItem({...editItem, date: iso});
                                    }}
                                    className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                />
                                <p className="text-xs text-slate-500 mt-1">Si no fijas fecha, seguirá constando como falta de dato.</p>
                            </div>

                            <div className="flex gap-3 justify-end mt-4 pt-4 border-t border-slate-100">
                                <button type="button" onClick={() => setEditItem(null)} className="px-4 py-2 font-medium text-slate-600 hover:text-slate-800">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={processingId} className="px-5 py-2 font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2">
                                    <CheckCircle size={16}/> Clasificar y Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
