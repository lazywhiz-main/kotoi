import { FunctionsHttpError } from '@supabase/supabase-js';

import { getSupabase } from './supabase';

export class ApiFunctionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly payload: Record<string, unknown>;

  constructor(code: string, status: number, payload: Record<string, unknown> = {}) {
    super(code);
    this.name = 'ApiFunctionError';
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

export async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase が未設定です。.env を確認してください。');
  }
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let payload: Record<string, unknown> = {};
      try {
        const json = (await error.context.json()) as Record<string, unknown>;
        payload = json ?? {};
      } catch {
        payload = {};
      }
      const code =
        typeof payload.error === 'string' ? payload.error : error.message || 'function_error';
      const status = error.context.status ?? 500;
      throw new ApiFunctionError(code, status, payload);
    }
    throw error;
  }
  return data as T;
}
