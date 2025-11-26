/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { z } from 'zod';

export const SFLFieldSchema = z.object({
  domain: z.string().min(3, "Domain must be at least 3 characters").max(50, "Domain too long"),
  process: z.string().min(3, "Process must be at least 3 characters").max(100, "Process too long")
});

export const SFLTenorSchema = z.object({
  senderRole: z.string().min(2, "Sender role required").max(30),
  receiverRole: z.string().min(2, "Receiver role required").max(30),
  powerStatus: z.enum(['Equal', 'High-to-Low', 'Low-to-High']),
  affect: z.enum(['Neutral', 'Enthusiastic', 'Critical', 'Sarcastic', 'Professional'])
});

export const SFLModeSchema = z.object({
  channel: z.enum(['Written', 'Spoken', 'Visual']),
  medium: z.string().min(2, "Medium required (e.g., Email, Code)"),
  rhetoricalMode: z.enum(['Didactic', 'Persuasive', 'Descriptive', 'Narrative'])
});
