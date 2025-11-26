/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import { SFLAnalysis } from '../types';
import { ShieldCheck, AlertTriangle, Lightbulb, Target } from 'lucide-react';

interface AnalysisPanelProps {
  analysis: SFLAnalysis;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ analysis }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-6">
       
       {/* Header / Score */}
       <div className="flex items-center justify-between border-b border-slate-800 pb-4">
           <div>
               <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">SFL Quality Score</h3>
               <p className="text-xs text-slate-500 mt-1">Evaluated by Gemini 3 Pro</p>
           </div>
           <div className={`text-3xl font-bold font-display ${
               analysis.score >= 80 ? 'text-emerald-400' : analysis.score >= 50 ? 'text-amber-400' : 'text-red-400'
           }`}>
               {analysis.score}
           </div>
       </div>

       {/* Metrics Bars */}
       <div className="space-y-3">
           <div>
               <div className="flex justify-between text-xs mb-1">
                   <span className="text-slate-400">Field Alignment</span>
                   <span className="text-slate-200 font-mono">{analysis.sflAlignment.field}/10</span>
               </div>
               <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                   <div className="h-full bg-indigo-500" style={{ width: `${analysis.sflAlignment.field * 10}%` }}></div>
               </div>
           </div>
           <div>
               <div className="flex justify-between text-xs mb-1">
                   <span className="text-slate-400">Tenor Accuracy</span>
                   <span className="text-slate-200 font-mono">{analysis.sflAlignment.tenor}/10</span>
               </div>
               <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                   <div className="h-full bg-purple-500" style={{ width: `${analysis.sflAlignment.tenor * 10}%` }}></div>
               </div>
           </div>
           <div>
               <div className="flex justify-between text-xs mb-1">
                   <span className="text-slate-400">Mode Consistency</span>
                   <span className="text-slate-200 font-mono">{analysis.sflAlignment.mode}/10</span>
               </div>
               <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                   <div className="h-full bg-cyan-500" style={{ width: `${analysis.sflAlignment.mode * 10}%` }}></div>
               </div>
           </div>
       </div>

       {/* Detailed Feedback */}
       <div className="grid grid-cols-1 gap-4 text-xs">
           <div className="bg-emerald-950/30 border border-emerald-900/50 p-3 rounded">
               <h4 className="font-bold text-emerald-400 flex items-center gap-2 mb-2">
                   <ShieldCheck className="w-3 h-3" /> Strengths
               </h4>
               <ul className="list-disc pl-4 space-y-1 text-emerald-200/70">
                   {analysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
               </ul>
           </div>
           
           <div className="bg-amber-950/30 border border-amber-900/50 p-3 rounded">
               <h4 className="font-bold text-amber-400 flex items-center gap-2 mb-2">
                   <AlertTriangle className="w-3 h-3" /> Weaknesses
               </h4>
               <ul className="list-disc pl-4 space-y-1 text-amber-200/70">
                   {analysis.weaknesses.map((s, i) => <li key={i}>{s}</li>)}
               </ul>
           </div>

           <div className="bg-blue-950/30 border border-blue-900/50 p-3 rounded">
               <h4 className="font-bold text-blue-400 flex items-center gap-2 mb-2">
                   <Lightbulb className="w-3 h-3" /> Suggestions
               </h4>
               <ul className="list-disc pl-4 space-y-1 text-blue-200/70">
                   {analysis.suggestions.map((s, i) => <li key={i}>{s}</li>)}
               </ul>
           </div>
       </div>
    </div>
  );
};

export default AnalysisPanel;
