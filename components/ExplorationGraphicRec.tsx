import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { READ_ONLY_MESSAGE } from '@/lib/errors';
import {
  EXPLORATION_GRAPHIC_REC,
  GRAPHIC_REC_VARIANT_LABELS,
  isGraphicRecOutdated,
} from '@/lib/graphicRecSpec';
import { presentGraphicRecInstagramPost } from '@/lib/postGraphicRec';
import { presentGraphicRecSaveSheet } from '@/lib/shareGraphicRec';
import { type ColorPalette } from '@/lib/theme';
import type { ExplorationDetail, GraphicRecStatus } from '@/lib/types';
import { useColors } from '@/providers/ThemeProvider';

type Props = {
  detail: ExplorationDetail;
  imageUrl: string | null;
  loadingUrl: boolean;
  generating: boolean;
  pendingSince: number | null;
  error: string | null;
  /** 無料1枠消費済みで、この探究はまだ見取り図なし（2枚目案内） */
  secondGraphicHint?: boolean;
  onGenerate: () => void;
};

function pendingMessage(pendingSince: number | null): string {
  if (!pendingSince) return 'クレヨンで描いています…';
  const elapsedSec = Math.floor((Date.now() - pendingSince) / 1000);
  if (elapsedSec < 30) return '構図を考えています…';
  if (elapsedSec < 120) return 'クレヨンで描いています…';
  return 'もう少しで仕上がります…';
}

function confirmReplaceGraphicRec(onConfirm: () => void) {
  const title = '見取り図を描き直しますか？';
  const message = 'いまの見取り図は消えて、新しく描き直します。';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '描き直す', style: 'destructive', onPress: onConfirm },
  ]);
}

export function ExplorationGraphicRec({
  detail,
  imageUrl,
  loadingUrl,
  generating,
  pendingSince,
  error,
  secondGraphicHint = false,
  onGenerate,
}: Props) {
  const router = useRouter();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tick, setTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);

  const status: GraphicRecStatus | null = detail.graphic_rec_status;
  const busy = generating || status === 'pending' || loadingUrl;
  const isStale = isGraphicRecOutdated(detail);
  const hasImage = (status === 'done' || status === 'stale' || isStale) && !!imageUrl;
  const variantLabel = detail.graphic_rec_variant
    ? GRAPHIC_REC_VARIANT_LABELS[detail.graphic_rec_variant]
    : null;
  const actionBusy = saving || posting;

  useEffect(() => {
    if (!busy || hasImage) return;
    const id = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [busy, hasImage]);

  const waitCopy = pendingMessage(pendingSince);
  void tick;

  const requestGenerate = useCallback(() => {
    if (busy) return;
    if (hasImage) {
      confirmReplaceGraphicRec(onGenerate);
      return;
    }
    onGenerate();
  }, [busy, hasImage, onGenerate]);

  const handleLongPressSave = useCallback(async () => {
    if (!imageUrl || actionBusy) return;
    setSaving(true);
    try {
      await presentGraphicRecSaveSheet(imageUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存に失敗しました';
      Alert.alert('', message);
    } finally {
      setSaving(false);
    }
  }, [imageUrl, actionBusy]);

  const handleInstagramPost = useCallback(async () => {
    if (!imageUrl || actionBusy) return;
    setPosting(true);
    try {
      await presentGraphicRecInstagramPost(imageUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : '投稿用画像の準備に失敗しました';
      Alert.alert('', message);
    } finally {
      setPosting(false);
    }
  }, [imageUrl, actionBusy]);

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <Text style={styles.label}>見取り図</Text>
        {isStale ? (
          <Text style={styles.staleTag}>更新できます</Text>
        ) : variantLabel ? (
          <Text style={styles.variantTag}>{variantLabel}</Text>
        ) : null}
        <View style={styles.headerSpacer} />
        {hasImage && !busy ? (
          <Pressable
            onPress={() => {
              void handleInstagramPost();
            }}
            hitSlop={10}
            disabled={actionBusy}
            accessibilityRole="button"
            accessibilityLabel="Instagram に投稿"
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          >
            {posting ? (
              <ActivityIndicator color={colors.sub} size="small" />
            ) : (
              <SymbolView
                name={{
                  ios: 'square.and.arrow.up',
                  android: 'share',
                  web: 'share',
                }}
                tintColor={colors.sub}
                size={18}
              />
            )}
          </Pressable>
        ) : null}
        {hasImage && !busy && isStale ? (
          <Pressable
            onPress={requestGenerate}
            accessibilityRole="button"
            accessibilityLabel="見取り図を更新"
            style={({ pressed }) => [styles.updateBtn, pressed && styles.updateBtnPressed]}
          >
            <Text style={styles.updateBtnText}>更新</Text>
          </Pressable>
        ) : hasImage && !busy ? (
          <Pressable
            onPress={requestGenerate}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="見取り図を作り直す"
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          >
            <SymbolView
              name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
              tintColor={colors.sub}
              size={18}
            />
          </Pressable>
        ) : null}
      </View>

      {detail.graphic_rec_selection_reason && !isStale ? (
        <Text style={styles.reason}>{detail.graphic_rec_selection_reason}</Text>
      ) : null}

      {isStale && hasImage && !busy ? (
        <View style={styles.staleBanner}>
          <Text style={styles.staleLead}>
            束の内容が変わっています。見取り図を更新できます。
          </Text>
          <Pressable
            onPress={requestGenerate}
            accessibilityRole="button"
            accessibilityLabel="見取り図を更新"
            style={({ pressed }) => [styles.staleCta, pressed && styles.updateBtnPressed]}
          >
            <Text style={styles.staleCtaText}>見取り図を更新</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.imageFrame, !hasImage && !busy && styles.imageFrameEmpty]}>
        {busy && !hasImage ? (
          <View style={styles.placeholder}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.waitLead}>
              2〜3分ほどかかります。描き終わったらお知らせします。この画面を閉じても大丈夫です。
            </Text>
            <Text style={styles.phaseText}>{waitCopy}</Text>
          </View>
        ) : hasImage ? (
          <Pressable
            onLongPress={() => {
              void handleLongPressSave();
            }}
            delayLongPress={350}
            accessibilityLabel="探究の見取り図。長押しで保存"
            disabled={actionBusy}
          >
            <Image
              source={{ uri: imageUrl }}
              style={[styles.image, isStale && styles.imageStale]}
              accessibilityLabel="探究の見取り図"
            />
          </Pressable>
        ) : (
          <Pressable
            onPress={requestGenerate}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={
              secondGraphicHint ? '続きを書く（次の見取り図）' : '見取り図をつくる'
            }
            style={({ pressed }) => [
              styles.placeholder,
              styles.wandHit,
              pressed && styles.wandHitPressed,
            ]}
          >
            <View style={styles.wandCenter}>
              <SymbolView
                name={{ ios: 'wand.and.stars', android: 'auto_awesome', web: 'auto_awesome' }}
                tintColor={colors.sub}
                size={40}
              />
            </View>
            {secondGraphicHint ? (
              <View style={styles.secondHintWrap} pointerEvents="none">
                <Text style={styles.secondHint}>無料の見取り図は1枚までです</Text>
                <Text style={styles.secondHintCta}>続きを書く</Text>
              </View>
            ) : null}
          </Pressable>
        )}
      </View>

      {(error || detail.graphic_rec_error) && !busy ? (
        <View style={styles.errorBlock}>
          <Text style={styles.errorText}>{error ?? detail.graphic_rec_error}</Text>
          {error === READ_ONLY_MESSAGE ? (
            <Pressable
              onPress={() => {
                router.push({ pathname: '/paywall', params: { reason: 'read_only' } });
              }}
              accessibilityRole="button"
              accessibilityLabel="続きを書く"
              style={styles.continueLink}
            >
              <Text style={styles.continueLinkText}>続きを書く</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    box: {
      backgroundColor: colors.card,
      borderColor: colors.line,
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 14,
      paddingHorizontal: 15,
      paddingVertical: 14,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 6,
    },
    headerSpacer: {
      flex: 1,
    },
    label: {
      color: colors.hint,
      fontSize: 14,
      fontWeight: '700',
    },
    variantTag: {
      backgroundColor: colors.input,
      borderRadius: 10,
      color: colors.sub,
      fontSize: 12,
      fontWeight: '600',
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    staleTag: {
      backgroundColor: colors.actBg,
      borderRadius: 10,
      color: colors.act,
      fontSize: 12,
      fontWeight: '600',
      overflow: 'hidden',
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    iconBtn: {
      alignItems: 'center',
      height: 28,
      justifyContent: 'center',
      width: 28,
    },
    iconBtnPressed: {
      opacity: 0.55,
    },
    updateBtn: {
      backgroundColor: colors.ink,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    updateBtnPressed: {
      opacity: 0.85,
    },
    updateBtnText: {
      color: colors.bg,
      fontSize: 13,
      fontWeight: '700',
    },
    reason: {
      color: colors.sub,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 10,
    },
    staleBanner: {
      backgroundColor: colors.actBg,
      borderRadius: 12,
      gap: 10,
      marginBottom: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    staleLead: {
      color: colors.ink,
      fontSize: 14,
      lineHeight: 20,
    },
    staleCta: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: colors.ink,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    staleCtaText: {
      color: colors.bg,
      fontSize: 14,
      fontWeight: '700',
    },
    waitLead: {
      color: colors.ink,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 14,
      textAlign: 'center',
    },
    phaseText: {
      color: colors.hint,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 8,
      textAlign: 'center',
    },
    imageFrame: {
      aspectRatio: EXPLORATION_GRAPHIC_REC.aspectRatio,
      // 配置前・作成中はテーマに合わせる（ダークで紙色＋薄い字にならないように）
      // 完成画像は全面 Image なので下地はほぼ見えない
      backgroundColor: colors.input,
      borderColor: colors.line,
      borderRadius: 12,
      borderWidth: 1,
      overflow: 'hidden',
      width: '100%',
    },
    imageFrameEmpty: {
      marginBottom: 0,
    },
    image: {
      height: '100%',
      width: '100%',
    },
    imageStale: {
      opacity: 0.72,
    },
    placeholder: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 20,
      position: 'relative',
      width: '100%',
    },
    wandHit: {
      width: '100%',
    },
    wandHitPressed: {
      opacity: 0.55,
    },
    wandCenter: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondHintWrap: {
      alignItems: 'center',
      left: 0,
      paddingHorizontal: 20,
      position: 'absolute',
      right: 0,
      top: '50%',
      marginTop: 48,
    },
    secondHint: {
      color: colors.sub,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
    secondHintCta: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: '700',
      lineHeight: 20,
      marginTop: 6,
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
    errorText: {
      color: '#b44',
      fontSize: 12,
      lineHeight: 18,
    },
    errorBlock: {
      marginTop: 8,
      gap: 8,
    },
    continueLink: {
      alignSelf: 'flex-start',
      paddingVertical: 2,
    },
    continueLinkText: {
      color: colors.sub,
      fontSize: 14,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
  });
}
