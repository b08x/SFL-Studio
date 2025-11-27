/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// --- SFL Core Models ---

export interface SFLField {
  domain: string; // What is happening? (e.g., "Software Engineering", "Cooking")
  process: string; // The action (e.g., "Debugging", "Explaining")
}

export interface SFLTenor {
  senderRole: string; // Who is speaking? (e.g., "Senior Architect")
  receiverRole: string; // Who is listening? (e.g., "Junior Dev")
  powerStatus: 'Equal' | 'High-to-Low' | 'Low-to-High';
  affect: 'Neutral' | 'Enthusiastic' | 'Critical' | 'Sarcastic' | 'Professional';
}

export interface SFLMode {
  channel: 'Written' | 'Spoken' | 'Visual';
  medium: string; // e.g., "Email", "Slack Message", "Technical Documentation"
  rhetoricalMode: 'Didactic' | 'Persuasive' | 'Descriptive' | 'Narrative';
}

export interface SFLAnalysis {
  score: number; // 0-100
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  sflAlignment: {
    field: number;
    tenor: number;
    mode: number;
  };
}

// --- Application Models ---

export interface Prompt {
  id: string;
  title: string;
  tags: string[];
  sfl: {
    field: SFLField;
    tenor: SFLTenor;
    mode: SFLMode;
  };
  content: string; // The generated or written prompt text
  version: number;
  history: PromptVersion[];
  lastAnalysis?: SFLAnalysis;
  updatedAt: number;
}

export interface PromptVersion {
  version: number;
  content: string;
  sfl: {
    field: SFLField;
    tenor: SFLTenor;
    mode: SFLMode;
  };
  timestamp: number;
  changeDescription?: string;
}

export enum AIProvider {
  GOOGLE = 'google',
  OPENROUTER = 'openrouter',
  MISTRAL = 'mistral',
  OLLAMA = 'ollama'
}

export interface UserSettings {
  apiKeys: {
    google?: string;
    openrouter?: string;
    mistral?: string;
    ollama?: string; // Kept for consistency, though Ollama usually doesn't need a key
  };
  ollamaBaseUrl?: string;
  useSearchGrounding: boolean;
  live: {
    voice: string;
    model: string;
    quality: 'low' | 'standard' | 'high';
  };
  generation: {
    provider: AIProvider;
    model: string;
  };
  analysis: {
    provider: AIProvider;
    model: string;
  };
}

export interface AIModel {
  name: string;
  displayName: string;
  provider: AIProvider;
  description?: string;
  supportedGenerationMethods?: string[];
  isVisionCapable?: boolean;
}

// --- Workflow & Lab Models ---

export enum TaskType {
  INPUT = 'INPUT',
  GENERATION = 'GENERATION',
  TRANSFORMATION = 'TRANSFORMATION',
  ANALYSIS = 'ANALYSIS',
  HUMAN_REVIEW = 'HUMAN_REVIEW'
}

export interface WorkflowTask {
  id: string;
  type: TaskType;
  name: string;
  description?: string;
  config: {
    promptId?: string; // For generation
    code?: string; // For transformation (JS)
    targetKey?: string; // Where to store result in context
    inputType?: 'text' | 'file' | 'audio' | 'video'; // For INPUT tasks
    inputValue?: string; // Raw text content
    fileName?: string; // For file inputs
    fileType?: string; // Mime type
  };
  position: { x: number; y: number }; // For canvas visualization
  dependencies: string[]; // IDs of tasks that must finish first
}

export interface WorkflowExecutionLog {
  taskId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  output?: any;
  error?: string;
  timestamp: number;
}

export interface Workflow {
  id: string;
  name: string;
  tasks: WorkflowTask[];
  lastRun?: number;
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  logs: WorkflowExecutionLog[];
}

export interface GeneratedImage {
  id: string;
  data: string;
  prompt: string;
}

export interface SearchResultItem {
  title: string;
  url: string;
}