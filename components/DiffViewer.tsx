/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useMemo } from 'react';
import * as Diff from 'diff';

interface DiffViewerProps {
  oldText: string;
  newText: string;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ oldText, newText }) => {
  const diffs = useMemo(() => {
    return Diff.diffWords(oldText, newText);
  }, [oldText, newText]);

  return (
    <div className="font-mono text-sm leading-relaxed bg-slate-950 p-4 rounded-lg border border-slate-800 overflow-y-auto max-h-[200px]">
      {diffs.map((part, index) => {
        const color = part.added
          ? 'text-green-400 bg-green-900/30'
          : part.removed
          ? 'text-red-400 bg-red-900/30 line-through decoration-red-500/50'
          : 'text-slate-400';
        
        return (
          <span key={index} className={`${color} px-0.5 rounded`}>
            {part.value}
          </span>
        );
      })}
    </div>
  );
};

export default DiffViewer;
