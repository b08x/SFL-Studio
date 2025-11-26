/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import { generateWizardSuggestion } from '../services/geminiService';
import { Prompt } from '../types';
import { Sparkles, ArrowRight, Check, Loader2, RefreshCw } from 'lucide-react';

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

  return (
    <div className="w-full max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
       <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
           <h3 className="font-bold text-slate-200 flex items-center gap-2 font-display">
               <Sparkles className="w-4 h-4 text-primary-400" />
               Prompt Wizard
           </h3>
           <div className="flex gap-1.5">
               <div className={`h-1.5 w-8 rounded-full transition-colors ${step >= 0 ? 'bg-primary-500' : 'bg-slate-800'}`}></div>
               <div className={`h-1.5 w-8 rounded-full transition-colors ${step >= 1 ? 'bg-primary-500' : 'bg-slate-800'}`}></div>
           </div>
       </div>

       <div className="p-6">
           {step === 0 && (
               <div className="space-y-5">
                   <div>
                       <label className="block text-slate-400 text-sm mb-2 font-medium">Describe your goal in natural language:</label>
                       <textarea 
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            className="w-full h-32 bg-slate-950 border border-slate-800 rounded-lg p-4 text-slate-200 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none placeholder:text-slate-600 transition-all text-sm leading-relaxed"
                            placeholder="e.g., I need a prompt that acts like a senior Python developer reviewing junior code. It should be encouraging but strict on type safety."
                       />
                   </div>
                   
                   <div className="flex justify-between items-center pt-2">
                       <button onClick={onCancel} className="px-4 py-2 text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors">Cancel</button>
                       <button 
                         onClick={handleInitialIdea}
                         disabled={loading || !input.trim()}
                         className={`px-5 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white rounded-lg flex items-center gap-2 text-sm font-bold transition-all shadow-lg shadow-primary-900/20 ${loading || !input.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                       >
                           {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Analyze Intent <ArrowRight className="w-4 h-4" /></>}
                       </button>
                   </div>
               </div>
           )}

           {step === 1 && suggestion && (
               <div className="space-y-6">
                   <div className="flex items-center justify-between">
                       <p className="text-slate-400 text-sm">We drafted these SFL settings based on your idea. Tweak them if needed:</p>
                       <button onClick={handleInitialIdea} className="text-xs flex items-center gap-1 text-primary-400 hover:text-primary-300">
                           <RefreshCw className="w-3 h-3" /> Regenerate
                       </button>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1.5">
                           <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Domain (Field)</label>
                           <input 
                              value={suggestion.domain} 
                              onChange={e => updateSuggestion('domain', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:border-primary-500 outline-none transition-colors"
                           />
                       </div>
                       <div className="space-y-1.5">
                           <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Process (Field)</label>
                           <input 
                              value={suggestion.process} 
                              onChange={e => updateSuggestion('process', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:border-primary-500 outline-none transition-colors"
                           />
                       </div>
                       <div className="space-y-1.5">
                           <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Sender Role (Tenor)</label>
                           <input 
                              value={suggestion.senderRole} 
                              onChange={e => updateSuggestion('senderRole', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:border-primary-500 outline-none transition-colors"
                           />
                       </div>
                       <div className="space-y-1.5">
                           <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Tone (Tenor)</label>
                           <input 
                              value={suggestion.affect} 
                              onChange={e => updateSuggestion('affect', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:border-primary-500 outline-none transition-colors"
                           />
                       </div>
                       <div className="col-span-2 space-y-1.5">
                           <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Rhetorical Mode (Mode)</label>
                           <input 
                              value={suggestion.rhetoricalMode} 
                              onChange={e => updateSuggestion('rhetoricalMode', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:border-primary-500 outline-none transition-colors"
                           />
                       </div>
                   </div>

                   <div className="flex justify-end gap-3 pt-2">
                       <button onClick={() => setStep(0)} className="px-4 py-2 text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors">Back</button>
                       <button 
                         onClick={finalize}
                         className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-2 text-sm font-bold transition-all shadow-lg shadow-emerald-900/20"
                       >
                           <Check className="w-4 h-4" /> Create Project
                       </button>
                   </div>
               </div>
           )}
       </div>
    </div>
  );
};

export default PromptWizard;