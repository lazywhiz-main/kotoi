import { z } from 'npm:zod@3.24.1';

export const noteTypeSchema = z.enum(['seed', 'learn', 'task', 'feeling', 'ref']);
export const questionTypeSchema = z.enum(['dig', 'con', 'ref', 'act', 'exp']);

export const classifyResultSchema = z
  .object({
    type: noteTypeSchema,
    is_video: z.coerce.boolean().default(false),
    confidence: z.coerce.number().min(0).max(1).optional(),
    reason: z.string().optional(),
  })
  .transform((data) => ({
    type: data.type,
    is_video: data.is_video,
    confidence: data.confidence ?? 0.7,
    reason: data.reason?.trim() || '主要な意図で分類しました',
  }));

export const summarizeResultSchema = z.object({
  summary: z.string().min(1),
  key_points: z.array(z.string().min(1)).min(1).max(4),
});

export const generatedQuestionSchema = z.object({
  question_type: questionTypeSchema,
  body: z.string().min(1),
});

export const generateQuestionsResultSchema = z.object({
  questions: z.array(generatedQuestionSchema).max(5),
});

export const agentResultSchema = z.object({
  result: z.string().min(1),
  new_question: generatedQuestionSchema,
});

export const askTurnResultSchema = z.object({
  answer: z.string().min(1),
  follow_up_question: generatedQuestionSchema.nullable().optional(),
});

export const noteConnectionResultSchema = z.object({
  question: generatedQuestionSchema.nullable().optional(),
});

export const generateMoreQuestionResultSchema = z.object({
  question: generatedQuestionSchema.nullable().optional(),
});

export const thoughtDraftResultSchema = z.object({
  draft: z.string().min(1),
});

export const clusterSubthemeSchema = z.object({
  label: z.string().min(1).max(16),
  question_ids: z.array(z.string().uuid()).min(1),
});

export const clusterExplorationSchema = z.object({
  existing_exploration_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  short_label: z.string().min(1).max(32),
  synthesis: z.string().min(1),
  note_ids: z.array(z.string().uuid()).min(1),
  question_ids: z.array(z.string().uuid()).min(1),
  subthemes: z.array(clusterSubthemeSchema).min(1).max(8),
});

export const clusterExplorationsResultSchema = z.object({
  explorations: z.array(clusterExplorationSchema).max(6),
});

export type ClusterExploration = z.infer<typeof clusterExplorationSchema>;
export type ClusterExplorationsResult = z.infer<typeof clusterExplorationsResultSchema>;

export const weeklyReviewAiSchema = z.object({
  recurring_theme: z.string().min(1),
  hottest_question_id: z.string().uuid().nullable(),
  recall_question_id: z.string().uuid().nullable(),
  recall_prompt: z.string().min(1).nullable(),
});

export type WeeklyReviewAiResult = z.infer<typeof weeklyReviewAiSchema>;

export type ClassifyResult = z.infer<typeof classifyResultSchema>;
export type SummarizeResult = z.infer<typeof summarizeResultSchema>;
export type GenerateQuestionsResult = z.infer<typeof generateQuestionsResultSchema>;
export type AgentResult = z.infer<typeof agentResultSchema>;
export type AskTurnResult = z.infer<typeof askTurnResultSchema>;

export const graphicRecVariantIdSchema = z.enum(['metaphor', 'narrative', 'human', 'spatial']);

export const graphicRecVariantSchema = z.object({
  id: graphicRecVariantIdSchema,
  label: z.string().min(1),
  image_prompt: z.string().min(1),
  intent: z.string().min(1),
  text_in_image: z.array(z.string()).default([]),
});

export const graphicRecBatchResultSchema = z.object({
  exploration_title: z.string().min(1),
  recommended_variant: graphicRecVariantIdSchema,
  selection_reason: z.string().min(1),
  variants: z.array(graphicRecVariantSchema).min(1).max(4),
  notes: z.string().optional(),
});

export type GraphicRecVariantId = z.infer<typeof graphicRecVariantIdSchema>;
export type GraphicRecBatchResult = z.infer<typeof graphicRecBatchResultSchema>;
