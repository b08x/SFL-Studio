/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import { generateWizardSuggestion } from '../services/orchestrator';
import { Prompt } from '../types';
import { Sparkles, ArrowRight, Check, Loader2, RefreshCw, MessageSquare, Wand2, Activity, Database, Cpu } from 'lucide-react';

interface PromptWizardProps {
  onComplete: (prompt: Partial<Prompt>) => void;
  onCancel: () => void;
}

const PromptWizard: React.FC<PromptWizardProps> = ({ onComplete, onCancel }) => {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [suggestion, setSuggestion] = useState<any>(null);

  const handleInitialIdea = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
        const result = await generateWizardSuggestion(input);
        setSuggestion(result);
        setStep(1);
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  const updateSuggestion = (key: string, value: string) => {
      setSuggestion((prev: any) => ({ ...prev, [key]: value }));
  };

  const finalize = () => {
     const newPrompt: Partial<Prompt> = {
         title: input.length > 30 ? input.substring(0, 30) + '...' : input,
         sfl: {
             field: { 
                 domain: suggestion.domain || 'General', 
                 process: suggestion.process || 'Thinking' 
             },
             tenor: { 
                 senderRole: suggestion.senderRole || 'Expert', 
                 receiverRole: suggestion.receiverRole || 'User', 
                 powerStatus: 'Equal', 
                 affect: (suggestion.affect || 'Professional') as any 
             },
             mode: { 
                 channel: 'Written', 
                 medium: 'Text', 
                 rhetoricalMode: (suggestion.rhetoricalMode || 'Descriptive') as any 
             }
         }
     };
     onComplete(newPrompt);
  };

  const FieldGroup = ({ label, children, icon: Icon, colorClass }: any) => (
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${colorClass} pb-2 border-b border-slate-800/50`}>
              <Icon className="w-3.5 h-3.5" /> {label}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {children}
          </div>
      </div>
  );

  const InputRow = ({ label, value, onChange }: any) => (
      <div className="space-y-1">
          <label className="text-[10px] font-medium text-slate-500 uppercase">{label}</label>
          <input 
            value={value} 
            onChange={e => onChange(e.target.value)} 
            className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none transition-colors" 
          />
      </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
       
       {/* Header */}
       <div className="px-8 py-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
            <div>
                <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-primary-400" />
                    Prompt Wizard
                </h2>
                <p className="text-sm text-slate-500 mt-1">Transform natural language into structured SFL parameters</p>
            </div>
            <div className="flex gap-2">
                <div className={`w-2 h-2 rounded-full ${step >= 0 ? 'bg-primary-500' : 'bg-slate-800'}`}></div>
                <div className={`w-2 h-2 rounded-full ${step >= 1 ? 'bg-primary-500' : 'bg-slate-800'}`}></div>
            </div>
       </div>

       {/* Content */}
       <div className="flex-1 overflow-y-auto">
           {step === 0 ? (
               <div className="max-w-3xl mx-auto p-8 flex flex-col items-center justify-center min-h-[400px] animate-in fade-in slide-in-from-bottom-4 duration-500">
                   <h3 className="text-2xl font-bold text-slate-200 mb-6 text-center">What do you want to achieve?</h3>
                   <div className="w-full relative group">
                       <textarea 
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            className="w-full h-48 bg-slate-900 border border-slate-700 rounded-2xl p-6 text-lg text-slate-200 focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 outline-none resize-none placeholder:text-slate-600 transition-all shadow-xl"
                            placeholder="e.g., I need a prompt for a senior copywriter to critique a marketing email, focusing on persuasive tone and clarity."
                            autoFocus
                       />
                       <div className="absolute bottom-4 right-4 text-xs text-slate-500 font-mono">
                           {input.length} chars
                       </div>
                   </div>
                   
                   <div className="mt-8 flex gap-4 w-full">
                       <button onClick={onCancel} className="flex-1 py-4 rounded-xl text-slate-500 hover:bg-slate-900 hover:text-slate-300 font-bold transition-colors">
                           Cancel
                       </button>
                       <button 
                         onClick={handleInitialIdea}
                         disabled={loading || !input.trim()}
                         className={`flex-[2] py-4 bg-primary-600 hover:bg-primary-500 text-white rounded-xl flex items-center justify-center gap-2 font-bold transition-all shadow-lg shadow-primary-900/20 text-lg ${loading || !input.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                       >
                           {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>Analyze Intent <ArrowRight className="w-6 h-6" /></>}
                       </button>
                   </div>
               </div>
           ) : (
               <div className="flex flex-col md:flex-row h-full">
                   {/* Left Panel: Context */}
                   <div className="md:w-1/3 p-6 border-r border-slate-800 bg-slate-900/30 overflow-y-auto">
                       <div className="sticky top-0 space-y-6">
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Original Request</h4>
                                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-sm italic leading-relaxed">
                                    "{input}"
                                </div>
                            </div>
                            
                            <div className="space-y-4 pt-4 border-t border-slate-800">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Controls</h4>
                                <button onClick={handleInitialIdea} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 border border-slate-700">
                                    <RefreshCw className="w-4 h-4" /> Regenerate Analysis
                                </button>
                                <button onClick={() => setStep(0)} className="w-full py-3 text-slate-500 hover:text-white rounded-xl text-sm font-medium transition-colors">
                                    &larr; Back to Input
                                </button>
                            </div>
                       </div>
                   </div>

                   {/* Right Panel: Form */}
                   <div className="flex-1 p-6 md:p-8 overflow-y-auto space-y-6 bg-slate-950">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-lg text-slate-200">Refine Generated Parameters</h3>
                            <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-1 rounded border border-emerald-900/50">AI Generated</span>
                        </div>

                        {suggestion && (
                            <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
                                <FieldGroup label="Field (Subject)" icon={Activity} colorClass="text-accent-400">
                                    <InputRow label="Domain" value={suggestion.domain} onChange={(v: string) => updateSuggestion('domain', v)} />
                                    <InputRow label="Process" value={suggestion.process} onChange={(v: string) => updateSuggestion('process', v)} />
                                </FieldGroup>

                                <FieldGroup label="Tenor (Participants)" icon={Database} colorClass="text-primary-400">
                                    <InputRow label="Sender Role" value={suggestion.senderRole} onChange={(v: string) => updateSuggestion('senderRole', v)} />
                                    <InputRow label="Receiver Role" value={suggestion.receiverRole} onChange={(v: string) => updateSuggestion('receiverRole', v)} />
                                    <InputRow label="Affect (Tone)" value={suggestion.affect} onChange={(v: string) => updateSuggestion('affect', v)} />
                                </FieldGroup>

                                <FieldGroup label="Mode (Channel)" icon={Cpu} colorClass="text-emerald-400">
                                    <InputRow label="Rhetorical Mode" value={suggestion.rhetoricalMode} onChange={(v: string) => updateSuggestion('rhetoricalMode', v)} />
                                    {/* Defaulting channel/medium for simplicity in wizard, user can edit later */}
                                </FieldGroup>
                            </div>
                        )}
                   </div>
               </div>
           )}
       </div>

       {/* Footer Action */}
       {step === 1 && (
           <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end">
               <button 
                onClick={finalize} 
                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center gap-2 text-base font-bold transition-all shadow-lg shadow-emerald-900/20 hover:scale-105"
               >
                   <Check className="w-5 h-5" /> Create Project
               </button>
           </div>
       )}
    </div>
  );
};

export default PromptWizard;