/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect } from 'react';
import { UserSettings, AIProvider, AIModel } from '../types';
import { getAvailableModels } from '../services/orchestrator';
import { Mic, Cpu, Save, Loader2, AlertCircle, Key, Globe, Server } from 'lucide-react';

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
    // Save settings temporarily to local state to fetch available models based on keys
    // In a real app we might debounce this
    const loadModels = async () => {
      setIsLoadingModels(true);
      try {
          // Pass current temporary settings to orchestrator? 
          // Note: orchestrator reads from DB, so we must rely on what's saved or pass overrides.
          // For V2, we just load standard list and filter in UI.
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

  const updateApiKey = (provider: AIProvider, key: string) => {
      setSettings(prev => ({
          ...prev,
          apiKeys: { ...prev.apiKeys, [provider]: key }
      }));
  };

  return (
    <div className="flex flex-col h-full max-h-[700px]">
      <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
        <h3 className="font-bold text-slate-200 flex items-center gap-2 font-display text-lg">
          <Cpu className="w-5 h-5 text-primary-400" />
          System Configuration
        </h3>
      </div>

      <div className="flex border-b border-slate-800 bg-slate-900 overflow-x-auto">
        {[
            { id: 'providers', label: 'AI Providers', icon: Server },
            { id: 'generation', label: 'Models & Grounding', icon: Globe },
            { id: 'live', label: 'Live Assistant', icon: Mic }
        ].map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${
                    activeTab === tab.id
                    ? 'border-primary-500 text-primary-400 bg-slate-800/50'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
            >
                <tab.icon className="w-4 h-4" />
                {tab.label}
            </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-slate-900">
          
          {activeTab === 'providers' && (
              <div className="space-y-6 max-w-2xl mx-auto">
                  <div className="p-4 rounded-lg bg-indigo-900/10 border border-indigo-500/20">
                      <h4 className="font-bold text-indigo-400 mb-2 flex items-center gap-2">
                          <Key className="w-4 h-4" /> Provider API Keys
                      </h4>
                      <p className="text-xs text-indigo-300/70">
                          Keys are stored locally in your browser. Configure at least one provider to use the studio.
                      </p>
                  </div>

                  {/* Google */}
                  <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Google Gemini API</label>
                      <input 
                        type="password" 
                        value={settings.apiKeys.google || ''}
                        onChange={(e) => updateApiKey(AIProvider.GOOGLE, e.target.value)}
                        placeholder={process.env.API_KEY ? "Using env variable (Hidden)" : "AIzaSy..."}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
                      />
                  </div>

                  {/* OpenRouter */}
                  <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">OpenRouter API</label>
                      <input 
                        type="password" 
                        value={settings.apiKeys.openrouter || ''}
                        onChange={(e) => updateApiKey(AIProvider.OPENROUTER, e.target.value)}
                        placeholder="sk-or-..."
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
                      />
                  </div>

                  {/* Mistral */}
                  <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Mistral API</label>
                      <input 
                        type="password" 
                        value={settings.apiKeys.mistral || ''}
                        onChange={(e) => updateApiKey(AIProvider.MISTRAL, e.target.value)}
                        placeholder="Key..."
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
                      />
                  </div>

                  {/* Ollama */}
                  <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Ollama Local URL</label>
                      <input 
                        type="text" 
                        value={settings.ollamaBaseUrl || ''}
                        onChange={(e) => setSettings({...settings, ollamaBaseUrl: e.target.value})}
                        placeholder="http://localhost:11434/v1"
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
                      />
                  </div>
              </div>
          )}

          {activeTab === 'generation' && (
              <div className="space-y-8 max-w-2xl mx-auto">
                  
                  {/* Grounding Toggle */}
                  <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                      <div>
                          <h4 className="font-bold text-slate-200 text-sm">Google Search Grounding</h4>
                          <p className="text-xs text-slate-500 mt-1">Enhance generation with real-world citations. (Requires Google Provider)</p>
                      </div>
                      <button 
                        onClick={() => {
                            const newVal = !settings.useSearchGrounding;
                            // If enabling, force Google provider
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
                        className={`w-12 h-6 rounded-full transition-colors relative ${settings.useSearchGrounding ? 'bg-primary-500' : 'bg-slate-600'}`}
                      >
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.useSearchGrounding ? 'left-7' : 'left-1'}`}></div>
                      </button>
                  </div>

                  <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">Generation Defaults</h4>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                              <label className="text-xs font-bold text-slate-500">Provider</label>
                              <select 
                                  value={settings.generation.provider}
                                  onChange={(e) => setSettings({...settings, generation: { ...settings.generation, provider: e.target.value as AIProvider }})}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
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
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
                              >
                                  {models
                                    .filter(m => m.provider === settings.generation.provider)
                                    .map(m => <option key={m.name} value={m.name}>{m.displayName}</option>)
                                  }
                              </select>
                          </div>
                      </div>
                  </div>

                  <div className="space-y-4">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-2">Analysis Defaults</h4>
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                              <label className="text-xs font-bold text-slate-500">Provider</label>
                              <select 
                                  value={settings.analysis.provider}
                                  onChange={(e) => setSettings({...settings, analysis: { ...settings.analysis, provider: e.target.value as AIProvider }})}
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
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
                                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
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
          )}

          {activeTab === 'live' && (
              <div className="space-y-6 max-w-2xl mx-auto">
                  <div className="p-4 bg-amber-900/10 border border-amber-500/20 rounded-lg flex gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                      <p className="text-xs text-amber-200/80">
                          Live Assistant features are currently optimized for Google Gemini models only. Other providers may be supported in future updates.
                      </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Voice Personality</label>
                    <select
                        value={settings.live.voice}
                        onChange={(e) => setSettings({ ...settings, live: { ...settings.live, voice: e.target.value } })}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
                    >
                        {['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inference Model</label>
                    <select
                        value={settings.live.model}
                        onChange={(e) => setSettings({ ...settings, live: { ...settings.live, model: e.target.value } })}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
                    >
                        {models
                            .filter(m => m.provider === AIProvider.GOOGLE && m.name.includes('audio'))
                            .map(m => (
                            <option key={m.name} value={m.name}>{m.displayName}</option>
                        ))}
                    </select>
                  </div>
              </div>
          )}
      </div>

      <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors">Cancel</button>
        <button 
          onClick={handleSave}
          className="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg flex items-center gap-2 text-sm font-bold transition-all shadow-lg shadow-primary-900/20"
        >
          <Save className="w-4 h-4" /> Save Configuration
        </button>
      </div>
    </div>
  );
};

export default SettingsModal;