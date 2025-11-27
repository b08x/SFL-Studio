/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Modality, Type, LiveServerMessage } from "@google/genai";
import { db } from "./storage";

const getAi = () => new GoogleGenAI({ apiKey: db.settings.get().apiKeys.google || process.env.API_KEY });

// --- Helpers ---

const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            const base64Data = base64String.split(',')[1];
            resolve({
                inlineData: {
                    data: base64Data,
                    mimeType: file.type
                }
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

// --- Grounded Generation ---

export const generateGroundedContent = async (model: string, prompt: string, systemInstruction?: string) => {
    const ai = getAi();
    // Use search tool if configured
    const tools = [{ googleSearch: {} }];

    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            tools,
            systemInstruction
        }
    });

    return {
        text: response.text || "",
        // Extract citations/sources from grounding metadata
        sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
            title: chunk.web?.title || "Source",
            url: chunk.web?.uri || ""
        })).filter((s: any) => s.url) || []
    };
};

// --- Context Extraction (Multimodal) ---

export const extractSFLFromContext = async (file: File) => {
    const model = 'gemini-2.5-flash'; 
    const filePart = await fileToGenerativePart(file);

    const prompt = `
        Analyze the provided content and extract the implicit Systemic Functional Linguistics (SFL) parameters.
        Identify the Field (Subject matter), Tenor (Relationships/Tone), and Mode (Channel/Format).
        Return JSON.
    `;

    const response = await getAi().models.generateContent({
        model,
        contents: {
            parts: [filePart, { text: prompt }]
        },
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    field: {
                        type: Type.OBJECT,
                        properties: {
                            domain: { type: Type.STRING },
                            process: { type: Type.STRING }
                        }
                    },
                    tenor: {
                        type: Type.OBJECT,
                        properties: {
                            senderRole: { type: Type.STRING },
                            receiverRole: { type: Type.STRING },
                            powerStatus: { type: Type.STRING, enum: ['Equal', 'High-to-Low', 'Low-to-High'] },
                            affect: { type: Type.STRING, enum: ['Neutral', 'Enthusiastic', 'Critical', 'Sarcastic', 'Professional'] }
                        }
                    },
                    mode: {
                        type: Type.OBJECT,
                        properties: {
                            channel: { type: Type.STRING, enum: ['Written', 'Spoken', 'Visual'] },
                            medium: { type: Type.STRING },
                            rhetoricalMode: { type: Type.STRING, enum: ['Didactic', 'Persuasive', 'Descriptive', 'Narrative'] }
                        }
                    }
                }
            }
        }
    });

    return JSON.parse(response.text || "{}");
};

// --- Live API (Voice Assistant) ---

export interface LiveConnectionCallbacks {
    onAudioData: (base64: string) => void;
    onTranscript: (role: 'user' | 'model', text: string, isFinal: boolean) => void;
    onToolCall: (toolName: string, args: any) => Promise<any>;
    onStatusChange: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
    onInterrupted: () => void;
}

export const connectLiveAssistant = async (
    config: { voiceName: string, model: string, systemInstruction: string },
    callbacks: LiveConnectionCallbacks
) => {
    const ai = getAi();
    
    const tools = [
        {
            functionDeclarations: [
                {
                    name: 'updateSFL',
                    description: 'Updates the SFL parameters (Field, Tenor, or Mode).',
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            category: { type: Type.STRING, enum: ['field', 'tenor', 'mode'] },
                            key: { type: Type.STRING },
                            value: { type: Type.STRING }
                        },
                        required: ['category', 'key', 'value']
                    }
                },
                {
                    name: 'replacePromptContent',
                    description: 'Completely replaces the current prompt content with new text.',
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            content: { type: Type.STRING, description: 'The new prompt text.' }
                        },
                        required: ['content']
                    }
                },
                {
                    name: 'createWorkflow',
                    description: 'Creates a new workflow in the Lab.',
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            description: { type: Type.STRING }
                        },
                        required: ['name']
                    }
                }
            ]
        }
    ];

    const session = await ai.live.connect({
        model: config.model,
        config: {
            tools: tools,
            responseModalities: [Modality.AUDIO],
            systemInstruction: config.systemInstruction,
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: config.voiceName
                    }
                }
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {}
        },
        callbacks: {
            onopen: () => callbacks.onStatusChange('connected'),
            onclose: () => callbacks.onStatusChange('disconnected'),
            onerror: (e) => {
                console.error("Live API Error:", e);
                callbacks.onStatusChange('error');
            },
            onmessage: async (msg: LiveServerMessage) => {
                // Audio Output
                const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (audioData) callbacks.onAudioData(audioData);

                // Handle Interruption
                if (msg.serverContent?.interrupted) {
                    callbacks.onInterrupted();
                }

                // Transcription (Input & Output)
                if (msg.serverContent?.inputTranscription) {
                     callbacks.onTranscript('user', msg.serverContent.inputTranscription.text, true);
                }
                if (msg.serverContent?.outputTranscription) {
                     callbacks.onTranscript('model', msg.serverContent.outputTranscription.text, true);
                }

                // Tool Execution
                if (msg.toolCall) {
                    for (const fc of msg.toolCall.functionCalls) {
                        try {
                            const result = await callbacks.onToolCall(fc.name, fc.args);
                            session.sendToolResponse({
                                functionResponses: [{
                                    id: fc.id,
                                    name: fc.name,
                                    response: { result: result || "Success" }
                                }]
                            });
                        } catch (e: any) {
                             session.sendToolResponse({
                                functionResponses: [{
                                    id: fc.id,
                                    name: fc.name,
                                    response: { error: e.message || "Failed" }
                                }]
                            });
                        }
                    }
                }
            }
        }
    });

    return session;
};