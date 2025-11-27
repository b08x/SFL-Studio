/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { SFLField, SFLTenor, SFLMode, AIProvider, AIModel } from "../types";
import { db } from "./storage";
import { generateTextStandard } from "./aiFactory";
import { generateGroundedContent } from "./googleNativeService";
import { GoogleGenAI, Type } from "@google/genai";

// Re-export native features
export { connectLiveAssistant, extractSFLFromContext } from "./googleNativeService";

export const getAvailableModels = async (): Promise<AIModel[]> => {
    const settings = db.settings.get();
    let models: AIModel[] = [];

    // 1. Google Models
    const googleModels: AIModel[] = [
        { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', provider: AIProvider.GOOGLE },
        { name: 'gemini-3-pro-preview', displayName: 'Gemini 3.0 Pro', provider: AIProvider.GOOGLE },
        { name: 'gemini-2.5-flash-native-audio-preview-09-2025', displayName: 'Gemini Live Audio', provider: AIProvider.GOOGLE }
    ];
    models = [...models, ...googleModels];

    // 2. OpenRouter (Example list, in real app fetch from API)
    if (settings.apiKeys.openrouter) {
        models.push(
            { name: 'anthropic/claude-3-opus', displayName: 'Claude 3 Opus (OpenRouter)', provider: AIProvider.OPENROUTER },
            { name: 'openai/gpt-4-turbo', displayName: 'GPT-4 Turbo (OpenRouter)', provider: AIProvider.OPENROUTER }
        );
    }

    // 3. Mistral
    if (settings.apiKeys.mistral) {
        models.push(
            { name: 'mistral-large-latest', displayName: 'Mistral Large', provider: AIProvider.MISTRAL },
            { name: 'mistral-medium', displayName: 'Mistral Medium', provider: AIProvider.MISTRAL }
        );
    }

    // 4. Ollama
    if (settings.ollamaBaseUrl) {
        models.push(
            { name: 'llama3', displayName: 'Llama 3 Local', provider: AIProvider.OLLAMA },
            { name: 'mistral', displayName: 'Mistral Local', provider: AIProvider.OLLAMA }
        );
    }

    return models;
};

export const generatePromptFromSFL = async (sfl: { field: SFLField, tenor: SFLTenor, mode: SFLMode }, context: string = "") => {
    const settings = db.settings.get();
    const { provider, model } = settings.generation;

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

    const userPrompt = context ? `Refine this existing prompt based on the SFL parameters: "${context}"` : "Generate a prompt based on the SFL parameters.";

    // If Search Grounding is enabled (Only supported on Google)
    if (settings.useSearchGrounding && provider === AIProvider.GOOGLE) {
        const result = await generateGroundedContent(model, userPrompt, systemInstruction);
        // Append sources to text for now
        let text = result.text;
        if (result.sources && result.sources.length > 0) {
            text += "\n\n--- Sources ---\n" + result.sources.map(s => `- [${s.title}](${s.url})`).join('\n');
        }
        return text;
    }

    // Standard Generation (Factory)
    return await generateTextStandard(provider, model, systemInstruction, userPrompt);
};

export const analyzePromptWithSFL = async (promptText: string, sfl: { field: SFLField, tenor: SFLTenor, mode: SFLMode }) => {
    const settings = db.settings.get();
    const { provider, model } = settings.analysis;

    // We need a structured JSON response.
    // Google Native supports schema enforcement well.
    // Others might need a prompt hack. For V2, we force JSON in prompt.

    const systemInstruction = `
      Analyze the prompt against SFL parameters.
      TARGET: Field(${sfl.field.domain}, ${sfl.field.process}), Tenor(${sfl.tenor.senderRole}, ${sfl.tenor.affect}), Mode(${sfl.mode.channel}).
      Return valid JSON matching this structure:
      {
        "score": number (0-100),
        "strengths": string[],
        "weaknesses": string[],
        "suggestions": string[],
        "sflAlignment": { "field": number, "tenor": number, "mode": number }
      }
    `;

    // Special handling for Google to use native schema if possible
    if (provider === AIProvider.GOOGLE) {
         const ai = new GoogleGenAI({ apiKey: settings.apiKeys.google || process.env.API_KEY });
         const response = await ai.models.generateContent({
            model,
            contents: `Analyze: "${promptText}"`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        score: { type: Type.NUMBER },
                        strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                        weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
                        suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        sflAlignment: {
                            type: Type.OBJECT,
                            properties: {
                                field: { type: Type.NUMBER },
                                tenor: { type: Type.NUMBER },
                                mode: { type: Type.NUMBER }
                            }
                        }
                    }
                }
            }
        });
        return JSON.parse(response.text || "{}");
    }

    // Fallback for generic providers (expecting them to follow JSON instruction)
    const text = await generateTextStandard(provider, model, systemInstruction, `Analyze this prompt: "${promptText}"`);
    try {
        // Simple heuristic to find JSON blob
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (e) {
        console.error("Analysis JSON parse failed", e);
        return { score: 0, strengths: [], weaknesses: ["Failed to parse analysis"], suggestions: [], sflAlignment: { field:0, tenor:0, mode:0 }};
    }
};

export const generateWizardSuggestion = async (input: string) => {
    // Using Google Flash for wizard for speed and schema reliability
    const ai = new GoogleGenAI({ apiKey: db.settings.get().apiKeys.google || process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
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
};