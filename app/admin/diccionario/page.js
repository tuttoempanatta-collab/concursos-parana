'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '../../../firebase.config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Save, Plus, Trash2, ArrowLeft, BookOpen, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function DiccionarioPage() {
    const [user, setUser] = useState(null);
    const [dictionary, setDictionary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('levels'); // levels, cities, excludedTitles
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                fetchDictionary();
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const fetchDictionary = async () => {
        try {
            setLoading(true);
            const docRef = doc(db, 'config', 'robot_dictionary');
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                setDictionary(snap.data());
            } else {
                // Initialize empty if doesn't exist
                const initial = {
                    levels: { 'Secundario': [], 'Primario': [], 'Superior': [] },
                    cities: { 'Paraná (Dpto)': [] },
                    excludedTitles: [],
                    version: 1
                };
                await setDoc(docRef, initial);
                setDictionary(initial);
            }
        } catch(e) {
            console.error(e);
            alert("Error cargando diccionario");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const docRef = doc(db, 'config', 'robot_dictionary');
            await setDoc(docRef, { ...dictionary, version: (dictionary.version || 1) + 1 });
            alert("Diccionario guardado con éxito. El robot lo usará en su próxima pasada.");
        } catch (e) {
            console.error(e);
            alert("Error guardando diccionario");
        } finally {
            setSaving(false);
        }
    };

    const addKeyword = (category, keyGroup) => {
        const word = prompt("Ingresa la nueva palabra clave o patrón (ej. 'técnica 1'):");
        if (!word) return;
        
        const newDict = { ...dictionary };
        if (category === 'levels') {
            newDict.levels[keyGroup] = [...(newDict.levels[keyGroup] || []), word.toLowerCase()];
        } else if (category === 'cities') {
            newDict.cities[keyGroup] = [...(newDict.cities[keyGroup] || []), word.toLowerCase()];
        } else if (category === 'excludedTitles') {
            newDict.excludedTitles = [...(newDict.excludedTitles || []), word.toLowerCase()];
        }
        setDictionary(newDict);
    };

    const removeKeyword = (category, keyGroup, index) => {
        const newDict = { ...dictionary };
        if (category === 'levels') {
            newDict.levels[keyGroup].splice(index, 1);
        } else if (category === 'cities') {
            newDict.cities[keyGroup].splice(index, 1);
        } else if (category === 'excludedTitles') {
            newDict.excludedTitles.splice(index, 1);
        }
        setDictionary(newDict);
    };

    if (loading) return <div className="p-10 text-center">Cargando Cerebro...</div>;
    if (!user) return <div className="p-10 text-center text-red-500">Acceso denegado. Inicia sesión en el Admin primero.</div>;

    return (
        <div className="max-w-6xl mx-auto p-6 bg-slate-50 min-h-screen font-sans text-slate-800">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <Link href="/admin" className="text-pink-600 hover:text-pink-800 font-medium flex items-center mb-2">
                        <ArrowLeft size={16} className="mr-1" /> Volver al Panel
                    </Link>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <BookOpen size={30} className="text-indigo-600"/>
                        Diccionario de Aprendizaje del Robot
                    </h1>
                    <p className="text-slate-600 mt-2">Enseña al robot cómo interpretar expresiones extrañas o nuevas formas de redactar de las escuelas.</p>
                </div>
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 shadow-md transition-all"
                >
                    <Save size={20} />
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex border-b border-slate-200 bg-slate-100">
                    <button onClick={() => setActiveTab('levels')} className={`px-6 py-4 font-semibold text-sm ${activeTab === 'levels' ? 'bg-white text-indigo-600 border-t-2 border-t-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Niveles (Prim/Sec/Sup)</button>
                    <button onClick={() => setActiveTab('cities')} className={`px-6 py-4 font-semibold text-sm ${activeTab === 'cities' ? 'bg-white text-indigo-600 border-t-2 border-t-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Localidades</button>
                    <button onClick={() => setActiveTab('excludedTitles')} className={`px-6 py-4 font-semibold text-sm ${activeTab === 'excludedTitles' ? 'bg-white text-indigo-600 border-t-2 border-t-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Títulos Ignorados (Basura)</button>
                </div>

                <div className="p-6">
                    {activeTab === 'levels' && dictionary?.levels && Object.entries(dictionary.levels).map(([level, keywords]) => (
                        <div key={level} className="mb-8 border border-slate-200 rounded-lg p-5">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-slate-800">Si contiene estas palabras, es nivel: <span className="text-indigo-600 uppercase">{level}</span></h3>
                                <button onClick={() => addKeyword('levels', level)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1">
                                    <Plus size={16} /> Añadir Regla
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {keywords.map((kw, idx) => (
                                    <div key={idx} className="bg-indigo-50 border border-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                                        <code className="bg-white/50 px-1 rounded">{kw}</code>
                                        <button onClick={() => removeKeyword('levels', level, idx)} className="text-indigo-400 hover:text-red-500"><Trash2 size={14}/></button>
                                    </div>
                                ))}
                                {keywords.length === 0 && <span className="text-slate-400 text-sm italic">No hay patrones registrados para {level}</span>}
                            </div>
                        </div>
                    ))}

                    {activeTab === 'cities' && dictionary?.cities && Object.entries(dictionary.cities).map(([region, keywords]) => (
                        <div key={region} className="mb-8 border border-slate-200 rounded-lg p-5">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-slate-800">Detectores para la región: <span className="text-indigo-600 uppercase">{region}</span></h3>
                                <button onClick={() => addKeyword('cities', region)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1">
                                    <Plus size={16} /> Añadir Localidad
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {keywords.map((kw, idx) => (
                                    <div key={idx} className="bg-emerald-50 border border-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                                        <code className="bg-white/50 px-1 rounded">{kw}</code>
                                        <button onClick={() => removeKeyword('cities', region, idx)} className="text-emerald-400 hover:text-red-500"><Trash2 size={14}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    {activeTab === 'excludedTitles' && (
                        <div className="border border-slate-200 rounded-lg p-5">
                            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">Ignorar si el título contiene exactamente:</h3>
                                    <p className="text-sm text-slate-500">Útil para ignorar títulos genéricos repetitivos del CGE que no son concursos reales.</p>
                                </div>
                                <button onClick={() => addKeyword('excludedTitles', null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1">
                                    <Plus size={16} /> Añadir Basura
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {dictionary?.excludedTitles?.map((kw, idx) => (
                                    <div key={idx} className="bg-rose-50 border border-rose-100 text-rose-800 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                                        <code className="bg-white/50 px-1 rounded">{kw}</code>
                                        <button onClick={() => removeKeyword('excludedTitles', null, idx)} className="text-rose-400 hover:text-red-600"><Trash2 size={14}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="mt-8 bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg text-amber-800 text-sm">
                <AlertCircle className="inline mb-1 mr-1" size={16}/> 
                <strong>Importante:</strong> Puedes usar Expresiones Regulares (RegEx) para buscar patrones avanzados, iniciándolas con `<span className="font-mono">\\b</span>` (ej: <span className="font-mono">\bescuela\b</span> para palabra exacta). Cualquier error sintáctico será capturado automáticamente sin romper el robot. Los cambios se aplicarán en la próxima carga automática del robot.
            </div>
        </div>
    );
}
