/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect } from 'react';
import { UserSettings, AIProvider, AIModel } from '../types';
import { getAvailableModels } from '../services/orchestrator';
import { Mic, Cpu, Save, Loader2, AlertCircle, Key, Globe, Server, CheckCircle, Wifi } from 'lucide-react';

interface SettingsModalProps {
  settings: UserSettings;
  onSave: (settings: UserSettings) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ settings: initialSettings, onSave, onClose }) => {
  const [settings, setSettings] = useState<UserSettings>(initialSettings);
  const [activeTab, setActiveTab] = useState<'providers' | 'generation' | 'live'>('providers');
  
  // Model Loading State
  const [models, setModels] = useState<AIModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  useEffect(() => {
    const loadModels = async () => {
      setIsLoadingModels(true);
      try {
          const fetchedModels = await getAvailableModels();
          setModels(fetchedModels);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoadingModels(false);
      }
    };
    loadModels();
  }, [settings.apiKeys, settings.ollamaBaseUrl]);

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  const updateApiKey = (provider: string, key: string) => {
      setSettings(prev => ({
          ...prev,
          apiKeys: { ...prev.apiKeys, [provider]: key }
      }));
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center bg-slate-950 sticky top-0 z-10">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg text-primary-400">
                <Cpu className="w-5 h-5" />
            </div>
            <div>
                <h3 className="font-bold text-lg font-display">System Configuration</h3>
                <p className="text-xs text-slate-500">Manage AI providers and inference behavior</p>
            </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
            <span className="sr-only">Close</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/50">
        {[
            { id: 'providers', label: 'AI Providers', icon: Server },
            { id: 'generation', label: 'Models & Grounding', icon: Globe },
            { id: 'live', label: 'Live Assistant', icon: Mic }
        ].map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-bold transition-all relative ${
                    activeTab === tab.id
                    ? 'text-primary-400 bg-slate-800/50'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                }`}
            >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500"></div>}
            </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
          
          {activeTab === 'providers' && (
              <div className="space-y-8 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-2">
                  <div className="bg-indigo-900/10 border border-indigo-500/20 p-4 rounded-xl flex gap-3">
                      <Key className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                      <div>
                          <h4 className="font-bold text-indigo-300 text-sm">Provider API Keys</h4>
                          <p className="text-xs text-indigo-300/60 mt-1">
                              Keys are stored securely in your browser's local storage. They are never sent to our servers, only directly to the AI providers.
                          </p>
                      </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Google */}
                      <div className="space-y-2">
                          <label className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                              <span>Google Gemini</span>
                              {settings.apiKeys.google || process.env.API_KEY ? <CheckCircle className="w-3 h-3 text-emerald-500" /> : null}
                          </label>
                          <input 
                            type="password" 
                            value={settings.apiKeys.google || ''}
                            onChange={(e) => updateApiKey('google', e.target.value)}
                            placeholder={process.env.API_KEY ? "Using env variable (Hidden)" : "AIzaSy..."}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition-all"
                          />
                      </div>

                      {/* OpenRouter */}
                      <div className="space-y-2">
                          <label className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                              <span>OpenRouter</span>
                              {settings.apiKeys.openrouter ? <CheckCircle className="w-3 h-3 text-emerald-500" /> : null}
                          </label>
                          <input 
                            type="password" 
                            value={settings.apiKeys.openrouter || ''}
                            onChange={(e) => updateApiKey('openrouter', e.target.value)}
                            placeholder="sk-or-..."
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition-all"
                          />
                      </div>

                      {/* Mistral */}
                      <div className="space-y-2">
                          <label className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                              <span>Mistral AI</span>
                              {settings.apiKeys.mistral ? <CheckCircle className="w-3 h-3 text-emerald-500" /> : null}
                          </label>
                          <input 
                            type="password" 
                            value={settings.apiKeys.mistral || ''}
                            onChange={(e) => updateApiKey('mistral', e.target.value)}
                            placeholder="Key..."
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition-all"
                          />
                      </div>

                      {/* Ollama */}
                      <div className="space-y-2">
                          <label className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
                              <span>Ollama Base URL</span>
                              <Wifi className="w-3 h-3 text-slate-600" />
                          </label>
                          <input 
                            type="text" 
                            value={settings.ollamaBaseUrl || ''}
                            onChange={(e) => setSettings({...settings, ollamaBaseUrl: e.target.value})}
                            placeholder="http://localhost:11434/v1"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition-all font-mono"
                          />
                      </div>
                  </div>
              </div>
          )}

          {activeTab === 'generation' && (
              <div className="space-y-8 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-2">
                  
                  {/* Grounding Section */}
                  <div className={`p-5 rounded-xl border transition-all ${settings.useSearchGrounding ? 'bg-blue-950/20 border-blue-500/30' : 'bg-slate-900 border-slate-800'}`}>
                      <div className="flex items-start justify-between">
                          <div className="flex gap-3">
                             <div className={`p-2 rounded-lg ${settings.useSearchGrounding ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                                 <Globe className="w-5 h-5" />
                             </div>
                             <div>
                                <h4 className={`font-bold text-sm ${settings.useSearchGrounding ? 'text-blue-200' : 'text-slate-400'}`}>Google Search Grounding</h4>
                                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                                    Inject real-world, up-to-date information from Google Search into your prompt generation workflow.
                                    {settings.useSearchGrounding && <span className="block mt-1 text-blue-400 font-medium">Note: Enforces Google Provider.</span>}
                                </p>
                             </div>
                          </div>
                          
                          <button 
                            onClick={() => {
                                const newVal = !settings.useSearchGrounding;
                                if (newVal) {
                                    setSettings(prev => ({
                                        ...prev,
                                        useSearchGrounding: true,
                                        generation: { ...prev.generation, provider: AIProvider.GOOGLE }
                                    }));
                                } else {
                                    setSettings(prev => ({ ...prev, useSearchGrounding: false }));
                                }
                            }}
                            className={`w-14 h-7 rounded-full transition-colors relative focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 ${settings.useSearchGrounding ? 'bg-blue-600' : 'bg-slate-700'}`}
                          >
                              <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${settings.useSearchGrounding ? 'left-8' : 'left-1'}`}></div>
                          </button>
                      </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Generation Column */}
                      <div className="space-y-4">
                          <h4 className="text-xs font-bold text-primary-400 uppercase tracking-widest border-b border-primary-500/20 pb-2 flex items-center gap-2">
                              Generation Model
                          </h4>
                          
                          <div className="space-y-4">
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-slate-500">Provider</label>
                                  <select 
                                      value={settings.generation.provider}
                                      onChange={(e) => setSettings({...settings, generation: { ...settings.generation, provider: e.target.value as AIProvider }})}
                                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:border-primary-500 outline-none"
                                      disabled={settings.useSearchGrounding}
                                  >
                                      {Object.values(AIProvider).map(p => (
                                          <option key={p} value={p}>{p.toUpperCase()}</option>
                                      ))}
                                  </select>
                              </div>
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-slate-500">Model</label>
                                  <select 
                                      value={settings.generation.model}
                                      onChange={(e) => setSettings({...settings, generation: { ...settings.generation, model: e.target.value }})}
                                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:border-primary-500 outline-none"
                                  >
                                      {models
                                        .filter(m => m.provider === settings.generation.provider)
                                        .map(m => <option key={m.name} value={m.name}>{m.displayName}</option>)
                                      }
                                  </select>
                              </div>
                          </div>
                      </div>

                      {/* Analysis Column */}
                      <div className="space-y-4">
                          <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-emerald-500/20 pb-2 flex items-center gap-2">
                              Analysis Model
                          </h4>
                          <div className="space-y-4">
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-slate-500">Provider</label>
                                  <select 
                                      value={settings.analysis.provider}
                                      onChange={(e) => setSettings({...settings, analysis: { ...settings.analysis, provider: e.target.value as AIProvider }})}
                                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none"
                                  >
                                      {Object.values(AIProvider).map(p => (
                                          <option key={p} value={p}>{p.toUpperCase()}</option>
                                      ))}
                                  </select>
                              </div>
                              <div className="space-y-2">
                                  <label className="text-xs font-bold text-slate-500">Model</label>
                                  <select 
                                      value={settings.analysis.model}
                                      onChange={(e) => setSettings({...settings, analysis: { ...settings.analysis, model: e.target.value }})}
                                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:border-emerald-500 outline-none"
                                  >
                                      {models
                                        .filter(m => m.provider === settings.analysis.provider)
                                        .map(m => <option key={m.name} value={m.name}>{m.displayName}</option>)
                                      }
                                  </select>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          )}

          {activeTab === 'live' && (
              <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-2">
                  <div className="p-4 bg-amber-900/10 border border-amber-500/20 rounded-lg flex gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      <p className="text-xs text-amber-200/80">
                          Live Assistant features are currently optimized for Google Gemini models only. Other providers may be supported in future updates.
                      </p>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Voice Personality</label>
                        <div className="grid grid-cols-3 gap-2">
                            {['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].map(v => (
                                <button
                                    key={v}
                                    onClick={() => setSettings({ ...settings, live: { ...settings.live, voice: v } })}
                                    className={`px-3 py-2 rounded-lg text-sm border transition-all ${
                                        settings.live.voice === v 
                                        ? 'bg-primary-600/20 border-primary-500 text-primary-300' 
                                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                                    }`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inference Model</label>
                        <select
                            value={settings.live.model}
                            onChange={(e) => setSettings({ ...settings, live: { ...settings.live, model: e.target.value } })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:border-primary-500 outline-none"
                        >
                            {models
                                .filter(m => m.provider === AIProvider.GOOGLE && m.name.includes('audio'))
                                .map(m => (
                                <option key={m.name} value={m.name}>{m.displayName}</option>
                            ))}
                        </select>
                      </div>
                  </div>
              </div>
          )}
      </div>

      {/* Footer */}
      <div className="p-5 bg-slate-950 border-t border-slate-800 flex justify-end gap-3 sticky bottom-0">
        <button onClick={onClose} className="px-5 py-2.5 text-slate-400 hover:text-white text-sm font-medium transition-colors">Cancel</button>
        <button 
          onClick={handleSave}
          className="px-6 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white rounded-xl flex items-center gap-2 text-sm font-bold transition-all shadow-lg shadow-primary-900/20 hover:scale-105"
        >
          <Save className="w-4 h-4" /> Save Configuration
        </button>
      </div>
    </div>
  );
};

export default SettingsModal;