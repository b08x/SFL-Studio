/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useRef } from 'react';
import { Prompt, Workflow, SFLAnalysis, UserSettings } from './types';
import { db } from './services/storage';
import { generatePromptFromSFL, connectLiveAssistant, analyzePromptWithSFL, extractSFLFromContext } from './services/orchestrator';
import DiffViewer from './components/DiffViewer';
import PromptWizard from './components/PromptWizard';
import WorkflowEngine from './components/WorkflowEngine';
import AnalysisPanel from './components/AnalysisPanel';
import SettingsModal from './components/SettingsModal';
import { SFLFieldSchema, SFLTenorSchema, SFLModeSchema } from './schemas';
import { z } from 'zod';
import { 
  Terminal, Mic, Save, Layers, 
  Settings, Box, Database, Cpu, Command, 
  MicOff, Activity, Sparkles, FileText,
  Upload, Download, ShieldCheck, Loader2, X, Wand2,
  Menu, PanelRightOpen, PanelRight, ChevronRight, Play, Globe
} from 'lucide-react';

// --- Modal Wrapper ---
const ModalShell = ({ children, onClose }: { children?: React.ReactNode, onClose: () => void }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
        <div className="relative animate-in zoom-in-95 duration-200 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl" onClick={(e) => e.stopPropagation()}>
            {children}
            <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800/50 backdrop-blur rounded-full p-2 z-50">
                <X className="w-5 h-5" />
            </button>
        </div>
    </div>
);

const NavItem = ({ icon: Icon, label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
      active 
        ? 'bg-primary-600/10 text-primary-400 border-l-2 border-primary-500' 
        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
    }`}
  >
    <Icon className="w-5 h-5" />
    <span className="font-medium text-sm">{label}</span>
  </button>
);

const InputField = ({ label, value, onChange, placeholder, error }: any) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between">
        {label}
        {error && <span className="text-[9px] text-red-400 font-normal animate-pulse">{error}</span>}
    </label>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full bg-slate-950 border rounded px-3 py-2 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-700 ${
          error 
          ? 'border-red-900/50 focus:border-red-500' 
          : 'border-slate-800 focus:border-primary-500'
      }`}
      placeholder={placeholder}
    />
  </div>
);

const SelectField = ({ label, value, onChange, options, error }: any) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between">
        {label}
        {error && <span className="text-[9px] text-red-400 font-normal animate-pulse">{error}</span>}
    </label>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full bg-slate-950 border rounded px-3 py-2 text-xs text-slate-200 outline-none appearance-none transition-all ${
          error 
          ? 'border-red-900/50 focus:border-red-500' 
          : 'border-slate-800 focus:border-primary-500'
      }`}
    >
      {options.map((opt: string) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);

const App: React.FC = () => {
  const [view, setView] = useState<'editor' | 'lab' | 'prompts'>('editor');
  const [modal, setModal] = useState<'wizard' | 'settings' | null>(null);
  
  // Layout State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showInspector, setShowInspector] = useState(true);

  // Data State
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState<Prompt | null>(null);
  const [analysis, setAnalysis] = useState<SFLAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtractingSFL, setIsExtractingSFL] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(db.settings.get());
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Workflow State
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null);
  
  // Live Assistant State
  const [isLive, setIsLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState('disconnected');
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);

  // References
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Data
  useEffect(() => {
    setPrompts(db.prompts.getAll());
    setWorkflows(db.workflows.getAll());
    setSettings(db.settings.get());
    
    // Auto-select most recent
    const all = db.prompts.getAll();
    if (!currentPrompt && all.length > 0) {
        setCurrentPrompt(all[0]);
    } else if (all.length === 0) {
        createNewPrompt();
    }
  }, []);

  // Audio & Live Logic (Simplified for View)
  const playNextAudio = async () => {
    if (!audioContextRef.current || audioQueueRef.current.length === 0 || isPlayingRef.current) return;
    isPlayingRef.current = true;
    const buffer = audioQueueRef.current.shift()!;
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => { isPlayingRef.current = false; playNextAudio(); };
    source.start();
  };

  const handleAudioData = async (base64: string) => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    try {
        const audioBuffer = await audioContextRef.current.decodeAudioData(bytes.buffer.slice(0)); 
        audioQueueRef.current.push(audioBuffer);
        playNextAudio();
    } catch (e) { console.error(e); }
  };

  const toggleLive = async () => {
      if (isLive) {
          setIsLive(false); setLiveStatus('disconnected'); window.location.reload(); 
      } else {
          try {
              setLiveStatus('connecting');
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              // Pass audio handler and tool handler
              const session = await connectLiveAssistant(
                  { voiceName: settings.live.voice, model: settings.live.model },
                  handleAudioData, 
                  async (name, args) => {
                      if (name === 'updateSFL' && currentPrompt) {
                          handleUpdateSFL(args.category, args.key, args.value);
                          return { success: true };
                      }
                      if (name === 'generate') { handleGenerate(); return { success: true }; }
                  },
                  setLiveStatus
              );
              setIsLive(true);
              // Simple Input Stream
              const audioCtx = new AudioContext({ sampleRate: 16000 });
              const source = audioCtx.createMediaStreamSource(stream);
              const processor = audioCtx.createScriptProcessor(4096, 1, 1);
              processor.onaudioprocess = (e) => {
                  const inputData = e.inputBuffer.getChannelData(0);
                  const pcmData = new Int16Array(inputData.length);
                  for (let i = 0; i < inputData.length; i++) pcmData[i] = inputData[i] * 0x7fff;
                  const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
                  session.sendRealtimeInput([{ mimeType: "audio/pcm;rate=16000", data: base64 }]);
              };
              source.connect(processor);
              processor.connect(audioCtx.destination);
          } catch (e) { console.error(e); setLiveStatus('error'); }
      }
  };

  // --- Core Actions ---

  const createNewPrompt = () => {
    const newPrompt: Prompt = {
        id: Date.now().toString(),
        title: 'Untitled Prompt',
        tags: [],
        updatedAt: Date.now(),
        version: 1,
        history: [],
        content: '',
        sfl: {
            field: { domain: '', process: '' },
            tenor: { senderRole: '', receiverRole: '', powerStatus: 'Equal', affect: 'Neutral' },
            mode: { channel: 'Written', medium: 'Text', rhetoricalMode: 'Descriptive' }
        }
    };
    db.prompts.save(newPrompt);
    setPrompts(db.prompts.getAll());
    setCurrentPrompt(newPrompt);
    setAnalysis(null);
    return newPrompt;
  };

  const handleUpdateSFL = (category: 'field'|'tenor'|'mode', key: string, value: string) => {
      if (!currentPrompt) return;
      const updated = { ...currentPrompt };
      // @ts-ignore
      updated.sfl[category][key] = value;
      setCurrentPrompt(updated);

      // Zod Validation
      const errorKey = `${category}.${key}`;
      try {
        if (category === 'field') SFLFieldSchema.shape[key as keyof typeof SFLFieldSchema.shape].parse(value);
        else if (category === 'tenor') SFLTenorSchema.shape[key as keyof typeof SFLTenorSchema.shape].parse(value);
        else if (category === 'mode') SFLModeSchema.shape[key as keyof typeof SFLModeSchema.shape].parse(value);

        setValidationErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[errorKey];
            return newErrors;
        });
      } catch (err: any) {
          if (err instanceof z.ZodError) {
              setValidationErrors(prev => ({ ...prev, [errorKey]: err.errors[0].message }));
          }
      }
  };
  
  const handleSave = () => {
      if (currentPrompt) {
        db.prompts.save({ ...currentPrompt, updatedAt: Date.now() });
        setPrompts(db.prompts.getAll()); 
      }
  };

  const handleGenerate = async () => {
      if (!currentPrompt) return;
      setIsGenerating(true);
      try {
          const generated = await generatePromptFromSFL(currentPrompt.sfl, currentPrompt.content);
          const updated = { ...currentPrompt, content: generated, updatedAt: Date.now() };
          db.prompts.save(updated);
          setPrompts(db.prompts.getAll());
          setCurrentPrompt(updated);
      } catch (e) { console.error("Generation failed", e); } finally { setIsGenerating(false); }
  };

  const handleAnalyze = async () => {
    if (!currentPrompt || !currentPrompt.content) return;
    setIsAnalyzing(true);
    try {
        const result = await analyzePromptWithSFL(currentPrompt.content, currentPrompt.sfl);
        setAnalysis(result);
        const updated = { ...currentPrompt, lastAnalysis: result };
        db.prompts.save(updated);
        setPrompts(db.prompts.getAll());
    } catch (e) { console.error("Analysis failed", e); } finally { setIsAnalyzing(false); }
  };

  const handleSourceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !currentPrompt) return;
      setIsExtractingSFL(true);
      try {
          const extractedSFL = await extractSFLFromContext(file);
          const updated = {
              ...currentPrompt,
              sfl: {
                  field: { ...currentPrompt.sfl.field, ...extractedSFL.field },
                  tenor: { ...currentPrompt.sfl.tenor, ...extractedSFL.tenor },
                  mode: { ...currentPrompt.sfl.mode, ...extractedSFL.mode }
              }
          };
          setCurrentPrompt(updated);
          setValidationErrors({}); 
      } catch (e) { console.error(e); } finally { setIsExtractingSFL(false); }
  };

  // --- Render ---

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans">
      
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-950/80 backdrop-blur border-b border-slate-800 z-50 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
              <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-slate-400 hover:text-white">
                  <Menu className="w-5 h-5" />
              </button>
              <h1 className="font-display font-bold text-slate-200">SFL Studio</h1>
          </div>
          <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`}></div>
      </div>

      {/* Navigation Drawer (Sidebar) */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between transform transition-transform duration-300 lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div>
            <div className="p-6 hidden lg:block">
                <h1 className="text-xl font-display font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
                    SFL Studio <span className="text-xs text-slate-500 font-normal">v3</span>
                </h1>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Hybrid AI IDE</p>
            </div>
            
            <div className="lg:hidden p-4 border-b border-slate-800 flex justify-between items-center">
                <span className="font-bold text-slate-500">Menu</span>
                <button onClick={() => setIsMobileMenuOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <nav className="p-3 space-y-1">
                <NavItem icon={Layers} label="Dashboard" active={view === 'prompts'} onClick={() => { setView('prompts'); setIsMobileMenuOpen(false); }} />
                <NavItem icon={Terminal} label="Editor" active={view === 'editor'} onClick={() => { setView('editor'); setIsMobileMenuOpen(false); }} />
                <NavItem icon={Box} label="The Lab" active={view === 'lab'} onClick={() => { setView('lab'); setIsMobileMenuOpen(false); }} />
            </nav>

            <div className="px-3 mt-4">
                <button 
                    onClick={() => { setModal('wizard'); setIsMobileMenuOpen(false); }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg hover:from-primary-500 hover:to-primary-400 transition-all font-medium text-xs shadow-lg shadow-primary-900/20 border border-primary-500/20"
                >
                    <Sparkles className="w-4 h-4" />
                    <span>Magic Create</span>
                </button>
            </div>
        </div>

        <div className="p-4 border-t border-slate-800 space-y-3">
             <div className="flex gap-2">
                 <button onClick={() => db.system.exportData()} className="flex-1 flex items-center justify-center gap-2 text-xs bg-slate-800 p-2 rounded text-slate-400 hover:text-white hover:bg-slate-700">
                     <Download className="w-3 h-3" /> Export
                 </button>
                 <label className="flex-1 flex items-center justify-center gap-2 text-xs bg-slate-800 p-2 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer">
                     <Upload className="w-3 h-3" /> Import
                     <input type="file" className="hidden" onChange={handleSourceUpload} accept=".json" />
                 </label>
             </div>
             <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary-500 to-accent-500 flex items-center justify-center font-bold text-xs text-white">
                     DE
                 </div>
                 <div className="flex-1 min-w-0">
                     <p className="text-sm font-medium text-slate-200 truncate">DevUser</p>
                     <p className="text-xs text-slate-500 truncate">{settings.generation.provider}</p>
                 </div>
                 <Settings onClick={() => { setModal('settings'); setIsMobileMenuOpen(false); }} className="w-4 h-4 text-slate-500 cursor-pointer hover:text-slate-200 transition-colors" />
             </div>
        </div>
      </aside>

      {/* Main Content Overlay for Mobile */}
      {isMobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>}

      {/* Main Stage */}
      <main className="flex-1 flex flex-col min-w-0 pt-16 lg:pt-0">
        
        {/* Top Bar (Desktop) */}
        <header className="hidden lg:flex h-16 border-b border-slate-800 bg-slate-900/30 items-center justify-between px-6 backdrop-blur-sm z-10">
            <div className="flex items-center gap-4">
                {currentPrompt && view === 'editor' ? (
                    <>
                        <span className="text-slate-500 text-sm">Project /</span>
                        <input 
                            value={currentPrompt.title}
                            onChange={(e) => setCurrentPrompt({...currentPrompt, title: e.target.value})}
                            className="bg-transparent text-slate-200 font-display font-bold focus:outline-none focus:border-b border-primary-500 min-w-[200px]"
                        />
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                            v{currentPrompt.version}
                        </span>
                    </>
                ) : <span className="text-slate-500 font-display">Dashboard Overview</span>}
            </div>
            
            <div className="flex items-center gap-3">
                <button 
                    onClick={toggleLive}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                        isLive 
                        ? 'bg-red-500/10 border-red-500/50 text-red-400 animate-pulse' 
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-primary-400 hover:border-primary-500/50'
                    }`}
                >
                    {isLive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    <span className="text-xs font-bold uppercase tracking-wider">{liveStatus === 'connected' ? 'Live' : liveStatus}</span>
                </button>

                <div className="h-6 w-px bg-slate-800 mx-2"></div>
                
                <button onClick={() => setModal('settings')} className="p-2 text-slate-400 hover:text-primary-400 transition-colors" title="Settings">
                    <Settings className="w-5 h-5" />
                </button>
            </div>
        </header>

        {/* Views */}
        <div className="flex-1 overflow-hidden relative flex">
            
            {view === 'prompts' && (
                <div className="flex-1 overflow-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-300">
                        {/* Custom Wizard Card */}
                        <button 
                            onClick={() => setModal('wizard')}
                            className="h-48 rounded-xl bg-gradient-to-br from-primary-900/50 to-slate-900 border border-primary-500/20 hover:border-primary-500/50 flex flex-col items-center justify-center gap-3 text-slate-300 hover:text-white transition-all group relative overflow-hidden shadow-lg"
                        >
                            <div className="absolute inset-0 bg-primary-600/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="p-3 bg-primary-500/20 rounded-full group-hover:scale-110 transition-transform">
                                <Wand2 className="w-6 h-6 text-primary-400" />
                            </div>
                            <span className="font-bold font-display">New Project Wizard</span>
                        </button>
                        
                        {prompts.map(p => (
                            <div key={p.id} onClick={() => { setCurrentPrompt(p); setView('editor'); }} className="h-48 bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-600 cursor-pointer transition-all flex flex-col justify-between group hover:shadow-xl relative overflow-hidden">
                                <div>
                                    <h3 className="font-bold text-lg text-slate-200 group-hover:text-primary-400 transition-colors line-clamp-1">{p.title}</h3>
                                    <p className="text-xs text-slate-500 mt-1 font-mono">{new Date(p.updatedAt).toLocaleDateString()}</p>
                                </div>
                                <div className="space-y-2 relative z-10">
                                    <div className="flex flex-wrap gap-2 text-[10px] uppercase font-bold tracking-wider">
                                        <span className="bg-slate-950 px-2 py-1 rounded text-slate-500 border border-slate-800">{p.sfl.mode.channel}</span>
                                        <span className="bg-slate-950 px-2 py-1 rounded text-slate-500 border border-slate-800">{p.sfl.tenor.affect}</span>
                                    </div>
                                    {p.lastAnalysis && (
                                        <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                                            <ShieldCheck className="w-3 h-3" /> Score: {p.lastAnalysis.score}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {view === 'editor' && currentPrompt && (
                <div className="flex w-full h-full">
                    {/* Main Editor Area */}
                    <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
                        {/* Editor Toolbar */}
                        <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/20">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <FileText className="w-4 h-4" />
                                <span className="uppercase font-bold tracking-wider">Prompt Editor</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={handleSave} className="p-1.5 hover:bg-slate-800 rounded text-slate-400"><Save className="w-4 h-4" /></button>
                                <div className="h-4 w-px bg-slate-800"></div>
                                <button onClick={() => setShowInspector(!showInspector)} className={`p-1.5 rounded transition-colors ${showInspector ? 'text-primary-400 bg-primary-500/10' : 'text-slate-400 hover:bg-slate-800'}`}>
                                    {showInspector ? <PanelRightOpen className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Editor Content */}
                        <div className="flex-1 overflow-auto p-4 md:p-8">
                             {/* Analysis Panel Inline */}
                             {(analysis || currentPrompt.lastAnalysis) && (
                                <div className="mb-6 animate-in slide-in-from-top-2">
                                    <AnalysisPanel analysis={analysis || currentPrompt.lastAnalysis!} />
                                </div>
                            )}

                            <div className="w-full max-w-4xl mx-auto space-y-6">
                                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
                                    <textarea 
                                        value={currentPrompt.content}
                                        onChange={(e) => setCurrentPrompt({...currentPrompt, content: e.target.value})}
                                        className="w-full h-[500px] bg-slate-900 p-6 text-slate-200 font-mono text-sm leading-relaxed outline-none resize-none"
                                        placeholder="Start typing your prompt here or use the generator..."
                                    />
                                    <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
                                        <span>{currentPrompt.content.length} characters</span>
                                        <span>{settings.generation.provider} / {settings.generation.model}</span>
                                    </div>
                                </div>

                                {/* Floating Action Bar (Mobile Sticky) */}
                                <div className="sticky bottom-4 flex gap-2 justify-end">
                                    <button 
                                        onClick={handleAnalyze}
                                        disabled={isAnalyzing}
                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-full border border-slate-700 shadow-lg flex items-center gap-2 backdrop-blur"
                                    >
                                        {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                        Analyze
                                    </button>
                                    <button 
                                        onClick={handleGenerate}
                                        disabled={isGenerating || Object.keys(validationErrors).length > 0}
                                        className="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-full shadow-lg shadow-primary-900/30 flex items-center gap-2 backdrop-blur disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                        Generate
                                    </button>
                                </div>

                                <div className="pt-8 pb-12">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Version History</h3>
                                    {currentPrompt.history.length > 0 ? (
                                        <DiffViewer 
                                            oldText={currentPrompt.history[0]?.content || ''} 
                                            newText={currentPrompt.content} 
                                        />
                                    ) : <div className="text-slate-600 text-xs italic">No history available.</div>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Inspector Panel (Right) */}
                    {showInspector && (
                        <div className="w-80 border-l border-slate-800 bg-slate-900/50 flex flex-col h-full overflow-hidden absolute lg:relative right-0 z-20 shadow-2xl lg:shadow-none">
                            <div className="p-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur flex justify-between items-center">
                                <span className="font-bold text-slate-200 font-display">SFL Parameters</span>
                                <button onClick={() => setShowInspector(false)} className="lg:hidden text-slate-400"><X className="w-4 h-4" /></button>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-5 space-y-8">
                                {/* Auto Fill */}
                                <div className="p-4 rounded-lg bg-slate-900 border border-dashed border-slate-700 text-center">
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        onChange={handleSourceUpload}
                                        accept="image/*,video/*,audio/*,.txt,.md,.pdf"
                                    />
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isExtractingSFL}
                                        className="text-xs text-primary-400 hover:text-primary-300 font-medium flex flex-col items-center gap-2 w-full"
                                    >
                                        {isExtractingSFL ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                                        {isExtractingSFL ? 'Extracting SFL...' : 'Auto-Fill from Context File'}
                                    </button>
                                </div>

                                {/* Field */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-accent-500 flex items-center gap-2 border-b border-accent-500/20 pb-1">
                                        <Activity className="w-3 h-3" /> FIELD
                                    </h4>
                                    <InputField label="Domain" value={currentPrompt.sfl.field.domain} onChange={(v: string) => handleUpdateSFL('field', 'domain', v)} error={validationErrors['field.domain']} />
                                    <InputField label="Process" value={currentPrompt.sfl.field.process} onChange={(v: string) => handleUpdateSFL('field', 'process', v)} error={validationErrors['field.process']} />
                                </div>

                                {/* Tenor */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-primary-500 flex items-center gap-2 border-b border-primary-500/20 pb-1">
                                        <Database className="w-3 h-3" /> TENOR
                                    </h4>
                                    <InputField label="Sender" value={currentPrompt.sfl.tenor.senderRole} onChange={(v: string) => handleUpdateSFL('tenor', 'senderRole', v)} error={validationErrors['tenor.senderRole']} />
                                    <InputField label="Receiver" value={currentPrompt.sfl.tenor.receiverRole} onChange={(v: string) => handleUpdateSFL('tenor', 'receiverRole', v)} error={validationErrors['tenor.receiverRole']} />
                                    <SelectField label="Power" value={currentPrompt.sfl.tenor.powerStatus} onChange={(v: string) => handleUpdateSFL('tenor', 'powerStatus', v)} options={['Equal', 'High-to-Low', 'Low-to-High']} />
                                    <SelectField label="Tone" value={currentPrompt.sfl.tenor.affect} onChange={(v: string) => handleUpdateSFL('tenor', 'affect', v)} options={['Neutral', 'Enthusiastic', 'Critical', 'Sarcastic', 'Professional']} />
                                </div>

                                {/* Mode */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-emerald-500 flex items-center gap-2 border-b border-emerald-500/20 pb-1">
                                        <Cpu className="w-3 h-3" /> MODE
                                    </h4>
                                    <SelectField label="Channel" value={currentPrompt.sfl.mode.channel} onChange={(v: string) => handleUpdateSFL('mode', 'channel', v)} options={['Written', 'Spoken', 'Visual']} />
                                    <SelectField label="Rhetoric" value={currentPrompt.sfl.mode.rhetoricalMode} onChange={(v: string) => handleUpdateSFL('mode', 'rhetoricalMode', v)} options={['Didactic', 'Persuasive', 'Descriptive', 'Narrative']} />
                                    <InputField label="Medium" value={currentPrompt.sfl.mode.medium} onChange={(v: string) => handleUpdateSFL('mode', 'medium', v)} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {view === 'lab' && (
                <div className="flex-1 overflow-hidden h-full">
                    {currentWorkflow ? (
                        <div className="h-full flex flex-col">
                             <div className="h-12 border-b border-slate-800 bg-slate-900/50 flex items-center px-4 gap-4">
                                 <button onClick={() => setCurrentWorkflow(null)} className="p-1 rounded hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
                                 <span className="font-bold text-slate-200">{currentWorkflow.name}</span>
                             </div>
                             <div className="flex-1 overflow-hidden">
                                 <WorkflowEngine 
                                    workflow={currentWorkflow}
                                    onSave={(w) => { db.workflows.save(w); setCurrentWorkflow(w); }}
                                    onRun={(w) => {
                                        // Mock run with status updates
                                        const runningW = { ...w, status: 'RUNNING', lastRun: Date.now() } as Workflow;
                                        setCurrentWorkflow(runningW);
                                        setTimeout(() => {
                                            setCurrentWorkflow({ ...runningW, status: 'COMPLETED' });
                                        }, 2000);
                                    }}
                                 />
                             </div>
                        </div>
                    ) : (
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <button 
                                    onClick={() => {
                                        const w = { id: `wf-${Date.now()}`, name: 'New Workflow', tasks: [], logs: [], status: 'IDLE' } as Workflow;
                                        db.workflows.save(w);
                                        setCurrentWorkflow(w);
                                    }}
                                    className="h-40 rounded-xl border-2 border-dashed border-slate-800 hover:border-primary-500/50 hover:bg-slate-800/30 flex flex-col items-center justify-center gap-3 text-slate-500 hover:text-primary-400 transition-all"
                                >
                                    <Box className="w-8 h-8" />
                                    <span className="font-medium">Create Workflow</span>
                                </button>
                                {workflows.map(w => (
                                    <div key={w.id} onClick={() => setCurrentWorkflow(w)} className="h-40 bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-primary-500/30 cursor-pointer transition-all">
                                        <h3 className="font-bold text-slate-200">{w.name}</h3>
                                        <p className="text-xs text-slate-500 mt-2">{w.tasks.length} Nodes</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div>
      </main>

      {/* Modals */}
      {modal === 'wizard' && (
          <ModalShell onClose={() => setModal(null)}>
              <PromptWizard 
                onCancel={() => setModal(null)}
                onComplete={(p) => {
                    const basePrompt = createNewPrompt();
                    const newP = { ...basePrompt, ...p };
                    db.prompts.save(newP as Prompt);
                    setPrompts(db.prompts.getAll());
                    setCurrentPrompt(newP as Prompt);
                    setModal(null);
                    setView('editor');
                }}
              />
          </ModalShell>
      )}

      {modal === 'settings' && (
          <ModalShell onClose={() => setModal(null)}>
              <SettingsModal
                settings={settings}
                onSave={(newSettings) => {
                    db.settings.save(newSettings);
                    setSettings(newSettings);
                }}
                onClose={() => setModal(null)}
              />
          </ModalShell>
      )}

    </div>
  );
};

export default App;