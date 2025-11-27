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
  Menu, PanelRightOpen, PanelRight, ChevronRight, Play, Globe, History, LayoutTemplate, MoreHorizontal, User as UserIcon
} from 'lucide-react';

// --- Helper for Raw PCM Decoding ---
function decodeRawPCM(data: Uint8Array, ctx: AudioContext, sampleRate: number = 24000, numChannels: number = 1): AudioBuffer {
  const byteLength = data.byteLength;
  // Ensure even length for 16-bit samples
  const alignedLength = byteLength - (byteLength % 2);
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, alignedLength / 2);
  
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert int16 to float32 (-1.0 to 1.0)
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Modal Wrapper ---
const ModalShell = ({ children, onClose }: { children?: React.ReactNode, onClose: () => void }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 p-4">
        <div className="relative animate-in zoom-in-95 duration-200 w-full max-w-5xl max-h-[90vh] h-full overflow-hidden rounded-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            {children}
            <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-950/50 backdrop-blur rounded-full p-2 z-50 hover:bg-red-500/20 transition-all">
                <X className="w-5 h-5" />
            </button>
        </div>
    </div>
);

const NavItem = ({ icon: Icon, label, active, onClick, collapsed }: any) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group relative ${
      active 
        ? 'bg-primary-600/10 text-primary-400' 
        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
    }`}
    title={collapsed ? label : ''}
  >
    <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5px]' : ''}`} />
    {!collapsed && <span className="font-medium text-sm">{label}</span>}
    {active && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-500"></div>}
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
      className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-700 ${
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
      className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-xs text-slate-200 outline-none appearance-none transition-all ${
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
  // Views & UI State
  const [view, setView] = useState<'editor' | 'lab' | 'prompts'>('prompts');
  const [modal, setModal] = useState<'wizard' | 'settings' | null>(null);
  const [editorTab, setEditorTab] = useState<'edit' | 'history' | 'analysis'>('edit');
  const [showInspector, setShowInspector] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Data State
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState<Prompt | null>(null);
  const [analysis, setAnalysis] = useState<SFLAnalysis | null>(null);
  const [settings, setSettings] = useState<UserSettings>(db.settings.get());
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null);
  
  // Processing State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtractingSFL, setIsExtractingSFL] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Live State
  const [isLive, setIsLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState('disconnected');
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Initialization ---
  useEffect(() => {
    setPrompts(db.prompts.getAll());
    setWorkflows(db.workflows.getAll());
    setSettings(db.settings.get());
  }, []);

  // --- Audio Logic ---
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
        // Fix: Use manual PCM decoding instead of native decodeAudioData which fails on raw PCM stream
        const audioBuffer = decodeRawPCM(bytes, audioContextRef.current); 
        audioQueueRef.current.push(audioBuffer);
        playNextAudio();
    } catch (e) { console.error("Audio decoding error:", e); }
  };

  const toggleLive = async () => {
      if (isLive) {
          setIsLive(false); setLiveStatus('disconnected'); window.location.reload(); 
      } else {
          try {
              setLiveStatus('connecting');
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              const sessionPromise = connectLiveAssistant(
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
              // Ensure connection is established
              await sessionPromise;
              
              setIsLive(true);
              const audioCtx = new AudioContext({ sampleRate: 16000 });
              const source = audioCtx.createMediaStreamSource(stream);
              const processor = audioCtx.createScriptProcessor(4096, 1, 1);
              processor.onaudioprocess = (e) => {
                  const inputData = e.inputBuffer.getChannelData(0);
                  const pcmData = new Int16Array(inputData.length);
                  for (let i = 0; i < inputData.length; i++) pcmData[i] = inputData[i] * 0x7fff;
                  const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
                  sessionPromise.then(s => s.sendRealtimeInput({ media: { mimeType: "audio/pcm;rate=16000", data: base64 } }));
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
        title: 'Untitled Project',
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
          if (err instanceof z.ZodError && err.issues && err.issues.length > 0) {
              setValidationErrors(prev => ({ ...prev, [errorKey]: err.issues[0].message }));
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
    setEditorTab('analysis');
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
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans text-slate-200">
      
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-slate-950/80 backdrop-blur border-b border-slate-800 z-50 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 -ml-2 text-slate-400 hover:text-white">
                  <Menu className="w-6 h-6" />
              </button>
              <h1 className="font-display font-bold text-slate-200 tracking-tight">SFL Studio</h1>
          </div>
          {isLive && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>}
      </div>

      {/* Main Sidebar (Desktop) */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-950 border-r border-slate-800 flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 hidden lg:block border-b border-slate-900">
             <div className="flex items-center gap-2 mb-1">
                 <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary-600 to-indigo-600 flex items-center justify-center text-white font-bold font-display shadow-lg shadow-primary-900/20">SFL</div>
                 <h1 className="text-lg font-display font-bold text-slate-100">Studio</h1>
             </div>
        </div>

        <nav className="p-3 space-y-1 mt-14 lg:mt-4 flex-1">
             <div className="mb-4 px-3">
                 <button 
                    onClick={() => { setModal('wizard'); setIsMobileMenuOpen(false); }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-slate-950 rounded-lg hover:bg-slate-200 transition-all font-bold text-sm shadow-xl shadow-white/5"
                 >
                    <Sparkles className="w-4 h-4" />
                    <span>New Project</span>
                 </button>
             </div>
             
             <NavItem icon={Layers} label="Dashboard" active={view === 'prompts'} onClick={() => { setView('prompts'); setIsMobileMenuOpen(false); }} />
             <NavItem icon={Terminal} label="Editor" active={view === 'editor'} onClick={() => { 
                 if (!currentPrompt && prompts.length > 0) setCurrentPrompt(prompts[0]);
                 setView('editor'); 
                 setIsMobileMenuOpen(false); 
            }} />
             <NavItem icon={Box} label="The Lab" active={view === 'lab'} onClick={() => { setView('lab'); setIsMobileMenuOpen(false); }} />
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-800">
             <button onClick={() => setModal('settings')} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-900 transition-colors group">
                 <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 group-hover:border-primary-500 transition-colors">
                     <UserIcon className="w-4 h-4 text-slate-400" />
                 </div>
                 <div className="flex-1 text-left min-w-0">
                     <p className="text-xs font-bold text-slate-300 truncate">Settings</p>
                     <p className="text-[10px] text-slate-500 truncate">{settings.generation.provider}</p>
                 </div>
                 <Settings className="w-4 h-4 text-slate-500 group-hover:text-primary-400" />
             </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative bg-slate-950">
         
         {/* Top Bar (Desktop) */}
         <header className="hidden lg:flex h-14 border-b border-slate-800 bg-slate-950 items-center justify-between px-6 z-10 sticky top-0">
             <div className="flex items-center gap-4 text-sm">
                 {view === 'editor' && currentPrompt ? (
                     <div className="flex items-center gap-2 text-slate-400">
                         <button onClick={() => setView('prompts')} className="hover:text-white transition-colors">Projects</button>
                         <ChevronRight className="w-4 h-4 text-slate-600" />
                         <span className="font-bold text-slate-200">{currentPrompt.title}</span>
                         <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700 font-mono">v{currentPrompt.version}</span>
                     </div>
                 ) : (
                    <span className="font-bold text-slate-500 uppercase tracking-widest text-xs">
                        {view === 'lab' ? 'Workflow Laboratory' : 'Project Dashboard'}
                    </span>
                 )}
             </div>

             <div className="flex items-center gap-3">
                 <button 
                    onClick={toggleLive}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                        isLive 
                        ? 'bg-red-500/10 border-red-500/50 text-red-400 animate-pulse' 
                        : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-primary-400 hover:border-primary-500/50'
                    }`}
                 >
                    {isLive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                    <span className="text-[10px] font-bold uppercase tracking-wider">{liveStatus === 'connected' ? 'Live' : 'Voice'}</span>
                 </button>
             </div>
         </header>

         {/* Content Viewport */}
         <div className="flex-1 overflow-hidden relative">
            
            {/* --- DASHBOARD VIEW --- */}
            {view === 'prompts' && (
                <div className="h-full overflow-y-auto p-4 md:p-8 pt-16 lg:pt-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                        {/* New Project Action Card */}
                        <button 
                            onClick={() => setModal('wizard')}
                            className="group relative h-56 rounded-2xl bg-gradient-to-br from-primary-900/30 to-slate-900 border border-primary-500/30 hover:border-primary-500/60 transition-all flex flex-col items-center justify-center gap-4 overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-primary-600/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="p-4 bg-primary-500/10 rounded-full group-hover:scale-110 transition-transform duration-300">
                                <Wand2 className="w-8 h-8 text-primary-400" />
                            </div>
                            <div className="text-center">
                                <span className="block font-display font-bold text-lg text-slate-200">New Project</span>
                                <span className="text-xs text-slate-500">Launch AI Wizard</span>
                            </div>
                        </button>

                        {prompts.map(p => (
                            <div key={p.id} onClick={() => { setCurrentPrompt(p); setView('editor'); }} className="group relative h-56 bg-slate-900 rounded-2xl border border-slate-800 hover:border-slate-600 transition-all cursor-pointer p-6 flex flex-col justify-between hover:shadow-2xl hover:-translate-y-1">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="p-2 rounded bg-slate-800 text-slate-400 group-hover:bg-primary-500 group-hover:text-white transition-colors">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        {p.lastAnalysis && (
                                            <div className={`text-xs font-bold px-2 py-1 rounded-full border ${p.lastAnalysis.score >= 80 ? 'bg-emerald-950 border-emerald-900 text-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                                                {p.lastAnalysis.score}
                                            </div>
                                        )}
                                    </div>
                                    <h3 className="font-bold text-lg text-slate-200 group-hover:text-primary-400 transition-colors line-clamp-2">{p.title}</h3>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-950 px-2 py-1 rounded border border-slate-800">{p.sfl.mode.channel}</span>
                                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-950 px-2 py-1 rounded border border-slate-800">{p.sfl.tenor.affect}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-600 font-mono">Updated {new Date(p.updatedAt).toLocaleDateString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* --- EDITOR VIEW --- */}
            {view === 'editor' && currentPrompt && (
                <div className="flex h-full pt-16 lg:pt-0">
                    {/* Main Editor Pane */}
                    <div className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
                        {/* Editor Tabs */}
                        <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/30">
                            <div className="flex h-full">
                                {[
                                    { id: 'edit', label: 'Editor', icon: Terminal },
                                    { id: 'analysis', label: 'Analysis', icon: ShieldCheck },
                                    { id: 'history', label: 'History', icon: History }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setEditorTab(tab.id as any)}
                                        className={`flex items-center gap-2 px-5 h-full text-xs font-bold border-r border-slate-800 transition-colors ${
                                            editorTab === tab.id 
                                            ? 'bg-slate-950 text-primary-400 border-t-2 border-t-primary-500' 
                                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900 border-t-2 border-t-transparent'
                                        }`}
                                    >
                                        <tab.icon className="w-4 h-4" />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 lg:hidden">
                                <button onClick={() => setShowInspector(!showInspector)} className={`p-2 rounded ${showInspector ? 'text-primary-400 bg-primary-500/10' : 'text-slate-400'}`}>
                                    <PanelRightOpen className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Pane Content */}
                        <div className="flex-1 overflow-hidden relative">
                            {/* Text Editor */}
                            <div className={`absolute inset-0 p-4 md:p-8 overflow-auto ${editorTab === 'edit' ? 'block' : 'hidden'}`}>
                                <div className="max-w-4xl mx-auto h-full flex flex-col gap-4">
                                    <input 
                                        className="bg-transparent text-2xl font-bold font-display text-slate-200 outline-none placeholder:text-slate-700"
                                        value={currentPrompt.title}
                                        onChange={(e) => setCurrentPrompt({...currentPrompt, title: e.target.value})}
                                        placeholder="Project Title..."
                                    />
                                    <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm relative group">
                                        <textarea 
                                            value={currentPrompt.content}
                                            onChange={(e) => setCurrentPrompt({...currentPrompt, content: e.target.value})}
                                            className="w-full h-full bg-slate-900 p-6 text-slate-200 font-mono text-sm leading-relaxed outline-none resize-none"
                                            placeholder="Write your prompt here..."
                                        />
                                        <div className="absolute bottom-2 right-2 px-3 py-1 bg-slate-950/80 backdrop-blur border border-slate-800 rounded-full text-[10px] text-slate-500 pointer-events-none">
                                            {currentPrompt.content.length} chars
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Analysis View */}
                            <div className={`absolute inset-0 p-4 md:p-8 overflow-auto bg-slate-950 ${editorTab === 'analysis' ? 'block' : 'hidden'}`}>
                                <div className="max-w-3xl mx-auto">
                                    {(analysis || currentPrompt.lastAnalysis) ? (
                                        <AnalysisPanel analysis={analysis || currentPrompt.lastAnalysis!} />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                                            <ShieldCheck className="w-12 h-12 mb-4 opacity-20" />
                                            <p>No analysis generated yet.</p>
                                            <button onClick={handleAnalyze} className="mt-4 text-primary-400 hover:text-primary-300 text-sm font-bold">Run Analysis</button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* History View */}
                            <div className={`absolute inset-0 p-4 md:p-8 overflow-auto bg-slate-950 ${editorTab === 'history' ? 'block' : 'hidden'}`}>
                                <div className="max-w-3xl mx-auto">
                                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Version History</h3>
                                    {currentPrompt.history.length > 0 ? (
                                        <div className="space-y-4">
                                            {currentPrompt.history.map((ver, idx) => (
                                                <div key={idx} className="space-y-2">
                                                    <div className="flex justify-between text-xs text-slate-500">
                                                        <span>v{ver.version}</span>
                                                        <span>{new Date(ver.timestamp).toLocaleString()}</span>
                                                    </div>
                                                    <DiffViewer oldText={currentPrompt.history[idx+1]?.content || ''} newText={ver.content} />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-slate-600 italic text-sm">No history recorded yet.</p>
                                    )}
                                </div>
                            </div>

                            {/* Sticky Action Bar */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-full shadow-2xl z-30">
                                <button 
                                    onClick={handleAnalyze}
                                    disabled={isAnalyzing}
                                    className="px-4 py-2 rounded-full hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
                                >
                                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                    Analyze
                                </button>
                                <div className="w-px h-4 bg-slate-700"></div>
                                <button onClick={handleSave} className="p-2 hover:bg-slate-700 rounded-full text-slate-300 transition-colors" title="Save">
                                    <Save className="w-4 h-4" />
                                </button>
                                <div className="w-px h-4 bg-slate-700"></div>
                                <button 
                                    onClick={handleGenerate}
                                    disabled={isGenerating || Object.keys(validationErrors).length > 0}
                                    className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-full text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    Generate
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right Inspector Sidebar (Collapsible) */}
                    <div className={`fixed inset-y-0 right-0 w-80 bg-slate-900 border-l border-slate-800 transition-transform duration-300 z-20 lg:relative lg:translate-x-0 pt-14 lg:pt-0 flex flex-col ${showInspector ? 'translate-x-0' : 'translate-x-full lg:hidden'}`}>
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                            <h3 className="font-bold text-slate-200 font-display text-sm">SFL Inspector</h3>
                            <button onClick={() => setShowInspector(false)} className="lg:hidden text-slate-500"><X className="w-4 h-4" /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-6">
                            {/* Auto Fill */}
                            <div className="p-4 rounded-xl bg-slate-950 border border-dashed border-slate-700 text-center hover:border-slate-500 transition-colors group">
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
                                    className="text-xs text-primary-400 group-hover:text-primary-300 font-medium flex flex-col items-center gap-2 w-full"
                                >
                                    {isExtractingSFL ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                    {isExtractingSFL ? 'Extracting...' : 'Auto-Fill from Context'}
                                </button>
                            </div>

                            {/* Field */}
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-bold text-accent-500 flex items-center gap-2 uppercase tracking-widest">
                                    <Activity className="w-3 h-3" /> Field (Subject)
                                </h4>
                                <div className="space-y-3 pl-2 border-l border-slate-800">
                                    <InputField label="Domain" value={currentPrompt.sfl.field.domain} onChange={(v: string) => handleUpdateSFL('field', 'domain', v)} error={validationErrors['field.domain']} />
                                    <InputField label="Process" value={currentPrompt.sfl.field.process} onChange={(v: string) => handleUpdateSFL('field', 'process', v)} error={validationErrors['field.process']} />
                                </div>
                            </div>

                            {/* Tenor */}
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-bold text-primary-500 flex items-center gap-2 uppercase tracking-widest">
                                    <Database className="w-3 h-3" /> Tenor (Roles)
                                </h4>
                                <div className="space-y-3 pl-2 border-l border-slate-800">
                                    <InputField label="Sender" value={currentPrompt.sfl.tenor.senderRole} onChange={(v: string) => handleUpdateSFL('tenor', 'senderRole', v)} error={validationErrors['tenor.senderRole']} />
                                    <InputField label="Receiver" value={currentPrompt.sfl.tenor.receiverRole} onChange={(v: string) => handleUpdateSFL('tenor', 'receiverRole', v)} error={validationErrors['tenor.receiverRole']} />
                                    <SelectField label="Power" value={currentPrompt.sfl.tenor.powerStatus} onChange={(v: string) => handleUpdateSFL('tenor', 'powerStatus', v)} options={['Equal', 'High-to-Low', 'Low-to-High']} />
                                    <SelectField label="Tone" value={currentPrompt.sfl.tenor.affect} onChange={(v: string) => handleUpdateSFL('tenor', 'affect', v)} options={['Neutral', 'Enthusiastic', 'Critical', 'Sarcastic', 'Professional']} />
                                </div>
                            </div>

                            {/* Mode */}
                            <div className="space-y-3">
                                <h4 className="text-[10px] font-bold text-emerald-500 flex items-center gap-2 uppercase tracking-widest">
                                    <Cpu className="w-3 h-3" /> Mode (Channel)
                                </h4>
                                <div className="space-y-3 pl-2 border-l border-slate-800">
                                    <SelectField label="Channel" value={currentPrompt.sfl.mode.channel} onChange={(v: string) => handleUpdateSFL('mode', 'channel', v)} options={['Written', 'Spoken', 'Visual']} />
                                    <SelectField label="Rhetoric" value={currentPrompt.sfl.mode.rhetoricalMode} onChange={(v: string) => handleUpdateSFL('mode', 'rhetoricalMode', v)} options={['Didactic', 'Persuasive', 'Descriptive', 'Narrative']} />
                                    <InputField label="Medium" value={currentPrompt.sfl.mode.medium} onChange={(v: string) => handleUpdateSFL('mode', 'medium', v)} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- LAB VIEW --- */}
            {view === 'lab' && (
                <div className="flex-1 overflow-hidden h-full pt-16 lg:pt-0 bg-slate-950">
                    {currentWorkflow ? (
                        <div className="h-full flex flex-col">
                             <div className="h-12 border-b border-slate-800 bg-slate-900/50 flex items-center px-4 gap-4 z-10">
                                 <button onClick={() => setCurrentWorkflow(null)} className="p-1 rounded hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
                                 <span className="font-bold text-slate-200 text-sm">{currentWorkflow.name}</span>
                             </div>
                             <div className="flex-1 overflow-hidden relative">
                                 <WorkflowEngine 
                                    workflow={currentWorkflow}
                                    onSave={(w) => { db.workflows.save(w); setCurrentWorkflow(w); }}
                                    onRun={(w) => {
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
                        <div className="p-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <button 
                                    onClick={() => {
                                        const w = { id: `wf-${Date.now()}`, name: 'New Workflow', tasks: [], logs: [], status: 'IDLE' } as Workflow;
                                        db.workflows.save(w);
                                        setCurrentWorkflow(w);
                                    }}
                                    className="h-40 rounded-xl border border-dashed border-slate-700 hover:border-primary-500 hover:bg-slate-900/50 flex flex-col items-center justify-center gap-3 text-slate-500 hover:text-primary-400 transition-all group"
                                >
                                    <div className="p-3 bg-slate-900 rounded-full group-hover:scale-110 transition-transform"><PlusIcon /></div>
                                    <span className="font-bold">Create Workflow</span>
                                </button>
                                {workflows.map(w => (
                                    <div key={w.id} onClick={() => setCurrentWorkflow(w)} className="h-40 bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-600 cursor-pointer transition-all flex flex-col justify-between group hover:shadow-lg">
                                        <div className="flex justify-between items-start">
                                            <div className="p-2 bg-slate-800 rounded text-slate-400 group-hover:text-primary-400 transition-colors"><Box className="w-5 h-5" /></div>
                                            <span className="text-xs text-slate-600 bg-slate-950 px-2 py-1 rounded">{w.status}</span>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-200 group-hover:text-white transition-colors">{w.name}</h3>
                                            <p className="text-xs text-slate-500 mt-1">{w.tasks.length} Nodes</p>
                                        </div>
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

const PlusIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
)

export default App;