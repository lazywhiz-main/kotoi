/** 探究「見取り図」画像の生成・表示サイズ（本番共通） */

export const GRAPHIC_REC_IMAGE_SIZES = {
  square: {
    width: 1024,
    height: 1024,
    aspectRatio: 1,
    openAiSize: '1024x1024' as const,
    label: '1024×1024（1:1 正方形）',
    /** 構図バランスが取りやすい。現状の推奨 */
    recommended: true,
  },
  portrait: {
    width: 1024,
    height: 1792,
    aspectRatio: 1024 / 1792,
    openAiSize: '1024x1792' as const,
    label: '1024×1792（9:16 縦）',
    recommended: false,
  },
} as const;

/** デフォルトは 1:1（バランス重視） */
export const EXPLORATION_GRAPHIC_REC = GRAPHIC_REC_IMAGE_SIZES.square;

export type GraphicRecImageSizeKey = keyof typeof GRAPHIC_REC_IMAGE_SIZES;

export type GraphicRecVariantKey = 'metaphor' | 'narrative' | 'human' | 'spatial';

export const GRAPHIC_REC_VARIANT_LABELS: Record<GraphicRecVariantKey, string> = {
  metaphor: '比喩',
  narrative: '物語',
  human: '人物',
  spatial: '全体像',
};

export const GRAPHIC_REC_STORAGE_BUCKET = 'exploration-graphic-rec';

/**
 * 見取り図が古いか。
 * - status=stale なら確実に古い
 * - status=done でも、見取り図生成より後に探究が更新されていれば古い
 *   （DB の stale 制約未適用で status が残ったままのとき用）
 */
export function isGraphicRecOutdated(exploration: {
  graphic_rec_status: string | null | undefined;
  graphic_rec_generated_at?: string | null;
  updated_at?: string | null;
}): boolean {
  if (exploration.graphic_rec_status === 'stale') return true;
  if (exploration.graphic_rec_status !== 'done') return false;
  if (!exploration.graphic_rec_generated_at || !exploration.updated_at) return false;
  const generated = Date.parse(exploration.graphic_rec_generated_at);
  const updated = Date.parse(exploration.updated_at);
  if (Number.isNaN(generated) || Number.isNaN(updated)) return false;
  // 生成完了時の updated_at バンプを無視
  return updated - generated > 5_000;
}

export function graphicRecSizeByOpenAi(openAiSize: string) {
  return (
    Object.values(GRAPHIC_REC_IMAGE_SIZES).find((s) => s.openAiSize === openAiSize) ??
    EXPLORATION_GRAPHIC_REC
  );
}
