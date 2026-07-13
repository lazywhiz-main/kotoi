import { z } from 'npm:zod@3.24.1';

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
}

export type AnthropicJsonResult<T> = {
  data: T;
  inputTokens: number;
  outputTokens: number;
};

export async function callAnthropicJson<T>(
  system: string,
  userContent: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const result = await callAnthropicJsonWithUsage(system, userContent, schema);
  return result.data;
}

export type AnthropicCallOptions = {
  maxTokens?: number;
};

type AnthropicPayload = {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

function extractTextFromPayload(payload: AnthropicPayload): string | null {
  const parts = (payload.content ?? [])
    .filter((block): block is { type: 'text'; text: string } =>
      block.type === 'text' && typeof block.text === 'string' && block.text.length > 0,
    )
    .map((block) => block.text);

  if (parts.length === 0) return null;
  return parts.join('\n');
}

function shouldDisableThinking(): boolean {
  // Sonnet 5 等は thinking が max_tokens を食い、JSON 本文が空になることがある。
  // JSON 専用では無効化を既定。戻すなら secrets で ANTHROPIC_THINKING=adaptive
  const mode = (Deno.env.get('ANTHROPIC_THINKING') ?? 'disabled').toLowerCase();
  return mode !== 'adaptive' && mode !== 'enabled' && mode !== 'on';
}

async function postMessages(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<AnthropicPayload> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${detail}`);
  }

  return (await response.json()) as AnthropicPayload;
}

export async function callAnthropicJsonWithUsage<T>(
  system: string,
  userContent: string,
  schema: z.ZodType<T>,
  options?: AnthropicCallOptions,
): Promise<AnthropicJsonResult<T>> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-20250514';
  let maxTokens = options?.maxTokens ?? 2048;
  let useThinkingDisabled = shouldDisableThinking();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }],
    };
    if (useThinkingDisabled) {
      body.thinking = { type: 'disabled' };
    }

    let payload: AnthropicPayload;
    try {
      payload = await postMessages(apiKey, body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // thinking.disabled 非対応なら外して再試行
      if (useThinkingDisabled && message.includes('Anthropic API error 400')) {
        useThinkingDisabled = false;
        lastError = err instanceof Error ? err : new Error(message);
        continue;
      }
      throw err;
    }

    const text = extractTextFromPayload(payload);
    if (!text) {
      const blockTypes = (payload.content ?? []).map((block) => block.type).join(',');
      lastError = new Error(
        `Anthropic response had no text (stop_reason=${payload.stop_reason ?? 'unknown'}, blocks=${blockTypes || 'none'})`,
      );
      if (payload.stop_reason === 'max_tokens') {
        maxTokens = Math.min(Math.max(maxTokens * 2, 16_384), 32_000);
      }
      continue;
    }

    try {
      const parsed = JSON.parse(extractJson(text));
      const data = schema.parse(parsed);
      const usage = payload.usage ?? {};
      return {
        data,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error('Failed to parse Anthropic JSON');
}
