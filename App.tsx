/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useRef } from 'react';
import { Prompt, Workflow, SFLAnalysis, UserSettings } from './types';
import { db } from './services/storage';
import { generatePromptFromSFL, connectLiveAssistant, analyzePromptWithSFL, extractSFLFromContext } from './services/geminiService';
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
  Upload, Download, ShieldCheck, Loader2, X, Wand2
} from 'lucide-react';

// --- Modal Wrapper ---
const ModalShell = ({ children, onClose }: { children?: React.ReactNode, onClose: () => void }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="relative animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            {children}
            <button onClick={onClose} className="absolute -top-4 -right-4 text-slate-400 hover:text-white bg-slate-800 rounded-full p-1">
                <X className="w-4 h-4" />
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
    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between">
        {label}
        {error && <span className="text-[10px] text-red-400 font-normal animate-pulse">{error}</span>}
    </label>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full bg-slate-900 border rounded px-3 py-2 text-sm text-slate-200 outline-none transition-all placeholder:text-slate-600 ${
          error 
          ? 'border-red-900/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/20' 
          : 'border-slate-800 focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
      }`}
      placeholder={placeholder}
    />
  </div>
);

const SelectField = ({ label, value, onChange, options, error }: any) => (
  <div className="space-y-1.5">
    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between">
        {label}
        {error && <span className="text-[10px] text-red-400 font-normal animate-pulse">{error}</span>}
    </label>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full bg-slate-900 border rounded px-3 py-2 text-sm text-slate-200 outline-none appearance-none transition-all ${
          error 
          ? 'border-red-900/50 focus:border-red-500 focus:ring-1 focus:ring-red-500/20' 
          : 'border-slate-800 focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
      }`}
    >
      {options.map((opt: string) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);

const App: React.FC = () => {
  const [view, setView] = useState<'editor' | 'lab' | 'prompts' | 'docs'>('editor');
  const [modal, setModal] = useState<'wizard' | 'settings' | null>(null);
  
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
  const [liveSession, setLiveSession] = useState<any>(null);
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

  const playNextAudio = async () => {
    if (!audioContextRef.current || audioQueueRef.current.length === 0 || isPlayingRef.current) return;
    
    isPlayingRef.current = true;
    const buffer = audioQueueRef.current.shift()!;
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
        isPlayingRef.current = false;
        playNextAudio();
    };
    source.start();
  };

  const handleAudioData = async (base64: string) => {
    if (!audioContextRef.current) {
        // Init output audio context based on quality setting
        const currentSettings = db.settings.get();
        const sampleRate = currentSettings.live.quality === 'low' ? 16000 : 24000;
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
    }
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    try {
        const audioBuffer = await audioContextRef.current.decodeAudioData(bytes.buffer.slice(0)); 
        audioQueueRef.current.push(audioBuffer);
        playNextAudio();
    } catch (e) {
        console.error("Audio decode error", e);
    }
  };

  const handleToolCall = async (name: string, args: any) => {
      console.log(`Tool Call: ${name}`, args);
      if (name === 'updateSFL' && currentPrompt) {
         const { category, key, value } = args;
         const updatedPrompt = { ...currentPrompt };
         // @ts-ignore
         updatedPrompt.sfl[category][key] = value;
         setCurrentPrompt(updatedPrompt);
         db.prompts.save(updatedPrompt);
         return { success: true };
      }
      if (name === 'generate') {
          handleGenerate();
          return { success: true };
      }
      return { success: false };
  };

  const toggleLive = async () => {
      if (isLive) {
          setIsLive(false);
          setLiveStatus('disconnected');
          window.location.reload(); 
      } else {
          try {
              setLiveStatus('connecting');
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              const currentSettings = db.settings.get();
              
              const session = await connectLiveAssistant(
                  { voiceName: currentSettings.live.voice, model: currentSettings.live.model },
                  handleAudioData, 
                  handleToolCall, 
                  setLiveStatus
              );
              setLiveSession(session);
              setIsLive(true);
              
              // Input sampling rate
              const inputSampleRate = currentSettings.live.quality === 'low' ? 16000 : 24000; // Defaulting to standard
              const audioCtx = new AudioContext({ sampleRate: 16000 }); // Browser usually constraints this, but we ask
              
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
          } catch (e) {
              console.error(e);
              setLiveStatus('error');
          }
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
    setValidationErrors({});
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
        if (category === 'field') {
            // @ts-ignore - dynamic key access
            SFLFieldSchema.shape[key].parse(value);
        } else if (category === 'tenor') {
            // @ts-ignore
            SFLTenorSchema.shape[key].parse(value);
        } else if (category === 'mode') {
            // @ts-ignore
            SFLModeSchema.shape[key].parse(value);
        }

        // If validation passes, clear error for this field
        setValidationErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[errorKey];
            return newErrors;
        });

      } catch (err: any) {
          if (err instanceof z.ZodError) {
              setValidationErrors(prev => ({
                  ...prev,
                  [errorKey]: err.errors[0].message
              }));
          }
      }
  };
  
  const handleSave = () => {
      if (!currentPrompt) return;
      // Prevent save if errors exist? Optional. For now, we allow saving drafts.
      db.prompts.save({ ...currentPrompt, updatedAt: Date.now() });
      setPrompts(db.prompts.getAll()); 
  };

  const handleGenerate = async () => {
      if (!currentPrompt) return;
      setIsGenerating(true);
      try {
          // Note: In a real implementation we would pass settings.generation.model to generatePromptFromSFL
          const generated = await generatePromptFromSFL(currentPrompt.sfl, currentPrompt.content);
          const updated = {
              ...currentPrompt,
              content: generated,
              updatedAt: Date.now()
          };
          db.prompts.save(updated);
          setPrompts(db.prompts.getAll());
          setCurrentPrompt(db.prompts.getById(updated.id) || updated);
      } catch (e) {
          console.error("Generation failed", e);
      } finally {
          setIsGenerating(false);
      }
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
    } catch (e) {
        console.error("Analysis failed", e);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
          await db.system.importData(e.target.files[0]);
          window.location.reload();
      }
  };

  const handleSourceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !currentPrompt) return;

      setIsExtractingSFL(true);
      try {
          const extractedSFL = await extractSFLFromContext(file);
          // Update state with extracted values (merging carefully)
          const updated = {
              ...currentPrompt,
              sfl: {
                  field: { ...currentPrompt.sfl.field, ...extractedSFL.field },
                  tenor: { ...currentPrompt.sfl.tenor, ...extractedSFL.tenor },
                  mode: { ...currentPrompt.sfl.mode, ...extractedSFL.mode }
              }
          };
          setCurrentPrompt(updated);
          setValidationErrors({}); // Clear errors as we just auto-filled
      } catch (e) {
          console.error("SFL Extraction Failed", e);
          alert("Failed to extract SFL parameters from the file.");
      } finally {
          setIsExtractingSFL(false);
          if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
      }
  };

  const handleRunWorkflow = async (w: Workflow) => {
      // Simulation of a run
      const updated = { ...w, status: 'RUNNING', lastRun: Date.now() } as Workflow;
      setCurrentWorkflow(updated);
      
      // Mock execution delay
      setTimeout(() => {
          setCurrentWorkflow({ ...updated, status: 'COMPLETED' });
      }, 3000);
  };

  // --- Render ---

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans">
      
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col justify-between">
        <div>
            <div className="p-6">
                <h1 className="text-xl font-display font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
                    SFL Studio <span className="text-xs text-slate-500 font-normal">v2</span>
                </h1>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Professional IDE</p>
            </div>
            
            <nav className="px-3 space-y-1">
                <NavItem icon={Layers} label="Dashboard" active={view === 'prompts'} onClick={() => setView('prompts')} />
                <NavItem icon={Terminal} label="Editor" active={view === 'editor'} onClick={() => setView('editor')} />
                <NavItem icon={Box} label="The Lab" active={view === 'lab'} onClick={() => setView('lab')} />
            </nav>

            <div className="px-3 mt-4">
                <button 
                    onClick={() => setModal('wizard')}
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
                     <input type="file" className="hidden" onChange={handleImport} accept=".json" />
                 </label>
             </div>
             <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary-500 to-accent-500 flex items-center justify-center font-bold text-xs text-white">
                     DE
                 </div>
                 <div className="flex-1 min-w-0">
                     <p className="text-sm font-medium text-slate-200 truncate">DevUser</p>
                     <p className="text-xs text-slate-500 truncate">Local Mode</p>
                 </div>
                 <Settings onClick={() => setModal('settings')} className="w-4 h-4 text-slate-500 cursor-pointer hover:text-slate-200 transition-colors" />
             </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Top Bar */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/30 flex items-center justify-between px-6 backdrop-blur-sm z-10">
            <div className="flex items-center gap-4">
                {currentPrompt && view === 'editor' ? (
                    <>
                        <span className="text-slate-500 text-sm">Active Project /</span>
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
                    <span className="text-xs font-bold uppercase tracking-wider">{liveStatus === 'connected' ? 'Live Assistant' : liveStatus}</span>
                </button>

                <div className="h-6 w-px bg-slate-800 mx-2"></div>

                <button onClick={() => setModal('settings')} className="p-2 text-slate-400 hover:text-primary-400 transition-colors" title="Settings">
                    <Settings className="w-5 h-5" />
                </button>
                
                <button onClick={handleSave} className="p-2 text-slate-400 hover:text-primary-400 transition-colors" title="Save Project">
                    <Save className="w-5 h-5" />
                </button>
            </div>
        </header>

        {/* Views */}
        <div className="flex-1 overflow-auto p-6 relative">
            
            {view === 'prompts' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-300">
                    <button 
                        onClick={() => setModal('wizard')}
                        className="h-48 rounded-xl border-2 border-dashed border-slate-800 hover:border-primary-500/50 hover:bg-slate-800/30 flex flex-col items-center justify-center gap-3 text-slate-500 hover:text-primary-400 transition-all group"
                    >
                        <div className="p-3 bg-slate-900 rounded-full group-hover:scale-110 transition-transform shadow-lg shadow-black/50">
                             <Sparkles className="w-6 h-6" />
                        </div>
                        <span className="font-medium">AI Prompt Wizard</span>
                    </button>
                    {prompts.map(p => (
                        <div key={p.id} onClick={() => { setCurrentPrompt(p); setView('editor'); }} className="h-48 bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-primary-500/30 cursor-pointer transition-all flex flex-col justify-between group hover:shadow-xl hover:shadow-primary-900/10">
                            <div>
                                <h3 className="font-bold text-lg text-slate-200 group-hover:text-primary-400 transition-colors">{p.title}</h3>
                                <p className="text-xs text-slate-500 mt-1 font-mono">{new Date(p.updatedAt).toLocaleDateString()}</p>
                            </div>
                            <div className="space-y-2">
                                <div className="flex gap-2 text-xs">
                                    <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-400 border border-slate-700">{p.sfl.field.domain || 'N/A'}</span>
                                    <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-400 border border-slate-700">{p.sfl.mode.channel}</span>
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
            )}

            {view === 'editor' && currentPrompt && (
                <div className="grid grid-cols-12 gap-6 h-full">
                    
                    {/* SFL Matrix (Left) */}
                    <div className="col-span-12 lg:col-span-4 bg-slate-900/50 border border-slate-800 rounded-xl p-5 overflow-y-auto space-y-8 h-fit">
                        
                        {/* Auto-Fill Controls */}
                        <div className="flex justify-end mb-2">
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
                                className="text-[10px] flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-primary-300 rounded border border-slate-700 transition-colors"
                            >
                                {isExtractingSFL ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                {isExtractingSFL ? 'Analyzing Media...' : 'Auto-Fill from Source'}
                            </button>
                        </div>

                        <div className="relative">
                            <h2 className="text-sm font-bold text-accent-500 flex items-center gap-2 mb-4 border-b border-slate-800 pb-2 font-display">
                                <Activity className="w-4 h-4" /> FIELD (Subject)
                            </h2>
                            <div className="space-y-4">
                                <InputField 
                                    label="Domain" 
                                    value={currentPrompt.sfl.field.domain} 
                                    onChange={(v: string) => handleUpdateSFL('field', 'domain', v)}
                                    placeholder="e.g. Software Engineering"
                                    error={validationErrors['field.domain']}
                                />
                                <InputField 
                                    label="Process" 
                                    value={currentPrompt.sfl.field.process} 
                                    onChange={(v: string) => handleUpdateSFL('field', 'process', v)}
                                    placeholder="e.g. Explaining Recursion"
                                    error={validationErrors['field.process']}
                                />
                            </div>
                        </div>

                        <div className="relative">
                            <h2 className="text-sm font-bold text-primary-500 flex items-center gap-2 mb-4 border-b border-slate-800 pb-2 font-display">
                                <Database className="w-4 h-4" /> TENOR (Participants)
                            </h2>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <InputField 
                                        label="Sender Role" 
                                        value={currentPrompt.sfl.tenor.senderRole} 
                                        onChange={(v: string) => handleUpdateSFL('tenor', 'senderRole', v)} 
                                        placeholder="Expert"
                                        error={validationErrors['tenor.senderRole']}
                                    />
                                    <InputField 
                                        label="Receiver Role" 
                                        value={currentPrompt.sfl.tenor.receiverRole} 
                                        onChange={(v: string) => handleUpdateSFL('tenor', 'receiverRole', v)} 
                                        placeholder="Novice"
                                        error={validationErrors['tenor.receiverRole']}
                                    />
                                </div>
                                <SelectField 
                                    label="Power Status" 
                                    value={currentPrompt.sfl.tenor.powerStatus}
                                    onChange={(v: string) => handleUpdateSFL('tenor', 'powerStatus', v)}
                                    options={['Equal', 'High-to-Low', 'Low-to-High']}
                                    error={validationErrors['tenor.powerStatus']}
                                />
                                <SelectField 
                                    label="Affect (Tone)" 
                                    value={currentPrompt.sfl.tenor.affect}
                                    onChange={(v: string) => handleUpdateSFL('tenor', 'affect', v)}
                                    options={['Neutral', 'Enthusiastic', 'Critical', 'Sarcastic', 'Professional']}
                                    error={validationErrors['tenor.affect']}
                                />
                            </div>
                        </div>

                        <div className="relative">
                            <h2 className="text-sm font-bold text-emerald-500 flex items-center gap-2 mb-4 border-b border-slate-800 pb-2 font-display">
                                <Cpu className="w-4 h-4" /> MODE (Channel)
                            </h2>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <SelectField 
                                        label="Channel" 
                                        value={currentPrompt.sfl.mode.channel} 
                                        onChange={(v: string) => handleUpdateSFL('mode', 'channel', v)}
                                        options={['Written', 'Spoken', 'Visual']}
                                        error={validationErrors['mode.channel']}
                                    />
                                    <SelectField 
                                        label="Rhetorical Mode" 
                                        value={currentPrompt.sfl.mode.rhetoricalMode} 
                                        onChange={(v: string) => handleUpdateSFL('mode', 'rhetoricalMode', v)}
                                        options={['Didactic', 'Persuasive', 'Descriptive', 'Narrative']}
                                        error={validationErrors['mode.rhetoricalMode']}
                                    />
                                </div>
                                <InputField 
                                    label="Medium" 
                                    value={currentPrompt.sfl.mode.medium} 
                                    onChange={(v: string) => handleUpdateSFL('mode', 'medium', v)} 
                                    placeholder="e.g. Email"
                                    error={validationErrors['mode.medium']}
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                             <button 
                                onClick={handleGenerate}
                                disabled={isGenerating || Object.keys(validationErrors).length > 0}
                                className={`flex-1 py-3 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-lg shadow-lg shadow-primary-900/20 transition-all flex items-center justify-center gap-2 ${isGenerating || Object.keys(validationErrors).length > 0 ? 'opacity-75 cursor-not-allowed' : ''}`}
                             >
                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                <span>{isGenerating ? 'GENERATING...' : 'GENERATE'}</span>
                             </button>
                             <button 
                                onClick={handleAnalyze}
                                disabled={isAnalyzing}
                                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg border border-slate-700 transition-all flex items-center justify-center"
                                title="Analyze Quality with Gemini Pro"
                             >
                                {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                             </button>
                        </div>
                    </div>

                    {/* Editor & Output (Right) */}
                    <div className="col-span-12 lg:col-span-8 flex flex-col gap-4 min-h-[500px]">
                        
                        {/* Analysis Panel (Conditional) */}
                        {(analysis || currentPrompt.lastAnalysis) && (
                            <div className="animate-in slide-in-from-top-4 duration-300">
                                <AnalysisPanel analysis={analysis || currentPrompt.lastAnalysis!} />
                            </div>
                        )}

                        {/* Prompt Output */}
                        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-xl">
                            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <FileText className="w-4 h-4" /> Prompt Output
                                </span>
                                <span className="text-xs font-mono text-slate-600">{currentPrompt.content.length} chars</span>
                            </div>
                            <textarea 
                                value={currentPrompt.content}
                                onChange={(e) => setCurrentPrompt({...currentPrompt, content: e.target.value})}
                                className="flex-1 bg-slate-900 p-6 text-slate-200 font-mono text-sm leading-relaxed outline-none resize-none focus:bg-slate-900/80 transition-colors"
                                placeholder="Generated prompt will appear here..."
                            />
                        </div>

                        {/* Palimpsest (History/Diff) */}
                        <div className="h-64 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <Terminal className="w-4 h-4" /> Palimpsest (Version History)
                                </span>
                            </div>
                            <div className="flex-1 flex overflow-hidden">
                                <div className="w-1/3 border-r border-slate-800 overflow-y-auto">
                                    {currentPrompt.history.map((ver, idx) => (
                                        <div 
                                            key={idx} 
                                            onClick={() => setCurrentPrompt({ ...currentPrompt, content: ver.content })}
                                            className="p-3 border-b border-slate-800 cursor-pointer hover:bg-slate-800/50 transition-colors"
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-bold text-slate-400">v{ver.version}</span>
                                                <span className="text-[10px] text-slate-600">{new Date(ver.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 line-clamp-1">{ver.content}</p>
                                        </div>
                                    ))}
                                    {currentPrompt.history.length === 0 && (
                                        <div className="p-4 text-center text-xs text-slate-600 italic">No history yet.</div>
                                    )}
                                </div>
                                <div className="w-2/3 p-4 bg-slate-950 overflow-auto">
                                    {currentPrompt.history.length > 0 ? (
                                        <DiffViewer 
                                            oldText={currentPrompt.history[0]?.content || ''} 
                                            newText={currentPrompt.content} 
                                        />
                                    ) : (
                                        <div className="text-slate-600 text-xs text-center mt-10">Make changes to see diffs here.</div>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {view === 'lab' && (
                <div className="h-full">
                    {currentWorkflow ? (
                        <div className="h-full flex flex-col">
                             <div className="flex items-center justify-between mb-4">
                                 <button onClick={() => setCurrentWorkflow(null)} className="text-xs text-slate-500 hover:text-white uppercase tracking-wider">← Back to Lab</button>
                                 <h2 className="text-lg font-bold text-slate-200">{currentWorkflow.name}</h2>
                             </div>
                             <div className="flex-1">
                                 <WorkflowEngine 
                                    workflow={currentWorkflow}
                                    onSave={(w) => {
                                        db.workflows.save(w);
                                        setCurrentWorkflow(w);
                                    }}
                                    onRun={handleRunWorkflow}
                                 />
                             </div>
                        </div>
                    ) : (
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
                    // @ts-ignore
                    db.prompts.save(newP);
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