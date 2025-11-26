
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Workflow, WorkflowTask, TaskType, Prompt } from '../types';
import { Play, Plus, X, Settings, CheckCircle, Circle, AlertCircle, Loader2, FileText, Code, Activity, User, GripHorizontal, Zap, Upload, Video, Mic, FileInput } from 'lucide-react';
import { db } from '../services/storage';

interface WorkflowEngineProps {
  workflow: Workflow;
  onSave: (w: Workflow) => void;
  onRun: (w: Workflow) => void;
}

const WorkflowEngine: React.FC<WorkflowEngineProps> = ({ workflow: initialWorkflow, onSave, onRun }) => {
  // --- State ---
  const [workflow, setWorkflow] = useState<Workflow>(initialWorkflow);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  // Viewport State
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  
  // Interaction State
  const [isPanning, setIsPanning] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); // Relative to canvas for temp connection line

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number, y: number } | null>(null);

  // --- Initialization ---
  useEffect(() => {
    setPrompts(db.prompts.getAll());
  }, []);

  useEffect(() => {
      setWorkflow(initialWorkflow);
  }, [initialWorkflow]);

  // --- Helpers ---
  
  // Convert screen coordinates to canvas coordinates
  const getCanvasCoordinates = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left - viewport.x) / viewport.zoom,
        y: (e.clientY - rect.top - viewport.y) / viewport.zoom
    };
  }, [viewport]);

  const saveWorkflow = (w: Workflow) => {
      setWorkflow(w);
      onSave(w);
  };

  // --- Task Management ---

  const handleAddTask = (type: TaskType) => {
    // Center new task in current viewport
    const container = containerRef.current;
    let centerX = 100;
    let centerY = 100;
    
    if (container) {
        const rect = container.getBoundingClientRect();
        centerX = (-viewport.x + rect.width / 2) / viewport.zoom - 96; // 96 is half node width
        centerY = (-viewport.y + rect.height / 2) / viewport.zoom - 40;
    }

    const newTask: WorkflowTask = {
        id: `task-${Date.now()}`,
        type,
        name: type === TaskType.INPUT ? 'Input Source' : `New ${type.toLowerCase().replace('_', ' ')}`,
        config: {
            targetKey: `output_${workflow.tasks.length + 1}`,
            inputType: 'text'
        },
        position: { x: centerX, y: centerY },
        dependencies: []
    };
    
    // Auto-connect if a task is selected
    if (selectedTaskId) {
        newTask.dependencies.push(selectedTaskId);
    }

    const updated = { ...workflow, tasks: [...workflow.tasks, newTask] };
    saveWorkflow(updated);
    setSelectedTaskId(newTask.id);
  };

  const handleDeleteTask = (id: string) => {
      const updated = {
          ...workflow,
          tasks: workflow.tasks.filter(t => t.id !== id).map(t => ({
              ...t,
              dependencies: t.dependencies.filter(d => d !== id)
          }))
      };
      saveWorkflow(updated);
      if (selectedTaskId === id) setSelectedTaskId(null);
  };

  const handleUpdateTask = (taskId: string, updates: Partial<WorkflowTask>, shouldSave = true) => {
      const updatedTasks = workflow.tasks.map(t => 
          t.id === taskId ? { ...t, ...updates } : t
      );
      const updatedWorkflow = { ...workflow, tasks: updatedTasks };
      
      if (shouldSave) {
          saveWorkflow(updatedWorkflow);
      } else {
          setWorkflow(updatedWorkflow);
      }
  };

  const handleUpdateConfig = (taskId: string, key: string, value: any) => {
      const task = workflow.tasks.find(t => t.id === taskId);
      if (!task) return;
      const updatedConfig = { ...task.config, [key]: value };
      handleUpdateTask(taskId, { config: updatedConfig });
  };

  const handleFileUpload = async (taskId: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const updates: any = {
          fileName: file.name,
          fileType: file.type
      };

      // For text files, we can read the content immediately
      if (file.type.includes('text') || file.name.endsWith('.md') || file.name.endsWith('.json') || file.name.endsWith('.csv')) {
          const text = await file.text();
          updates.inputValue = text;
      } else {
          // For binary (audio/video), in a real app we'd upload. 
          // Here we mock by storing metadata.
          updates.inputValue = `[Binary File Reference: ${file.name}]`;
      }

      handleUpdateConfig(taskId, 'fileName', updates.fileName);
      handleUpdateConfig(taskId, 'fileType', updates.fileType);
      handleUpdateConfig(taskId, 'inputValue', updates.inputValue);
  };

  // --- Connection Management ---

  const handleConnect = (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return; // No self-loops
      
      const targetTask = workflow.tasks.find(t => t.id === targetId);
      if (!targetTask) return;

      // Check if already connected
      if (targetTask.dependencies.includes(sourceId)) return;

      // Check for cycles (Basic BFS check could be added here, omitting for simplicity/performance in V2)

      const updatedTasks = workflow.tasks.map(t => 
          t.id === targetId ? { ...t, dependencies: [...t.dependencies, sourceId] } : t
      );
      saveWorkflow({ ...workflow, tasks: updatedTasks });
  };

  const handleDisconnect = (sourceId: string, targetId: string) => {
      const updatedTasks = workflow.tasks.map(t => 
        t.id === targetId ? { ...t, dependencies: t.dependencies.filter(d => d !== sourceId) } : t
      );
      saveWorkflow({ ...workflow, tasks: updatedTasks });
  };

  // --- Event Handlers (Canvas) ---

  const handleWheel = (e: React.WheelEvent) => {
    // Ctrl+Wheel or pinch-zoom usually
    if (e.ctrlKey || e.metaKey || true) { // Always zoom on wheel for this editor
        e.preventDefault();
        const sensitivity = 0.001;
        const delta = -e.deltaY * sensitivity;
        const newZoom = Math.min(Math.max(viewport.zoom + delta, 0.1), 3);
        
        // Zoom towards mouse pointer logic could go here, strictly centered/clamped for now
        setViewport(prev => ({ ...prev, zoom: newZoom }));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) { // Middle mouse or Alt+Click
          setIsPanning(true);
          dragStartRef.current = { x: e.clientX, y: e.clientY };
          return;
      }
      
      // If clicking strictly on the background
      if (e.target === containerRef.current) {
          setIsPanning(true);
          dragStartRef.current = { x: e.clientX, y: e.clientY };
          setSelectedTaskId(null);
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (isPanning) {
          setViewport(prev => ({
              ...prev,
              x: prev.x + e.movementX,
              y: prev.y + e.movementY
          }));
      } else if (draggingTaskId) {
          const dx = e.movementX / viewport.zoom;
          const dy = e.movementY / viewport.zoom;
          const task = workflow.tasks.find(t => t.id === draggingTaskId);
          if (task) {
             handleUpdateTask(draggingTaskId, {
                 position: { x: task.position.x + dx, y: task.position.y + dy }
             }, false); // Don't save to DB on every pixel move
          }
      } else if (connectingFromId) {
          setMousePos(getCanvasCoordinates(e));
      }
  };

  const handleMouseUp = () => {
      if (draggingTaskId) {
          // Commit the final position to storage
          saveWorkflow(workflow);
          setDraggingTaskId(null);
      }
      if (connectingFromId) {
          setConnectingFromId(null);
      }
      setIsPanning(false);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, taskId: string) => {
      e.stopPropagation();
      setDraggingTaskId(taskId);
      setSelectedTaskId(taskId);
  };

  // --- Render Helpers ---

  const getTaskStatus = (id: string) => {
    const log = workflow.logs.find(l => l.taskId === id && l.timestamp === workflow.lastRun);
    return log?.status || 'PENDING';
  };

  const selectedTaskObj = workflow.tasks.find(t => t.id === selectedTaskId);

  return (
    <div className="flex h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden relative">
        
        {/* --- SIDEBAR --- */}
        <div className="w-80 border-r border-slate-800 bg-slate-900 flex flex-col h-full z-20 shadow-xl flex-shrink-0">
            {selectedTaskObj ? (
                <div className="flex flex-col h-full animate-in slide-in-from-left-5 duration-200">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                        <div className="flex items-center gap-2">
                            <Settings className="w-4 h-4 text-primary-400" />
                            <h4 className="text-sm font-bold text-slate-200">Node Config</h4>
                        </div>
                        <button onClick={() => setSelectedTaskId(null)} className="text-slate-500 hover:text-white transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        {/* Task Name & Type */}
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Task Name</label>
                                <input 
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none transition-all"
                                    value={selectedTaskObj.name}
                                    onChange={(e) => handleUpdateTask(selectedTaskId!, { name: e.target.value })}
                                />
                            </div>
                            
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Task Type</label>
                                <select
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none appearance-none"
                                    value={selectedTaskObj.type}
                                    onChange={(e) => handleUpdateTask(selectedTaskId!, { type: e.target.value as TaskType })}
                                >
                                    {Object.values(TaskType).map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="h-px bg-slate-800 my-2"></div>

                        {/* Task Specific Config */}
                        <div className="space-y-4">
                            <h5 className="text-xs font-bold text-primary-400 uppercase tracking-wider flex items-center gap-2">
                                <Zap className="w-3 h-3" /> Parameters
                            </h5>

                            <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                                    Output Variable
                                </label>
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-600 font-mono text-xs">$</span>
                                    <input 
                                        className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-emerald-400 focus:border-emerald-500 outline-none"
                                        value={selectedTaskObj.config.targetKey || ''}
                                        onChange={(e) => handleUpdateConfig(selectedTaskId!, 'targetKey', e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* INPUT CONFIG */}
                            {selectedTaskObj.type === TaskType.INPUT && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Input Type</label>
                                        <div className="grid grid-cols-4 gap-1">
                                            {[
                                                { id: 'text', icon: FileText, label: 'Text' },
                                                { id: 'file', icon: FileInput, label: 'File' },
                                                { id: 'audio', icon: Mic, label: 'Audio' },
                                                { id: 'video', icon: Video, label: 'Video' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => handleUpdateConfig(selectedTaskId!, 'inputType', opt.id)}
                                                    className={`p-2 rounded flex flex-col items-center justify-center gap-1 text-[10px] transition-colors border ${
                                                        selectedTaskObj.config.inputType === opt.id 
                                                            ? 'bg-cyan-950/50 border-cyan-500/50 text-cyan-400' 
                                                            : 'bg-slate-900 border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                                    }`}
                                                >
                                                    <opt.icon className="w-4 h-4" />
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {selectedTaskObj.config.inputType === 'text' && (
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Content</label>
                                            <textarea 
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 focus:border-cyan-500 outline-none resize-none h-40 leading-relaxed"
                                                value={selectedTaskObj.config.inputValue || ''}
                                                onChange={(e) => handleUpdateConfig(selectedTaskId!, 'inputValue', e.target.value)}
                                                placeholder="Paste input text here..."
                                            />
                                        </div>
                                    )}

                                    {selectedTaskObj.config.inputType !== 'text' && (
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Upload {selectedTaskObj.config.inputType}</label>
                                            <div className="relative">
                                                <input 
                                                    type="file"
                                                    accept={
                                                        selectedTaskObj.config.inputType === 'audio' ? 'audio/*' :
                                                        selectedTaskObj.config.inputType === 'video' ? 'video/*' :
                                                        '.txt,.md,.json,.csv,.pdf'
                                                    }
                                                    onChange={(e) => handleFileUpload(selectedTaskId!, e)}
                                                    className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer border border-slate-800 rounded p-1"
                                                />
                                            </div>
                                            {selectedTaskObj.config.fileName && (
                                                <div className="mt-2 p-2 bg-slate-900 rounded border border-slate-800 text-xs flex items-center gap-2">
                                                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                                                    <span className="truncate">{selectedTaskObj.config.fileName}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {selectedTaskObj.type === TaskType.GENERATION && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Base Prompt</label>
                                    <select
                                        className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:border-primary-500 outline-none"
                                        value={selectedTaskObj.config.promptId || ''}
                                        onChange={(e) => handleUpdateConfig(selectedTaskId!, 'promptId', e.target.value)}
                                    >
                                        <option value="">-- Select --</option>
                                        {prompts.map(p => (
                                            <option key={p.id} value={p.id}>{p.title}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {selectedTaskObj.type === TaskType.TRANSFORMATION && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Code (JS)</label>
                                    <textarea 
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-blue-300 focus:border-blue-500 outline-none resize-none h-40 leading-relaxed"
                                        value={selectedTaskObj.config.code || ''}
                                        onChange={(e) => handleUpdateConfig(selectedTaskId!, 'code', e.target.value)}
                                        placeholder="// return context.data..."
                                        spellCheck={false}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-4 border-t border-slate-800 bg-slate-950/50">
                        <button 
                            onClick={() => handleDeleteTask(selectedTaskId!)} 
                            className="w-full py-2 border border-red-900/50 text-red-400 hover:bg-red-900/20 rounded text-xs font-bold transition-colors flex items-center justify-center gap-2"
                        >
                            <X className="w-3 h-3" /> Delete Task
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col h-full p-4 gap-4">
                    <div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Toolbar</h3>
                        <div className="grid grid-cols-1 gap-2">
                             <button onClick={() => handleAddTask(TaskType.INPUT)} className="flex items-center gap-3 px-3 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 rounded-lg text-xs text-slate-300 transition-all group">
                                <div className="p-1.5 bg-cyan-500/10 rounded group-hover:bg-cyan-500/20 text-cyan-400"><Upload className="w-4 h-4" /></div>
                                <div className="text-left">
                                    <span className="block font-bold">Input Source</span>
                                    <span className="text-[10px] text-slate-500">Text, File, A/V</span>
                                </div>
                            </button>
                            <button onClick={() => handleAddTask(TaskType.GENERATION)} className="flex items-center gap-3 px-3 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500/50 rounded-lg text-xs text-slate-300 transition-all group">
                                <div className="p-1.5 bg-indigo-500/10 rounded group-hover:bg-indigo-500/20 text-indigo-400"><FileText className="w-4 h-4" /></div>
                                <div className="text-left">
                                    <span className="block font-bold">Generator</span>
                                    <span className="text-[10px] text-slate-500">LLM Prompt</span>
                                </div>
                            </button>
                            <button onClick={() => handleAddTask(TaskType.TRANSFORMATION)} className="flex items-center gap-3 px-3 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-blue-500/50 rounded-lg text-xs text-slate-300 transition-all group">
                                <div className="p-1.5 bg-blue-500/10 rounded group-hover:bg-blue-500/20 text-blue-400"><Code className="w-4 h-4" /></div>
                                <div className="text-left">
                                    <span className="block font-bold">Transformer</span>
                                    <span className="text-[10px] text-slate-500">JavaScript</span>
                                </div>
                            </button>
                            <button onClick={() => handleAddTask(TaskType.ANALYSIS)} className="flex items-center gap-3 px-3 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/50 rounded-lg text-xs text-slate-300 transition-all group">
                                <div className="p-1.5 bg-emerald-500/10 rounded group-hover:bg-emerald-500/20 text-emerald-400"><Activity className="w-4 h-4" /></div>
                                <div className="text-left">
                                    <span className="block font-bold">Analyzer</span>
                                    <span className="text-[10px] text-slate-500">Quality Guard</span>
                                </div>
                            </button>
                        </div>
                    </div>
                    
                    <div className="mt-auto pt-4 border-t border-slate-800 space-y-3">
                         <div className="p-3 bg-slate-900 rounded border border-slate-800">
                             <h6 className="text-[10px] font-bold text-slate-500 uppercase mb-2">Controls</h6>
                             <div className="text-[10px] text-slate-400 space-y-1">
                                 <p>• Drag empty space to Pan</p>
                                 <p>• Wheel to Zoom</p>
                                 <p>• Drag nodes to Move</p>
                                 <p>• Drag from <Circle className="w-2 h-2 inline text-slate-400" /> to connect</p>
                             </div>
                         </div>
                        <button 
                            onClick={() => onRun(workflow)}
                            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20"
                        >
                            {workflow.status === 'RUNNING' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                            <span>{workflow.status === 'RUNNING' ? 'Running...' : 'Execute Workflow'}</span>
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* --- CANVAS --- */}
        <div 
            className={`flex-1 relative overflow-hidden bg-slate-950 ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`}
            ref={containerRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Grid Background */}
            <div 
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                    transformOrigin: '0 0',
                    backgroundImage: 'radial-gradient(circle, #334155 1px, transparent 1px)',
                    backgroundSize: '24px 24px'
                }}
            />

            {/* Transform Layer */}
            <div 
                className="absolute inset-0 origin-top-left will-change-transform"
                style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
            >
                {/* Connections Layer (SVG) */}
                <svg className="absolute top-0 left-0 w-[5000px] h-[5000px] pointer-events-none overflow-visible">
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#475569" />
                        </marker>
                    </defs>
                    
                    {/* Existing Connections */}
                    {workflow.tasks.map(task => {
                        return task.dependencies.map(depId => {
                            const dep = workflow.tasks.find(t => t.id === depId);
                            if (!dep) return null;
                            
                            // Calculate connection points
                            // Output is right side of dep, Input is left side of task
                            const startX = dep.position.x + 192; // Width of node
                            const startY = dep.position.y + 40; // Approx half height
                            const endX = task.position.x;
                            const endY = task.position.y + 40;

                            // Bezier curve for smooth lines
                            const controlDist = Math.abs(endX - startX) * 0.5;
                            const d = `M ${startX} ${startY} C ${startX + controlDist} ${startY}, ${endX - controlDist} ${endY}, ${endX} ${endY}`;

                            return (
                                <g key={`${dep.id}-${task.id}`}>
                                    <path 
                                        d={d} 
                                        stroke="#475569" 
                                        strokeWidth="2"
                                        fill="none"
                                        markerEnd="url(#arrowhead)"
                                    />
                                    {/* Invisible thick path for easier clicking if we added deletion */}
                                </g>
                            );
                        });
                    })}

                    {/* Temporary Connection Line (While Dragging) */}
                    {connectingFromId && (
                        <path 
                            d={`M ${workflow.tasks.find(t => t.id === connectingFromId)!.position.x + 192} ${workflow.tasks.find(t => t.id === connectingFromId)!.position.y + 40} L ${mousePos.x} ${mousePos.y}`}
                            stroke="#3b82f6"
                            strokeWidth="2"
                            strokeDasharray="5,5"
                            fill="none"
                        />
                    )}
                </svg>

                {/* Nodes Layer */}
                {workflow.tasks.map(task => {
                    const status = getTaskStatus(task.id);
                    const isSelected = selectedTaskId === task.id;
                    const isDragging = draggingTaskId === task.id;

                    return (
                        <div 
                            key={task.id}
                            className={`absolute w-48 bg-slate-900 border rounded-xl shadow-xl transition-shadow group
                                ${isSelected ? 'border-primary-500 ring-2 ring-primary-500/20 z-10' : 'border-slate-700 hover:border-slate-500'}
                                ${isDragging ? 'cursor-grabbing shadow-2xl' : 'cursor-grab'}
                            `}
                            style={{ 
                                left: task.position.x, 
                                top: task.position.y,
                                height: '80px' 
                            }}
                            onMouseDown={(e) => handleNodeMouseDown(e, task.id)}
                        >
                            {/* Input Handle (Left) */}
                            <div 
                                className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center cursor-crosshair hover:scale-110 transition-transform"
                                onMouseUp={(e) => {
                                    e.stopPropagation();
                                    if (connectingFromId) {
                                        handleConnect(connectingFromId, task.id);
                                        setConnectingFromId(null);
                                    }
                                }}
                            >
                                <div className={`w-3 h-3 rounded-full border-2 ${connectingFromId && connectingFromId !== task.id ? 'bg-primary-500 border-white animate-pulse' : 'bg-slate-900 border-slate-500'}`}></div>
                            </div>

                            {/* Node Content */}
                            <div className="p-3 h-full flex flex-col justify-between">
                                <div className="flex justify-between items-start">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                                        task.type === TaskType.INPUT ? 'bg-cyan-950/50 border-cyan-500/30 text-cyan-300' :
                                        task.type === TaskType.GENERATION ? 'bg-indigo-950/50 border-indigo-500/30 text-indigo-300' : 
                                        task.type === TaskType.TRANSFORMATION ? 'bg-blue-950/50 border-blue-500/30 text-blue-300' :
                                        'bg-amber-950/50 border-amber-500/30 text-amber-300'
                                    }`}>
                                        {task.type === TaskType.INPUT ? 'INPUT' : 
                                         task.type === TaskType.GENERATION ? 'GEN' : 
                                         task.type === TaskType.TRANSFORMATION ? 'CODE' : 'TEST'}
                                    </span>
                                    {status === 'RUNNING' && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-400" />}
                                    {status === 'COMPLETED' && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                                    {status === 'FAILED' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                                </div>
                                
                                <div className="flex items-center gap-2">
                                    <h4 className="text-xs font-bold text-slate-200 truncate select-none">{task.name}</h4>
                                </div>
                            </div>

                            {/* Output Handle (Right) */}
                            <div 
                                className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center cursor-crosshair hover:scale-110 transition-transform"
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setConnectingFromId(task.id);
                                }}
                            >
                                <div className="w-3 h-3 bg-slate-800 border-2 border-slate-400 rounded-full hover:bg-primary-500 hover:border-white transition-colors"></div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {/* Viewport Info Overlay */}
            <div className="absolute bottom-4 right-4 bg-slate-900/80 backdrop-blur border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-500 font-mono pointer-events-none">
                Zoom: {Math.round(viewport.zoom * 100)}% | X: {Math.round(viewport.x)} Y: {Math.round(viewport.y)}
            </div>
        </div>
    </div>
  );
};

export default WorkflowEngine;
