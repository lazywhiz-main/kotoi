import {
  FilterMode,
  ImageFormat,
  MipmapMode,
  Skia,
  matchFont,
  type SkCanvas,
} from '@shopify/react-native-skia';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

import { track } from '@/lib/analytics';

/** Instagram フィード向け 4:5（最大表示） */
export const INSTAGRAM_FEED_SIZE = { width: 1080, height: 1350 } as const;

const PAPER_BG = '#f6f4ee';
const WATERMARK_TEXT = 'mondo.app';

type ComposeOptions = {
  /** デフォルト true。SEAM: 設定の「ウォーターマークをオフ」と接続 */
  watermark?: boolean;
};

/**
 * 見取り図を Instagram フィード用（1080×1350）に書き出す。
 * 上下余白で中央配置し、右下に控えめな WM を載せる。
 */
export async function composeGraphicRecForInstagram(
  imageUrl: string,
  options: ComposeOptions = {}
): Promise<string> {
  const includeWatermark = options.watermark !== false;
  const { width: W, height: H } = INSTAGRAM_FEED_SIZE;

  const dir = new Directory(Paths.cache, 'graphic-rec-post');
  if (!dir.exists) {
    dir.create();
  }

  const source = new File(dir, `src-${Date.now()}.png`);
  const downloaded = await File.downloadFileAsync(imageUrl, source, { idempotent: true });

  const data = await Skia.Data.fromURI(downloaded.uri);
  const srcImage = Skia.Image.MakeImageFromEncoded(data);
  if (!srcImage) {
    throw new Error('画像を読み込めませんでした');
  }

  const surface = Skia.Surface.MakeOffscreen(W, H);
  if (!surface) {
    throw new Error('投稿用画像を作れませんでした');
  }

  const canvas = surface.getCanvas();
  const bgPaint = Skia.Paint();
  bgPaint.setColor(Skia.Color(PAPER_BG));
  canvas.drawRect(Skia.XYWHRect(0, 0, W, H), bgPaint);

  const sw = srcImage.width();
  const sh = srcImage.height();
  const scale = Math.min(W / sw, H / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (W - dw) / 2;
  const dy = (H - dh) / 2;

  canvas.drawImageRectOptions(
    srcImage,
    Skia.XYWHRect(0, 0, sw, sh),
    Skia.XYWHRect(dx, dy, dw, dh),
    FilterMode.Linear,
    MipmapMode.None
  );

  if (includeWatermark) {
    drawWatermark(canvas, W, H);
  }

  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const bytes = snapshot.encodeToBytes(ImageFormat.PNG);
  if (!bytes || bytes.length === 0) {
    throw new Error('投稿用画像の書き出しに失敗しました');
  }

  const out = new File(dir, `ig-${Date.now()}.png`);
  out.create();
  out.write(bytes);
  return out.uri;
}

function drawWatermark(canvas: SkCanvas, W: number, H: number) {
  const font = matchFont({
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
    fontSize: 26,
    fontWeight: '500',
  });
  const paint = Skia.Paint();
  // 作品を邪魔しない透明度（紙色ベースのインク）
  paint.setColor(Skia.Color('rgba(72, 64, 54, 0.34)'));

  const metrics = font.measureText(WATERMARK_TEXT);
  const padX = 40;
  const padY = 44;
  const x = W - padX - metrics.width;
  const y = H - padY;
  canvas.drawText(WATERMARK_TEXT, x, y, paint, font);
}

/**
 * 「Instagram に投稿」導線。
 * 投稿用画像を書き出したうえで OS シートを開き、Instagram を選んでもらう。
 * （保存用の長押し導線とは別。）
 */
export async function presentGraphicRecInstagramPost(imageUrl: string): Promise<void> {
  track('sns_post_started', { kind: 'graphic', target: 'instagram' });

  if (Platform.OS === 'web') {
    // Web は Skia オフスクリーンが不安定なため、元画像を開いて手動投稿を促す
    if (typeof window !== 'undefined') {
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
    }
    return;
  }

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    Alert.alert('', 'この端末では投稿できません。');
    return;
  }

  const uri = await composeGraphicRecForInstagram(imageUrl);
  track('sns_post_image_ready', { kind: 'graphic', target: 'instagram', format: '4:5' });

  await Sharing.shareAsync(uri, {
    mimeType: 'image/png',
    UTI: 'public.png',
    dialogTitle: 'Instagram に投稿',
  });
}
