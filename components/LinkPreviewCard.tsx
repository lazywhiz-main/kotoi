import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

import { linkHost } from '@/lib/linkPreview';
import { type ColorPalette } from '@/lib/theme';
import type { LinkPreviewResult } from '@/lib/types';
import { useColors } from '@/providers/ThemeProvider';
import { useMemo } from 'react';

type Props = {
  url: string;
  preview: LinkPreviewResult | null;
  loading?: boolean;
  isVideo?: boolean;
  compact?: boolean;
};

export function LinkPreviewCard({ url, preview, loading, isVideo, compact }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const title = preview?.title;
  const imageUrl = preview?.image_url;
  const subtitle = preview?.site_name ?? linkHost(url);

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={[styles.thumb, compact && styles.thumbCompact]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.thumbImage} resizeMode="cover" />
        ) : loading ? (
          <ActivityIndicator color={colors.sub} size="small" />
        ) : (
          <Text style={styles.thumbFallback}>{isVideo ? '▶' : '🔗'}</Text>
        )}
        {isVideo && imageUrl ? <Text style={styles.playBadge}>▶</Text> : null}
      </View>
      <View style={styles.body}>
        {loading && !title ? (
          <Text style={styles.loadingText}>リンク情報を取得中…</Text>
        ) : (
          <>
            <Text numberOfLines={2} style={styles.title}>
              {title ?? url}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.input,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    padding: 10,
  },
  cardCompact: {
    marginTop: 8,
    padding: 8,
  },
  thumb: {
    alignItems: 'center',
    backgroundColor: '#ece8de',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 74,
  },
  thumbCompact: {
    height: 44,
    width: 64,
  },
  thumbImage: {
    height: '100%',
    width: '100%',
  },
  thumbFallback: {
    color: colors.sub,
    fontSize: 19,
  },
  playBadge: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    bottom: 4,
    color: '#fff',
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 2,
    position: 'absolute',
    right: 4,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
  subtitle: {
    color: colors.hint,
    fontSize: 13,
    marginTop: 3,
  },
  loadingText: {
    color: colors.hint,
    fontSize: 14,
  },
});
}
