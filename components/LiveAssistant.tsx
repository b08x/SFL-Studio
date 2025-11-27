/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Maximize2, Minimize2, Activity, MessageSquare, Terminal, ChevronDown, Radio } from 'lucide-react';
import { connectLiveAssistant } from '../services/orchestrator';
import { pcmEncode, base64Encode, base64Decode, pcmToAudioBuffer } from '../services/audioUtils';
import { UserSettings } from '../types';

interface LiveAssistantProps {
    settings: UserSettings;
    context: {
        view: string;
        dataSummary: string;
    };
    onToolCall: (name: string, args: any) => Promise<any>;
}

interface TranscriptItem {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp: number;
}

const LiveAssistant: React.FC<LiveAssistantProps> = ({ settings, context, onToolCall }) => {
    // UI State
    const [isOpen, setIsOpen] = useState(false);
    const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
    const [isMuted, setIsMuted] = useState(false);
    const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
    
    // Refs for Audio & Session
    const sessionRef = useRef<any>(null);
    const inputContextRef = useRef<AudioContext | null>(null);
    const outputContextRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
    const sourceStreamRef = useRef<MediaStream | null>(null);
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll transcript
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcripts, isOpen]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnect();
        };
    }, []);

    const initializeAudioInput = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 16000 
            }});
            sourceStreamRef.current = stream;

            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            inputContextRef.current = ctx;

            const source = ctx.createMediaStreamSource(stream);
            // Buffer size 4096 = ~256ms latency at 16kHz
            const processor = ctx.createScriptProcessor(4096, 1, 1);

            processor.onaudioprocess = (e) => {
                if (isMuted || !sessionRef.current) return;
                
                const inputData = e.inputBuffer.getChannelData(0);
                const pcm16 = pcmEncode(inputData);
                const base64 = base64Encode(pcm16);
                
                // CRITICAL: Check promise/session availability safely
                // Since sessionRef.current is the raw session object here
                sessionRef.current.sendRealtimeInput({
                    media: {
                        mimeType: "audio/pcm;rate=16000",
                        data: base64
                    }
                });
            };

            source.connect(processor);
            processor.connect(ctx.destination);
        } catch (e) {
            console.error("Mic Access Error:", e);
            setStatus('error');
            throw e; 
        }
    };

    const playAudioChunk = async (base64: string) => {
        if (!outputContextRef.current) {
            outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = outputContextRef.current;
        const bytes = base64Decode(base64);
        const buffer = pcmToAudioBuffer(bytes, ctx);

        // Gapless playback scheduling
        const now = ctx.currentTime;
        // Schedule next chunk at the end of the last one, or immediately if we fell behind
        const startTime = Math.max(now, nextStartTimeRef.current);
        
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        
        // Track source for interruption
        activeSourcesRef.current.push(source);
        source.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
        };

        source.start(startTime);
        nextStartTimeRef.current = startTime + buffer.duration;
    };

    const handleInterruption = () => {
        activeSourcesRef.current.forEach(source => {
            try { source.stop(); } catch(e) {}
        });
        activeSourcesRef.current = [];
        if (outputContextRef.current) {
            nextStartTimeRef.current = outputContextRef.current.currentTime;
        }
    };

    const connect = async () => {
        setStatus('connecting');
        try {
            // 1. Setup Input
            await initializeAudioInput();

            // 2. Construct System Context
            const systemInstruction = `
            You are SFL-OS, an intelligent interface for the SFL Studio IDE.
            Current Context: User is in the '${context.view}' view.
            Active Data: ${context.dataSummary || 'None'}.
            
            Capabilities:
            - You can update SFL parameters (Field, Tenor, Mode).
            - You can write or rewrite prompt content.
            - You can create workflows.
            
            Be concise, professional, and act as a co-pilot.
            `;

            // 3. Connect API
            const session = await connectLiveAssistant(
                { 
                    voiceName: settings.live.voice, 
                    model: settings.live.model,
                    systemInstruction 
                },
                {
                    onStatusChange: setStatus,
                    onAudioData: playAudioChunk,
                    onInterrupted: handleInterruption,
                    onTranscript: (role, text) => {
                         setTranscripts(prev => {
                             // Simple deduping/update logic could go here, for now appending
                             const last = prev[prev.length - 1];
                             if (last && last.role === role && !last.text.endsWith('\n')) {
                                 // Could merge chunks if we wanted streaming text update logic
                                 // But here we just append logic for simplicity
                             }
                             return [...prev, { id: Date.now().toString(), role, text, timestamp: Date.now() }];
                         });
                    },
                    onToolCall: async (name, args) => {
                        return await onToolCall(name, args);
                    }
                }
            );
            sessionRef.current = session;
            setIsOpen(true);

        } catch (e) {
            console.error(e);
            setStatus('error');
            disconnect();
        }
    };

    const disconnect = () => {
        handleInterruption();
        if (sessionRef.current) {
            sessionRef.current = null; 
        }
        if (sourceStreamRef.current) {
            sourceStreamRef.current.getTracks().forEach(t => t.stop());
            sourceStreamRef.current = null;
        }
        if (inputContextRef.current) {
            inputContextRef.current.close();
            inputContextRef.current = null;
        }
        if (outputContextRef.current) {
            outputContextRef.current.close();
            outputContextRef.current = null;
        }
        setStatus('disconnected');
    };

    const toggleMute = () => setIsMuted(!isMuted);

    // --- Render ---

    // 1. Collapsed State (FAB)
    if (!isOpen && status === 'disconnected') {
        return (
            <button
                onClick={connect}
                className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-primary-600 to-indigo-600 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform z-50 group border border-white/10"
                title="Start SFL-OS Live Assistant"
            >
                <div className="absolute inset-0 bg-primary-400 rounded-full opacity-0 group-hover:animate-ping"></div>
                <Mic className="w-6 h-6 text-white relative z-10" />
            </button>
        );
    }

    // 2. Expanded/Active State (Panel)
    return (
        <div className={`fixed bottom-6 right-6 w-96 bg-slate-950/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl z-50 flex flex-col transition-all duration-300 ${isOpen ? 'h-[500px] opacity-100 translate-y-0' : 'h-14 w-14 opacity-0 translate-y-10 pointer-events-none'}`}>
            
            {/* Header */}
            <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900/50 rounded-t-2xl">
                <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${status === 'connected' ? 'bg-emerald-500 animate-pulse' : status === 'connecting' ? 'bg-amber-500 animate-spin' : 'bg-red-500'}`}></div>
                    <span className="font-display font-bold text-slate-200">SFL-OS Live</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsOpen(false)} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
                        <Minimize2 className="w-4 h-4" />
                    </button>
                    <button onClick={disconnect} className="p-2 text-red-400 hover:text-red-300 rounded-lg hover:bg-red-900/20">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Transcript Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {transcripts.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
                        <Activity className="w-8 h-8 opacity-50" />
                        <p className="text-xs">Listening for commands...</p>
                        <p className="text-[10px] text-slate-700 max-w-[200px] text-center">Try "Change tone to sarcastic" or "Rewrite the prompt"</p>
                    </div>
                )}
                {transcripts.map((t) => (
                    <div key={t.id} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-xl p-3 text-sm ${
                            t.role === 'user' 
                            ? 'bg-indigo-600 text-white rounded-tr-none' 
                            : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700'
                        }`}>
                            {t.text}
                        </div>
                    </div>
                ))}
                <div ref={transcriptEndRef} />
            </div>

            {/* Footer / Controls */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/30 rounded-b-2xl">
                <div className="flex items-center justify-between gap-4">
                     <div className="flex-1 h-8 bg-slate-900 rounded-full border border-slate-800 overflow-hidden relative flex items-center justify-center">
                         {/* Fake Waveform Visualization */}
                         {!isMuted && status === 'connected' && (
                             <div className="flex gap-1 items-center h-full">
                                 {[1,2,3,4,5].map(i => (
                                     <div key={i} className="w-1 bg-emerald-500 rounded-full animate-[bounce_1s_infinite]" style={{ height: '40%', animationDelay: `${i * 0.1}s` }}></div>
                                 ))}
                             </div>
                         )}
                         {isMuted && <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Muted</span>}
                     </div>

                     <button 
                        onClick={toggleMute}
                        className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all ${
                            isMuted 
                            ? 'bg-red-500/10 border-red-500 text-red-400' 
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        }`}
                     >
                        {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                     </button>
                </div>
            </div>
        </div>
    );
};

export default LiveAssistant;