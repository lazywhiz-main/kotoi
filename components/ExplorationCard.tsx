import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  type ImageSourcePropType,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  EXPLORATION_GRAPHIC_REC,
  GRAPHIC_REC_VARIANT_LABELS,
  isGraphicRecOutdated,
} from '@/lib/graphicRecSpec';
import { presentGraphicRecSaveSheet } from '@/lib/shareGraphicRec';
import { type ColorPalette } from '@/lib/theme';
import type { ExplorationWithStats } from '@/lib/types';
import { useColors } from '@/providers/ThemeProvider';

type Props = {
  exploration: ExplorationWithStats;
  onOpen: () => void;
  /** ローカル見取り図など。指定時は URL より優先 */
  graphicRecSource?: ImageSourcePropType;
  openLabel?: string;
  /** false のとき見取り図の長押し保存を無効化（サンプル用） */
  allowGraphicSave?: boolean;
  /** 見本フレーム内など、外枠を薄くする */
  embedded?: boolean;
  /** 見本用にタイポを一回り小さく */
  compact?: boolean;
  /** 下部の「開く」ボタンを出さない（見本用） */
  hideOpenButton?: boolean;
  /** 進捗バーを出さない（見本用） */
  hideProgress?: boolean;
};

export function ExplorationCard({
  exploration,
  onOpen,
  graphicRecSource,
  openLabel = 'この探究を開く（問いの地図で見る）',
  allowGraphicSave = true,
  embedded = false,
  compact = false,
  hideOpenButton = false,
  hideProgress = false,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [sharing, setSharing] = useState(false);
  const isGraphicPending = exploration.graphic_rec_status === 'pending';
  const isGraphicStale = isGraphicRecOutdated(exploration);
  const remoteGraphicUrl = exploration.graphic_rec_image_url;
  const hasGraphicRec = (!!graphicRecSource || !!remoteGraphicUrl) && !isGraphicPending;
  const graphicSource: ImageSourcePropType | null = graphicRecSource
    ? graphicRecSource
    : remoteGraphicUrl
      ? { uri: remoteGraphicUrl }
      : null;
  const variantLabel = exploration.graphic_rec_variant
    ? GRAPHIC_REC_VARIANT_LABELS[exploration.graphic_rec_variant]
    : null;

  const handleLongPressSave = useCallback(async () => {
    if (!allowGraphicSave || !remoteGraphicUrl || sharing) return;
    setSharing(true);
    try {
      await presentGraphicRecSaveSheet(remoteGraphicUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存に失敗しました';
      Alert.alert('', message);
    } finally {
      setSharing(false);
    }
  }, [allowGraphicSave, remoteGraphicUrl, sharing]);

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${exploration.title}を開く`}
      style={({ pressed }) => [
        styles.card,
        embedded && styles.cardEmbedded,
        pressed && styles.cardPressed,
      ]}
    >
      <Text style={[styles.title, compact && styles.titleCompact]}>{exploration.title}</Text>
      <View style={[styles.stats, compact && styles.statsCompact]}>
        <Text style={[styles.stat, compact && styles.statCompact]}>
          <Text style={styles.statValue}>{exploration.memo_count}</Text> メモ
        </Text>
        <Text style={[styles.stat, compact && styles.statCompact]}>
          <Text style={styles.statValue}>{exploration.question_count}</Text> 問い
        </Text>
        <Text style={[styles.stat, compact && styles.statCompact]}>
          向き合った{' '}
          <Text style={styles.statValue}>
            {exploration.engaged_count}/{exploration.question_count}
          </Text>
        </Text>
      </View>

      {exploration.synthesis ? (
        <View style={[styles.synthBox, compact && styles.synthBoxCompact]}>
          <Text style={[styles.synthLabel, compact && styles.synthLabelCompact]}>
            この束が示唆すること
          </Text>
          <Text
            style={[styles.synthText, compact && styles.synthTextCompact]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {exploration.synthesis}
          </Text>
        </View>
      ) : null}

      {isGraphicPending ? (
        <View style={styles.graphicRecBox}>
          <View style={styles.graphicRecHeader}>
            <Text style={styles.graphicRecLabel}>見取り図</Text>
            <Text style={styles.pendingTag}>作成中</Text>
          </View>
          <View style={styles.graphicRecPending}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.graphicRecPendingText}>
              2〜3分ほどかかります。描き終わったらお知らせします。
            </Text>
          </View>
        </View>
      ) : hasGraphicRec && graphicSource ? (
        <View style={[styles.graphicRecBox, compact && styles.graphicRecBoxCompact]}>
          <View style={styles.graphicRecHeader}>
            <Text style={[styles.graphicRecLabel, compact && styles.graphicRecLabelCompact]}>
              見取り図
            </Text>
            {isGraphicStale ? (
              <Text style={[styles.staleTag, compact && styles.tagCompact]}>更新できます</Text>
            ) : variantLabel ? (
              <Text style={[styles.variantTag, compact && styles.tagCompact]}>{variantLabel}</Text>
            ) : null}
          </View>
          <Pressable
            onLongPress={() => {
              void handleLongPressSave();
            }}
            delayLongPress={350}
            disabled={!allowGraphicSave || sharing}
            accessibilityLabel={
              allowGraphicSave
                ? `${exploration.title}の見取り図。長押しで保存`
                : `${exploration.title}の見取り図`
            }
            style={[
              styles.graphicRecImageWrap,
              compact && styles.graphicRecImageWrapCompact,
            ]}
          >
            <Image
              source={graphicSource}
              resizeMode="cover"
              style={[styles.graphicRecImage, isGraphicStale && styles.graphicRecImageStale]}
              accessibilityLabel={`${exploration.title}の見取り図`}
            />
          </Pressable>
          {isGraphicStale ? (
            <View style={styles.staleCta}>
              <Text style={styles.staleCtaText}>見取り図を更新できます</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {hideProgress ? null : (
        <>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${exploration.progress}%` }]} />
          </View>
          <Text style={[styles.progressLabel, compact && styles.progressLabelCompact]}>
            向き合った割合 {exploration.progress}%
          </Text>
        </>
      )}
      {hideOpenButton ? null : (
        <View style={[styles.openBtn, compact && styles.openBtnCompact]}>
          <Text style={[styles.openBtnText, compact && styles.openBtnTextCompact]}>{openLabel}</Text>
        </View>
      )}
    </Pressable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderColor: colors.line,
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 12,
      paddingHorizontal: 16,
      paddingVertical: 15,
    },
    cardEmbedded: {
      alignSelf: 'stretch',
      borderWidth: 0,
      marginBottom: 0,
      paddingHorizontal: 8,
      paddingVertical: 8,
      width: '100%',
    },
    cardPressed: {
      opacity: 0.92,
    },
    title: {
      color: colors.ink,
      fontSize: 17,
      fontWeight: '600',
      lineHeight: 24,
      marginBottom: 8,
    },
    titleCompact: {
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 6,
    },
    stats: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 11,
    },
    statsCompact: {
      gap: 10,
      marginBottom: 8,
    },
    stat: {
      color: colors.sub,
      fontSize: 15,
    },
    statCompact: {
      fontSize: 13,
    },
    statValue: {
      color: colors.ink,
      fontWeight: '600',
    },
    graphicRecBox: {
      marginBottom: 12,
      width: '100%',
    },
    graphicRecBoxCompact: {
      marginBottom: 10,
    },
    graphicRecHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 6,
    },
    graphicRecLabel: {
      color: colors.hint,
      fontSize: 14,
      fontWeight: '700',
    },
    graphicRecLabelCompact: {
      fontSize: 12,
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
    tagCompact: {
      fontSize: 11,
      paddingHorizontal: 6,
    },
    pendingTag: {
      backgroundColor: colors.conBg,
      borderRadius: 10,
      color: colors.con,
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
    graphicRecImageWrap: {
      aspectRatio: EXPLORATION_GRAPHIC_REC.aspectRatio,
      backgroundColor: colors.input,
      borderColor: colors.line,
      borderRadius: 12,
      borderWidth: 1,
      overflow: 'hidden',
      width: '100%',
    },
    graphicRecImageWrapCompact: {
      alignSelf: 'center',
      width: '68%',
    },
    graphicRecImage: {
      height: '100%',
      width: '100%',
    },
    graphicRecImageStale: {
      opacity: 0.72,
    },
    staleCta: {
      alignItems: 'center',
      backgroundColor: colors.actBg,
      borderRadius: 10,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    staleCtaText: {
      color: colors.act,
      fontSize: 14,
      fontWeight: '700',
    },
    graphicRecPending: {
      alignItems: 'center',
      aspectRatio: EXPLORATION_GRAPHIC_REC.aspectRatio,
      backgroundColor: colors.input,
      borderColor: colors.line,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
      width: '100%',
    },
    graphicRecPendingText: {
      color: colors.ink,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 12,
      textAlign: 'center',
    },
    synthBox: {
      backgroundColor: colors.card,
      borderColor: colors.line,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    synthBoxCompact: {
      marginBottom: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    synthLabel: {
      color: colors.hint,
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 4,
    },
    synthLabelCompact: {
      fontSize: 12,
      marginBottom: 3,
    },
    synthText: {
      color: colors.ink,
      fontSize: 15,
      lineHeight: 24,
    },
    synthTextCompact: {
      fontSize: 13,
      lineHeight: 20,
    },
    progressTrack: {
      backgroundColor: '#eae7dd',
      borderRadius: 6,
      height: 6,
      marginBottom: 6,
      overflow: 'hidden',
    },
    progressFill: {
      backgroundColor: '#8a8577',
      height: '100%',
    },
    progressLabel: {
      color: colors.hint,
      fontSize: 13,
      marginBottom: 12,
    },
    progressLabelCompact: {
      fontSize: 12,
      marginBottom: 10,
    },
    openBtn: {
      alignItems: 'center',
      backgroundColor: colors.input,
      borderColor: colors.line,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    openBtnCompact: {
      paddingVertical: 8,
    },
    openBtnText: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: '500',
      textAlign: 'center',
    },
    openBtnTextCompact: {
      fontSize: 13,
    },
  });
}
