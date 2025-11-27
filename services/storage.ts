/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Prompt, Workflow, UserSettings, AIProvider } from '../types';

const STORAGE_KEYS = {
  PROMPTS: 'sfl_prompts_v2',
  WORKFLOWS: 'sfl_workflows_v2',
  SETTINGS: 'sfl_settings_v3' // Bumped version for new schema
};

const DEFAULT_SETTINGS: UserSettings = {
    apiKeys: {},
    useSearchGrounding: false,
    live: {
        voice: 'Zephyr',
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        quality: 'standard'
    },
    generation: {
        provider: AIProvider.GOOGLE,
        model: 'gemini-2.5-flash'
    },
    analysis: {
        provider: AIProvider.GOOGLE,
        model: 'gemini-3-pro-preview'
    }
};

// --- Mock Database Implementation ---

export const db = {
  prompts: {
    getAll: (): Prompt[] => {
      const data = localStorage.getItem(STORAGE_KEYS.PROMPTS);
      const prompts = data ? JSON.parse(data) : [];
      // Sort by updated recently
      return prompts.sort((a: Prompt, b: Prompt) => b.updatedAt - a.updatedAt);
    },
    getById: (id: string): Prompt | undefined => {
      const prompts = db.prompts.getAll();
      return prompts.find(p => p.id === id);
    },
    save: (prompt: Prompt): void => {
      const prompts = db.prompts.getAll();
      const index = prompts.findIndex(p => p.id === prompt.id);
      
      // Versioning Logic
      if (index >= 0) {
        const existing = prompts[index];
        // Only version if content or SFL changed substantially
        if (existing.content !== prompt.content) {
            prompt.version = existing.version + 1;
            prompt.history = [
                {
                    version: existing.version,
                    content: existing.content,
                    sfl: existing.sfl,
                    timestamp: existing.updatedAt,
                    changeDescription: 'Auto-save update'
                },
                ...existing.history
            ];
        } else {
             // Preserve history if just metadata update
            prompt.history = existing.history;
            prompt.version = existing.version;
        }
        prompts[index] = prompt;
      } else {
        prompts.push(prompt);
      }
      
      localStorage.setItem(STORAGE_KEYS.PROMPTS, JSON.stringify(prompts));
    },
    delete: (id: string): void => {
      const prompts = db.prompts.getAll().filter(p => p.id !== id);
      localStorage.setItem(STORAGE_KEYS.PROMPTS, JSON.stringify(prompts));
    }
  },
  workflows: {
    getAll: (): Workflow[] => {
        const data = localStorage.getItem(STORAGE_KEYS.WORKFLOWS);
        return data ? JSON.parse(data) : [];
    },
    save: (workflow: Workflow): void => {
        const flows = db.workflows.getAll();
        const index = flows.findIndex(w => w.id === workflow.id);
        if (index >= 0) {
            flows[index] = workflow;
        } else {
            flows.push(workflow);
        }
        localStorage.setItem(STORAGE_KEYS.WORKFLOWS, JSON.stringify(flows));
    },
    delete: (id: string): void => {
        const flows = db.workflows.getAll().filter(w => w.id !== id);
        localStorage.setItem(STORAGE_KEYS.WORKFLOWS, JSON.stringify(flows));
    }
  },
  settings: {
      get: (): UserSettings => {
          const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
          if (data) {
              const parsed = JSON.parse(data);
              // Migration helper for older versions
              return { ...DEFAULT_SETTINGS, ...parsed, apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...parsed.apiKeys } };
          }
          return DEFAULT_SETTINGS;
      },
      save: (settings: UserSettings) => {
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      }
  },
  system: {
    exportData: () => {
        const data = {
            prompts: db.prompts.getAll(),
            workflows: db.workflows.getAll(),
            settings: db.settings.get(),
            timestamp: Date.now(),
            version: '2.0'
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sfl-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },
    importData: async (file: File) => {
        const text = await file.text();
        try {
            const data = JSON.parse(text);
            if (data.prompts) localStorage.setItem(STORAGE_KEYS.PROMPTS, JSON.stringify(data.prompts));
            if (data.workflows) localStorage.setItem(STORAGE_KEYS.WORKFLOWS, JSON.stringify(data.workflows));
            if (data.settings) localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
            return true;
        } catch (e) {
            console.error("Import failed", e);
            return false;
        }
    }
  }
};

// Initial Seed
if (db.prompts.getAll().length === 0) {
    db.prompts.save({
        id: 'demo-1',
        title: 'API Documentation Generator',
        tags: ['Engineering', 'Docs'],
        updatedAt: Date.now(),
        version: 1,
        history: [],
        content: 'Write a technical documentation overview for a REST API that handles user authentication. The tone should be strictly professional and concise.',
        sfl: {
            field: { domain: 'Software Engineering', process: 'Documentation' },
            tenor: { senderRole: 'Technical Writer', receiverRole: 'Developer', powerStatus: 'Equal', affect: 'Professional' },
            mode: { channel: 'Written', medium: 'Markdown', rhetoricalMode: 'Didactic' }
        }
    });
}