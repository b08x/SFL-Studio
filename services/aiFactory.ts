/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from "@google/genai";
import { AIProvider, UserSettings } from "../types";
import { db } from "./storage";

// --- Adapter Interfaces ---

interface GenerationRequest {
  systemInstruction: string;
  prompt: string;
  model: string;
  settings: UserSettings;
}

// --- Providers ---

const generateGoogle = async ({ systemInstruction, prompt, model, settings }: GenerationRequest) => {
    const ai = new GoogleGenAI({ apiKey: settings.apiKeys.google || process.env.API_KEY });
    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction }
    });
    return response.text || "";
};

const generateOpenAICompatible = async (baseUrl: string, apiKey: string, { systemInstruction, prompt, model }: GenerationRequest) => {
    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
    } catch (e) {
        console.error("Provider Error", e);
        throw new Error("Failed to generate content from provider.");
    }
};

const generateOllama = async ({ systemInstruction, prompt, model, settings }: GenerationRequest) => {
    const baseUrl = settings.ollamaBaseUrl || 'http://localhost:11434/v1';
    // Ollama supports OpenAI compatible endpoint at /v1
    return generateOpenAICompatible(baseUrl, 'ollama', { systemInstruction, prompt, model, settings });
};

// --- Factory ---

export const generateTextStandard = async (provider: AIProvider, model: string, systemInstruction: string, prompt: string) => {
    const settings = db.settings.get();
    
    const request: GenerationRequest = { systemInstruction, prompt, model, settings };

    switch (provider) {
        case AIProvider.GOOGLE:
            return generateGoogle(request);
        case AIProvider.OPENROUTER:
            return generateOpenAICompatible('https://openrouter.ai/api/v1', settings.apiKeys.openrouter || '', request);
        case AIProvider.MISTRAL:
            return generateOpenAICompatible('https://api.mistral.ai/v1', settings.apiKeys.mistral || '', request);
        case AIProvider.OLLAMA:
            return generateOllama(request);
        default:
            throw new Error(`Provider ${provider} not supported`);
    }
};