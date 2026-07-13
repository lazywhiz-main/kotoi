const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_SIZE = '1024x1024';

function resolveQuality(model: string): string {
  const raw = Deno.env.get('OPENAI_IMAGE_QUALITY');
  if (model.startsWith('gpt-image-2')) {
    const q = raw ?? 'medium';
    return ['low', 'medium', 'high', 'auto'].includes(q) ? q : 'medium';
  }
  if (model.startsWith('gpt-image')) {
    const q = raw ?? 'medium';
    return ['low', 'medium', 'high'].includes(q) ? q : 'medium';
  }
  return 'medium';
}

export type OpenAiImageResult = {
  bytes: Uint8Array;
  mime: string;
  model: string;
  size: string;
};

export async function generateOpenAiImage(prompt: string): Promise<OpenAiImageResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = Deno.env.get('OPENAI_IMAGE_MODEL') ?? DEFAULT_MODEL;
  const size = Deno.env.get('GRAPHIC_REC_IMAGE_SIZE') ?? DEFAULT_SIZE;
  const quality = resolveQuality(model);

  const body: Record<string, unknown> = {
    model,
    prompt: prompt.slice(0, model.startsWith('gpt-image-2') ? 8000 : 3800),
    n: 1,
    size,
  };

  if (model.startsWith('dall-e')) {
    body.response_format = 'b64_json';
  } else if (model.startsWith('gpt-image-2')) {
    body.quality = quality;
  } else if (model.startsWith('gpt-image')) {
    body.quality = quality;
    body.output_format = 'png';
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    const msg = data?.error?.message ?? `OpenAI ${response.status}`;
    throw new Error(`${msg} (model=${model}, size=${size})`);
  }

  const item = data.data?.[0];
  if (item?.b64_json) {
    const binary = Uint8Array.from(atob(item.b64_json), (c) => c.charCodeAt(0));
    return { bytes: binary, mime: 'image/png', model, size };
  }

  if (item?.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error(`Failed to fetch image URL (${imgRes.status})`);
    const buffer = await imgRes.arrayBuffer();
    const mime = imgRes.headers.get('content-type') ?? 'image/png';
    return { bytes: new Uint8Array(buffer), mime, model, size };
  }

  throw new Error('OpenAI image response was empty');
}

/** gpt-image-2 の概算（1枚） */
export function estimateOpenAiImageCostUsd(): number {
  const model = Deno.env.get('OPENAI_IMAGE_MODEL') ?? DEFAULT_MODEL;
  const quality = resolveQuality(model);
  if (quality === 'high') return 0.13;
  if (quality === 'low') return 0.009;
  return 0.034;
}
