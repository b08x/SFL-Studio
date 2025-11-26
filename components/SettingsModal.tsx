/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect } from 'react';
import { UserSettings, AIModel } from '../types';
import { Mic, Cpu, Save, Loader2, AlertCircle, Signal } from 'lucide-react';
import { getAvailableModels } from '../services/geminiService';

interface SettingsModalProps {
  settings: UserSettings;
  onSave: (settings: UserSettings) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ settings: initialSettings, onSave, onClose }) => {
  const [settings, setSettings] = useState<UserSettings>(initialSettings);
  const [activeTab, setActiveTab] = useState<'live' | 'generation'>('live');
  
  // Model Loading State
  const [models, setModels] = useState<AIModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadModels = async () => {
      setIsLoadingModels(true);
      try {
        const fetchedModels = await getAvailableModels();
        // Filter out gemini-1.x models as per best practices
        const filtered = fetchedModels.filter(m => 
            !m.name.includes('gemini-1.0') && 
            !m.name.includes('gemini-pro') // deprecation check
        );
        // If we get an empty list (auth error or network), the service returns defaults, so this usually has data.
        setModels(filtered.length > 0 ? filtered : fetchedModels); 
      } catch (err) {
        console.error(err);
        setError("Could not load dynamic model list.");
      } finally {
        setIsLoadingModels(false);
      }
    };
    loadModels();
  }, []);

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
      <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
        <h3 className="font-bold text-slate-200 flex items-center gap-2 font-display">
          <Cpu className="w-4 h-4 text-primary-400" />
          System Configuration
        </h3>
      </div>

      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab('live')}
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'live'
              ? 'border-primary-500 text-primary-400 bg-slate-800/50'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          Live Assistant
        </button>
        <button
          onClick={() => setActiveTab('generation')}
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'generation'
              ? 'border-primary-500 text-primary-400 bg-slate-800/50'
              : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          Generation & Analysis
        </button>
      </div>

      <div className="p-6 overflow-y-auto min-h-[300px]">
        {isLoadingModels ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-3 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                <span className="text-xs">Fetching available models from Google AI...</span>
            </div>
        ) : (
          <>
            {error && (
                <div className="mb-4 p-3 bg-red-900/20 border border-red-900/50 rounded flex items-center gap-2 text-red-400 text-xs">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {activeTab === 'live' && (
            <div className="space-y-6">
                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 flex items-start gap-3">
                <div className="p-2 bg-slate-900 rounded-lg text-primary-400">
                    <Mic className="w-5 h-5" />
                </div>
                <div>
                    <h4 className="text-sm font-bold text-slate-200">Live Voice Config</h4>
                    <p className="text-xs text-slate-500 mt-1">Customize the personality and backend of your SFL-OS assistant.</p>
                </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Voice Personality</label>
                    <select
                        value={settings.live.voice}
                        onChange={(e) => setSettings({ ...settings, live: { ...settings.live, voice: e.target.value } })}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
                    >
                        <option value="Puck">Puck (Energetic)</option>
                        <option value="Charon">Charon (Deep)</option>
                        <option value="Kore">Kore (Balanced)</option>
                        <option value="Fenrir">Fenrir (Intense)</option>
                        <option value="Zephyr">Zephyr (Calm)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Streaming Quality</label>
                    <select
                        value={settings.live.quality || 'standard'}
                        onChange={(e) => setSettings({ ...settings, live: { ...settings.live, quality: e.target.value as any } })}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
                    >
                        <option value="low">Low Bandwidth (16kHz)</option>
                        <option value="standard">Standard (24kHz)</option>
                        <option value="high">High Fidelity (24kHz+)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inference Model</label>
                <select
                    value={settings.live.model}
                    onChange={(e) => setSettings({ ...settings, live: { ...settings.live, model: e.target.value } })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
                >
                    {models
                        .filter(m => m.name.includes('flash') || m.name.includes('lite') || m.name.includes('audio'))
                        .map(m => (
                        <option key={m.name} value={m.name}>
                            {m.displayName || m.name}
                        </option>
                    ))}
                    {!models.some(m => m.name === settings.live.model) && (
                         <option value={settings.live.model}>{settings.live.model}</option>
                    )}
                </select>
                <p className="text-[10px] text-slate-600">
                    Showing models optimized for latency/audio.
                </p>
                </div>
            </div>
            )}

            {activeTab === 'generation' && (
            <div className="space-y-6">
                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 flex items-start gap-3">
                <div className="p-2 bg-slate-900 rounded-lg text-emerald-400">
                    <Cpu className="w-5 h-5" />
                </div>
                <div>
                    <h4 className="text-sm font-bold text-slate-200">Model Selection</h4>
                    <p className="text-xs text-slate-500 mt-1">Choose models for standard text generation tasks.</p>
                </div>
                </div>

                <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Standard Generation Model</label>
                <select
                    value={settings.generation.model}
                    onChange={(e) => setSettings({ ...settings, generation: { ...settings.generation, model: e.target.value } })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
                >
                    {models.map(m => (
                        <option key={m.name} value={m.name}>
                            {m.displayName || m.name}
                        </option>
                    ))}
                </select>
                </div>

                <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Analysis Model</label>
                <select
                    value={settings.analysis.model}
                    onChange={(e) => setSettings({ ...settings, analysis: { ...settings.analysis, model: e.target.value } })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
                >
                     {models.map(m => (
                        <option key={m.name} value={m.name}>
                            {m.displayName || m.name}
                        </option>
                    ))}
                </select>
                </div>
            </div>
            )}
          </>
        )}
      </div>

      <div className="p-6 pt-0 flex justify-end gap-3 mt-auto">
        <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors">Cancel</button>
        <button 
          onClick={handleSave}
          className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg flex items-center gap-2 text-sm font-bold transition-all shadow-lg shadow-primary-900/20"
        >
          <Save className="w-4 h-4" /> Save Configuration
        </button>
      </div>
    </div>
  );
};

export default SettingsModal;