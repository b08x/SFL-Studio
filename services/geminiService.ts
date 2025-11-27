/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { SFLField, SFLTenor, SFLMode, SFLAnalysis, AIModel, AIProvider } from "../types";

const getAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Helpers ---

const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
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

// --- Model Listing ---

export const getAvailableModels = async (): Promise<AIModel[]> => {
    const DEFAULTS: AIModel[] = [
        { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', provider: AIProvider.GOOGLE },
        { name: 'gemini-3-pro-preview', displayName: 'Gemini 3.0 Pro', provider: AIProvider.GOOGLE },
        { name: 'gemini-2.5-flash-native-audio-preview-09-2025', displayName: 'Gemini 2.5 Flash Live Audio', provider: AIProvider.GOOGLE },
        { name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', provider: AIProvider.GOOGLE },
        { name: 'veo-3.1-fast-generate-preview', displayName: 'Veo 3.1 Fast', provider: AIProvider.GOOGLE }
    ];

    try {
        const ai = getAi();
        // @ts-ignore
        const response = await ai.models.list();
        const models = [];
        
        // Handle if response is standard array container or iterable pager
        // @ts-ignore
        if (response.models && Array.isArray(response.models)) {
            // @ts-ignore
            models.push(...response.models);
        } else {
             // @ts-ignore
             for await (const m of response) {
                models.push(m);
            }
        }
        
        if (models.length > 0) {
            return models.map((m: any) => ({
                name: m.name.replace('models/', ''),
                displayName: m.displayName,
                provider: AIProvider.GOOGLE,
                description: m.description,
                supportedGenerationMethods: m.supportedGenerationMethods
            }));
        }
        return DEFAULTS;
    } catch (e) {
        console.warn("Failed to fetch models from API (likely restricted key or CORS). Using defaults.", e);
        return DEFAULTS;
    }
};

// --- Standard Generation (Flash) ---

export const generatePromptFromSFL = async (sfl: { field: SFLField, tenor: SFLTenor, mode: SFLMode }, context: string = "") => {
  const model = 'gemini-2.5-flash';
  
  const systemInstruction = `
    You are an expert Prompt Engineer specializing in Systemic Functional Linguistics (SFL).
    Your task is to generate a high-quality LLM prompt based on the following SFL parameters:
    
    FIELD (The Subject):
    - Domain: ${sfl.field.domain}
    - Process: ${sfl.field.process}
    
    TENOR (The Participants):
    - Sender: ${sfl.tenor.senderRole}
    - Receiver: ${sfl.tenor.receiverRole}
    - Power: ${sfl.tenor.powerStatus}
    - Affect: ${sfl.tenor.affect}
    
    MODE (The Channel):
    - Channel: ${sfl.mode.channel}
    - Medium: ${sfl.mode.medium}
    - Rhetorical: ${sfl.mode.rhetoricalMode}

    Output ONLY the resulting prompt text. Do not explain your reasoning.
  `;

  const response = await getAi().models.generateContent({
    model,
    contents: context ? `Refine this existing prompt based on the SFL parameters: "${context}"` : "Generate a prompt based on the SFL parameters.",
    config: {
        systemInstruction,
        temperature: 0.7
    }
  });

  return response.text || "";
};

// --- Context Extraction (Multimodal) ---

export const extractSFLFromContext = async (file: File) => {
    const model = 'gemini-2.5-flash'; // Supports image, video, audio, text
    const filePart = await fileToGenerativePart(file);

    const prompt = `
        Analyze the provided content (Text, Image, Audio, or Video) and extract the implicit Systemic Functional Linguistics (SFL) parameters.
        Identify the Field (Subject matter), Tenor (Relationships/Tone), and Mode (Channel/Format).
        
        Return the result as a strict JSON object matching the SFL schema.
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

// --- Quality Analysis (Pro) ---

export const analyzePromptWithSFL = async (promptText: string, sfl: { field: SFLField, tenor: SFLTenor, mode: SFLMode }): Promise<SFLAnalysis> => {
    const model = 'gemini-3-pro-preview';
    
    const prompt = `
      Analyze the following prompt text against the provided Systemic Functional Linguistics (SFL) parameters.
      
      TARGET SFL PARAMETERS:
      Field: Domain=${sfl.field.domain}, Process=${sfl.field.process}
      Tenor: Sender=${sfl.tenor.senderRole}, Receiver=${sfl.tenor.receiverRole}, Affect=${sfl.tenor.affect}
      Mode: Channel=${sfl.mode.channel}, Rhetorical=${sfl.mode.rhetoricalMode}
      
      PROMPT TO ANALYZE:
      "${promptText}"
      
      Evaluate alignment and provide specific feedback.
    `;

    const response = await getAi().models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    score: { type: Type.NUMBER, description: "Overall quality score 0-100" },
                    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
                    suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                    sflAlignment: {
                        type: Type.OBJECT,
                        properties: {
                            field: { type: Type.NUMBER, description: "Alignment score 0-10" },
                            tenor: { type: Type.NUMBER, description: "Alignment score 0-10" },
                            mode: { type: Type.NUMBER, description: "Alignment score 0-10" }
                        }
                    }
                }
            }
        }
    });

    if (response.text) {
        const parsed = JSON.parse(response.text);
        // Ensure arrays exist
        parsed.strengths = parsed.strengths || [];
        parsed.weaknesses = parsed.weaknesses || [];
        parsed.suggestions = parsed.suggestions || [];
        return parsed as SFLAnalysis;
    }
    throw new Error("Analysis failed");
};

// --- Wizard Generation ---

export const generateWizardSuggestion = async (input: string) => {
    const model = 'gemini-2.5-flash';
    const response = await getAi().models.generateContent({
        model,
        contents: `Given the user input "${input}", suggest SFL parameters in JSON format.`,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    domain: { type: Type.STRING },
                    process: { type: Type.STRING },
                    senderRole: { type: Type.STRING },
                    receiverRole: { type: Type.STRING },
                    affect: { type: Type.STRING },
                    rhetoricalMode: { type: Type.STRING }
                }
            }
        }
    });
    return JSON.parse(response.text || "{}");
}

// --- Live API (Voice Assistant) ---

export const connectLiveAssistant = async (
    config: { voiceName: string, model: string },
    onAudioData: (base64: string) => void,
    onToolCall: (toolName: string, args: any) => Promise<any>,
    onStatusChange: (status: string) => void
) => {
    const ai = getAi();
    
    // Tools definition for the assistant to control the UI
    const tools = [
        {
            functionDeclarations: [
                {
                    name: 'updateSFL',
                    description: 'Updates the SFL parameters (Field, Tenor, or Mode) of the current prompt.',
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            category: { type: Type.STRING, enum: ['field', 'tenor', 'mode'] },
                            key: { type: Type.STRING, description: 'The specific property key to update (e.g., "affect", "domain")' },
                            value: { type: Type.STRING, description: 'The new value' }
                        },
                        required: ['category', 'key', 'value']
                    }
                },
                {
                    name: 'generate',
                    description: 'Triggers the generation of the prompt text.',
                    parameters: { type: Type.OBJECT, properties: {} }
                }
            ]
        }
    ];

    const session = await ai.live.connect({
        model: config.model,
        config: {
            tools: tools,
            responseModalities: [Modality.AUDIO],
            systemInstruction: "You are 'SFL-OS', a helpful AI coding assistant integrated into a prompt engineering IDE. You can update the user's settings, field, tenor, and mode parameters directly. Be concise and professional, like a ship's computer.",
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: config.voiceName
                    }
                }
            }
        },
        callbacks: {
            onopen: () => onStatusChange('connected'),
            onclose: () => onStatusChange('disconnected'),
            onerror: (e) => {
                console.error(e);
                onStatusChange('error');
            },
            onmessage: async (msg) => {
                // Handle Audio
                const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (audioData) onAudioData(audioData);

                // Handle Tool Calls
                if (msg.toolCall) {
                    for (const fc of msg.toolCall.functionCalls) {
                        const result = await onToolCall(fc.name, fc.args);
                        
                        // Send response back
                        session.sendToolResponse({
                            functionResponses: [{
                                id: fc.id,
                                name: fc.name,
                                response: { result: "Success" } // Simplified response
                            }]
                        });
                    }
                }
            }
        }
    });

    return session;
};