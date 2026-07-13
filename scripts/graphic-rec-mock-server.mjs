#!/usr/bin/env node
/**
 * 探究グラレコ — フィージビリティモック用ローカルサーバー
 * - 画像生成実験 (image-feasibility.html) — 複数プロンプト × DALL·E 3
 *
 * npm run mock:graphic-rec
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const MOCK_DIR = join(ROOT, 'cursor-handoff/mocks/graphic-rec');
const PORT = Number(process.env.GRAPHIC_REC_MOCK_PORT ?? 3456);

function loadEnv() {
  const path = join(ROOT, '.env');
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const ENV = loadEnv();
const ANTHROPIC_KEY = ENV.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = ENV.ANTHROPIC_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';
const IMAGE_SIZE =
  ENV.GRAPHIC_REC_IMAGE_SIZE ?? process.env.GRAPHIC_REC_IMAGE_SIZE ?? '1024x1024';
const OPENAI_KEY = ENV.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
/** 既定 gpt-image-2（ChatGPT Images 現行。1.5/1 は .env で指定可） */
const OPENAI_IMAGE_MODEL =
  ENV.OPENAI_IMAGE_MODEL ?? process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2';
const OPENAI_IMAGE_QUALITY_RAW =
  ENV.OPENAI_IMAGE_QUALITY ?? process.env.OPENAI_IMAGE_QUALITY ?? null;

function resolveOpenAiQuality(model) {
  if (model.startsWith('gpt-image-2')) {
    const q = OPENAI_IMAGE_QUALITY_RAW ?? 'medium';
    return ['low', 'medium', 'high', 'auto'].includes(q) ? q : 'medium';
  }
  if (model.startsWith('gpt-image')) {
    const q = OPENAI_IMAGE_QUALITY_RAW ?? 'medium';
    return ['low', 'medium', 'high'].includes(q) ? q : 'medium';
  }
  return undefined;
}

const OPENAI_IMAGE_QUALITY = resolveOpenAiQuality(OPENAI_IMAGE_MODEL);

/** UI サイズ → OpenAI API サイズ（gpt-image-1 は 1024x1536 が縦） */
const OPENAI_API_SIZE_MAP = {
  '1024x1024': '1024x1024',
  '1024x1792': '1024x1536',
};

const IMAGE_SIZE_PRESETS = {
  '1024x1024': {
    label: '1024×1024（1:1 正方形）',
    aspectW: 1,
    aspectH: 1,
    canvasHint:
      '正方形1:1（1024×1024相当）。中心に主題、周囲に小さな要素を**均等配置**（放射状・四象限・対角のいずれか）。',
  },
  '1024x1792': {
    label: '1024×1792（9:16 縦）',
    aspectW: 1024,
    aspectH: 1792,
    canvasHint:
      '縦長9:16（1024×1792相当）。**上中下の3層**—各層の中で横バランスを取る。縦に細長い帯状・スリープ配置は禁止。',
  },
};

function resolveImageSize(size) {
  return IMAGE_SIZE_PRESETS[size] ? size : IMAGE_SIZE;
}

function buildImageBatchSystem(imageSize) {
  const preset = IMAGE_SIZE_PRESETS[imageSize] ?? IMAGE_SIZE_PRESETS['1024x1024'];
  return `あなたは「子供のクレパス／クレヨンで描いた手書きイラスト」の画像生成プロンプト専門家。
探究（テーマに束ねられたメモと問い）から、**子供の手書き風・クレパス風の一枚絵**を生成するための**日本語プロンプト**を4種類作る。

## 最重要 — トーンと内容の区別
- **整えたいのはトーン（描き方）だけ**。表現の解像度や情報量を落としてはいけない。
- synthesis・問い・メモの内容は**豊かに視覚化**する。比喩・場面・矢印・記号・**手書きの日本語**を積極的に使う。
- **文字は歓迎**：見出し、短いラベル、吹き出し、矢印横のフレーズ。字は子供の手書き（丸く、不揃い、色付き）。
- **キーワードの表記**：探究の語は**漢字でもひらがなでもよい**。画像内で読みやすい・崩れにくい方を選ぶ（どちらかに寄せる必要はない）。
- text_in_image に列挙し、プロンプト内でも「」で指定。
- シンプル＝良い、ではない。**中身はグラレコ的に伝わる密度**で、**線と色だけが子供のクレヨン**。

## パターン選択（問い生成と同じ思想）
- 4パターンすべてのプロンプトを作るが、**この探究に最も合う1つ**を recommended_variant として選ぶ。
- 固定ルールで機械的に決めない。インプット（synthesis、メモの質、feeling の有無、因果の有無）から判断する。
- selection_reason は1文で。

パターンの意味:
1. metaphor — 抽象・対立・境界・二択。中央に比喩＋周囲に関連する小さな場面やラベル
2. narrative — 体験の before/after や因果。2〜3場面を矢印と**手書き文字**でつなぐ
3. human — feeling 多め、内面・葛藤・身体感。人物＋感情の比喩＋短い言葉
4. spatial — subtheme や問いの束。中心にテーマ、周囲に関連する**小さな場面**（机・散歩・木など）

## トーンガードレール（描き方のみ — 内容は削らない）
**子供のクレヨン質感** — プロのイラスト・ビジネス調に drift しない:
- 幼稚園〜小学低学年がクレヨンで**一生懸命描いた**感じ。線は太くムラがある。塗りに抜けと重なり。
- 人物: 丸い頭、短い手足、点目・線口。比例は崩れていてよい。**ただし場面・小物・文字は具体的に描く**。
- 机・椅子・時計・木・道・矢印・？マークなど、探究を伝える**小物は省略しない**。

**禁止するのは"上手い絵"の質感だけ**（image_prompt に明記）:
- プロのグラレコ、ビジネスイラスト、きれいなデジタルイラスト
- リアルな人体・正確な遠近法・影のグラデーション・5本の指
- スーツ姿のビジネスパーソン、会議室、ホワイトボード、チャート、インフォグラフィック
- きれいすぎるフォント、均一なマーカー線

**禁止しない**:
- 複数の場面・比喩・記号・日本語テキスト
- 机の上のPC、公園の木、ベンチ、時計など**探究に必要な具体物**

## 構図（バランス）
- 視覚的バランスを優先。情報は詰めるが、**プロっぽい整然さ**にはしない。
- 視線は Z字・中心→周辺・対角・矢印の流れ。

## キャンバス
- ${preset.canvasHint}
- image_prompt に必ず含める: 「${preset.label}」「子供のクレヨン手書き」「手書き日本語ラベルあり」

## スタイル
- クレパス／クレヨン、パステル、塗りムラ、画用紙のざらつき。
- text_in_image: 短い日本語を2〜5個。各8字前後。**漢字／ひらがなは内容に合わせて可**（例:「効率」でも「こうりつ」でも可）。

## 4 variant（構図の型 — 中身は豊かに）
1. metaphor — 中央に大きな比喩。周囲に関連場面・**手書きラベル**・矢印
2. narrative — 2〜3場面を矢印と**文字**でつなぐ（例:「あるく方が元気」）。対角やZ字配置
3. human — 人物と感情の比喩。吹き出しや短い言葉で内面を補う
4. spatial — 中心にテーマ語。周囲に subtheme ごとの**小さな場面**（必要なら机・外・身体など）

厳守:
- image_prompt は**日本語**250字以上。探究の具体（synthesis、メモ、問い）を視覚要素に落とす。
- 「子供のクレヨン手書き」と禁止トーンを必ず含める。

必ず次のJSONのみ:
{
  "exploration_title": "探究名",
  "recommended_variant": "metaphor|narrative|human|spatial",
  "selection_reason": "この探究にこのパターンが合う理由1文",
  "variants": [
    {"id":"metaphor","label":"比喩・中央","image_prompt":"…","intent":"1文","text_in_image":["短い日本語","…"]},
    {"id":"narrative","label":"場面・物語","image_prompt":"…","intent":"…","text_in_image":["…"]},
    {"id":"human","label":"人物・感情","image_prompt":"…","intent":"…","text_in_image":["…"]},
    {"id":"spatial","label":"中心・周辺","image_prompt":"…","intent":"…","text_in_image":["…"]}
  ],
  "notes": "トーン（描き方）と文字量の確認事項"
}`;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('JSON not found in model output');
  return JSON.parse(raw.slice(start, end + 1));
}

async function callAnthropic(system, user) {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY が .env にありません');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? `Anthropic ${response.status}`);
  const text = data.content?.find((c) => c.type === 'text')?.text ?? '';
  return { parsed: extractJson(text), raw: text, usage: data.usage };
}

function resolveOpenAiSize(uiSize) {
  const resolved = resolveImageSize(uiSize);
  if (OPENAI_IMAGE_MODEL.startsWith('gpt-image')) {
    return OPENAI_API_SIZE_MAP[resolved] ?? resolved;
  }
  return resolved;
}

async function callOpenAIImage(prompt, size = IMAGE_SIZE) {
  if (!OPENAI_KEY) return null;
  const apiSize = resolveOpenAiSize(size);
  const quality = resolveOpenAiQuality(OPENAI_IMAGE_MODEL);
  const body = {
    model: OPENAI_IMAGE_MODEL,
    prompt: prompt.slice(0, OPENAI_IMAGE_MODEL.startsWith('gpt-image-2') ? 8000 : 3800),
    n: 1,
    size: apiSize,
  };

  if (OPENAI_IMAGE_MODEL.startsWith('dall-e')) {
    body.response_format = 'b64_json';
  } else if (OPENAI_IMAGE_MODEL.startsWith('gpt-image-2')) {
    body.quality = quality;
    // gpt-image-2 は b64 を既定返却。response_format は非対応
  } else if (OPENAI_IMAGE_MODEL.startsWith('gpt-image')) {
    body.quality = quality;
    body.output_format = 'png';
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const msg = data?.error?.message ?? `OpenAI ${response.status}`;
    throw new Error(`${msg} (model=${OPENAI_IMAGE_MODEL}, size=${apiSize})`);
  }

  const item = data.data?.[0];
  if (item?.b64_json) {
    return `data:image/png;base64,${item.b64_json}`;
  }
  if (item?.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error(`画像URLの取得に失敗 (${imgRes.status})`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const mime = imgRes.headers.get('content-type') ?? 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  }
  return null;
}


async function handleImageBatch(exploration, variantIds, generateImages, imageSize, recommendedOnly) {
  const size = resolveImageSize(imageSize ?? IMAGE_SIZE);
  const { parsed, raw, usage } = await callAnthropic(
    buildImageBatchSystem(size),
    `画像サイズ: ${size}\n\n探究データ:\n${JSON.stringify(exploration, null, 2)}`,
  );

  const allVariants = parsed.variants ?? [];
  let selected = variantIds?.length
    ? allVariants.filter((v) => variantIds.includes(v.id))
    : allVariants;

  if (recommendedOnly && parsed.recommended_variant) {
    selected = allVariants.filter((v) => v.id === parsed.recommended_variant);
  }

  const results = [];
  for (const variant of selected) {
    const item = {
      ...variant,
      imageDataUrl: null,
      imageError: null,
      recommended: variant.id === parsed.recommended_variant,
    };
    if (generateImages && OPENAI_KEY) {
      try {
        item.imageDataUrl = await callOpenAIImage(variant.image_prompt, size);
      } catch (err) {
        item.imageError = err instanceof Error ? err.message : String(err);
      }
    } else if (generateImages && !OPENAI_KEY) {
      item.imageError = 'OPENAI_API_KEY 未設定';
    }
    results.push(item);
  }

  // フィージビリティ: 常に4プロンプト返却。画像は selected のみ生成。
  const variantsForClient = allVariants.map((v) => {
    const generated = results.find((r) => r.id === v.id);
    return {
      ...v,
      imageDataUrl: generated?.imageDataUrl ?? null,
      imageError: generated?.imageError ?? null,
      recommended: v.id === parsed.recommended_variant,
    };
  });

  return {
    exploration_title: parsed.exploration_title,
    recommended_variant: parsed.recommended_variant,
    selection_reason: parsed.selection_reason,
    notes: parsed.notes,
    variants: variantsForClient,
    raw,
    usage,
    imageApiConfigured: Boolean(OPENAI_KEY),
    imageSize: size,
    openAiImageModel: OPENAI_IMAGE_MODEL,
  };
}

function serveStatic(pathname, res) {
  const safe = pathname.replace(/\.\./g, '');
  const filePath = join(MOCK_DIR, safe === '/' ? 'index.html' : safe);
  if (!filePath.startsWith(MOCK_DIR) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  res.end(readFileSync(filePath));
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname === '/api/health') {
    json(res, 200, {
      ok: true,
      anthropic: Boolean(ANTHROPIC_KEY),
      openai: Boolean(OPENAI_KEY),
      model: ANTHROPIC_MODEL,
      imageSize: IMAGE_SIZE,
      imageSizePresets: Object.keys(IMAGE_SIZE_PRESETS),
      openAiImageModel: OPENAI_IMAGE_MODEL,
      openAiImageQuality: OPENAI_IMAGE_QUALITY,
    });
    return;
  }

  if (url.pathname === '/api/generate-image-batch' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.exploration) {
        json(res, 400, { error: 'exploration required' });
        return;
      }
      const result = await handleImageBatch(
        body.exploration,
        body.variantIds,
        Boolean(body.generateImages),
        body.imageSize,
        Boolean(body.recommendedOnly),
      );
      json(res, 200, result);
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (url.pathname === '/api/generate-image' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.prompt) {
        json(res, 400, { error: 'prompt required' });
        return;
      }
      const imageDataUrl = await callOpenAIImage(body.prompt, body.size ?? IMAGE_SIZE);
      json(res, 200, { imageDataUrl });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (req.method === 'GET') {
    serveStatic(url.pathname, res);
    return;
  }

  res.writeHead(405);
  res.end('Method not allowed');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ポート ${PORT} は使用中です。`);
    console.error(`  すでに起動済みなら http://localhost:${PORT}/ を開いてください。`);
    console.error(`  止める: lsof -ti :${PORT} | xargs kill -9\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`\n  探究グラレコ フィージビリティモック`);
  console.log(`  http://localhost:${PORT}/`);
  console.log(`  画像AI実験:    http://localhost:${PORT}/image-feasibility.html`);
  const preset = IMAGE_SIZE_PRESETS[IMAGE_SIZE] ?? IMAGE_SIZE_PRESETS['1024x1024'];
  console.log(`  画像サイズ:    ${preset.label}（UI で切替可）`);
  console.log(`  Anthropic: ${ANTHROPIC_KEY ? '✓' : '✗ .env に ANTHROPIC_API_KEY'}`);
  console.log(`  OpenAI:    ${OPENAI_KEY ? `✓ (${OPENAI_IMAGE_MODEL})` : '✗ 画像生成には OPENAI_API_KEY'}\n`);
});
