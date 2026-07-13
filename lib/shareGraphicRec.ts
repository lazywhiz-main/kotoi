import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { Alert, Platform } from 'react-native';

/**
 * 見取り図を「端末に残す」ための導線。
 * OS のシートを開き、写真へ保存などを選んでもらう（SNS投稿用のシェア導線とは別）。
 * 促しコピーは出さない。失敗時だけ短く伝える。
 */
export async function presentGraphicRecSaveSheet(imageUrl: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
    }
    return;
  }

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    Alert.alert('', 'この端末では保存できません。');
    return;
  }

  const dir = new Directory(Paths.cache, 'graphic-rec-save');
  if (!dir.exists) {
    dir.create();
  }

  // 毎回ユニークな先に落とす（2回目以降 Destination already exists を避ける）
  const dest = new File(dir, `mitorizu-${Date.now()}.png`);
  const downloaded = await File.downloadFileAsync(imageUrl, dest, { idempotent: true });
  await Sharing.shareAsync(downloaded.uri, {
    mimeType: 'image/png',
    UTI: 'public.png',
    dialogTitle: '見取り図を保存',
  });
}

/** @deprecated 名前がシェアと混同しやすい。presentGraphicRecSaveSheet を使う */
export async function shareGraphicRecImage(imageUrl: string): Promise<void> {
  return presentGraphicRecSaveSheet(imageUrl);
}
