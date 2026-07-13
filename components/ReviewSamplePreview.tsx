import { useCallback, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { SAMPLE_WEEKLY_REVIEW } from '@/lib/tutorial/reviewSample';
import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';

const PAGES = 2;
const SAMPLE_INSET = 4;

/** ふりかえりゼロ時に、作成後の見え方を実コンポ調で見せる（本物の記録とは分離） */
export function ReviewSamplePreview() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState(0);
  const [frameHeight, setFrameHeight] = useState(0);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const width = pageWidth > 0 ? pageWidth : Math.max(windowWidth - 64, 240);
  const cardWidth = Math.max(width - SAMPLE_INSET * 2, 200);
  const sample = SAMPLE_WEEKLY_REVIEW;

  const goToPage = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(PAGES - 1, next));
      setPage(clamped);
      scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    },
    [width],
  );

  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
      setPage(Math.max(0, Math.min(PAGES - 1, next)));
    },
    [width],
  );

  return (
    <View
      style={styles.section}
      accessibilityLabel="ふりかえりの見本。横にスワイプして中身を見られます"
    >
      <View style={styles.stage}>
        <View style={styles.stageHeader}>
          <View style={styles.sampleBadge}>
            <Text style={styles.sampleBadgeText}>見本</Text>
          </View>
          <Text style={styles.stageCaption}>
            {page === 0 ? 'テーマと数字' : '呼び戻し'}
          </Text>
        </View>

        <View
          style={styles.carousel}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.width);
            if (next > 0 && next !== pageWidth) setPageWidth(next);
          }}
        >
          <ScrollView
            ref={scrollRef}
            horizontal
            nestedScrollEnabled
            pagingEnabled
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            scrollEventThrottle={16}
          >
            <View style={[styles.page, { width }]}>
              <View
                style={[styles.pictureFrame, { width: cardWidth }]}
                onLayout={(event) => {
                  const next = Math.round(event.nativeEvent.layout.height);
                  if (next > 0 && next !== frameHeight) setFrameHeight(next);
                }}
              >
                <Text style={styles.weekLabel}>{sample.week_label}</Text>
                <View style={styles.stats}>
                  <MiniStat value={sample.stats.new_notes} label="メモ" />
                  <MiniStat value={sample.stats.new_questions} label="問い" />
                  <MiniStat value={sample.stats.answered_questions} label="アーカイブ" />
                  <MiniStat value={sample.stats.new_explorations} label="探究" />
                </View>
                <View style={styles.block}>
                  <Text style={styles.blockLabel}>今週くり返し出たテーマ</Text>
                  <Text style={styles.blockBody} numberOfLines={4}>
                    {sample.recurring_theme}
                  </Text>
                </View>
                <View style={styles.block}>
                  <Text style={styles.blockLabel}>未回答で、いちばん熱い問い</Text>
                  <Text style={styles.blockBody} numberOfLines={3}>
                    {sample.hottest_question?.body}
                  </Text>
                </View>
                <PressHint onPress={() => goToPage(1)} label="呼び戻しも見る →" />
              </View>
            </View>

            <View style={[styles.page, { width }]}>
              <View
                style={[
                  styles.pictureFrame,
                  styles.pageTwoFrame,
                  { width: cardWidth, height: frameHeight > 0 ? frameHeight : undefined },
                ]}
              >
                <Text style={styles.mapHint}>過去の問いを、いまの自分に差し戻す</Text>
                <View style={styles.recall}>
                  <Text style={styles.recallLabel}>↻ 呼び戻し</Text>
                  <Text style={styles.blockBody}>{sample.recall?.prompt}</Text>
                </View>
                <View style={styles.mapLink}>
                  <View style={styles.mapLinkText}>
                    <Text style={styles.mapLinkTitle}>問いの地図</Text>
                    <Text style={styles.mapLinkSub}>今週の問いのつながりを俯瞰する（副次）</Text>
                  </View>
                  <Text style={styles.mapLinkGo}>›</Text>
                </View>
                {frameHeight > 0 ? <View style={styles.fade} pointerEvents="none" /> : null}
              </View>
            </View>
          </ScrollView>
        </View>

        <View style={styles.dots}>
          {Array.from({ length: PAGES }, (_, index) => (
            <View key={index} style={[styles.dot, index === page && styles.dotActive]} />
          ))}
        </View>
      </View>
    </View>
  );
}

function MiniStat({ value, label }: { value: number; label: string }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function PressHint({ onPress, label }: { onPress: () => void; label: string }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={styles.pressHint}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    section: {
      alignSelf: 'stretch',
      marginTop: 4,
      width: '100%',
    },
    stage: {
      alignSelf: 'stretch',
      backgroundColor: colors.input,
      borderColor: colors.lineStrong,
      borderRadius: 18,
      borderStyle: 'dashed',
      borderWidth: 1.5,
      paddingBottom: 8,
      paddingHorizontal: 8,
      paddingTop: 8,
      width: '100%',
    },
    stageHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'flex-start',
      marginBottom: 6,
      minWidth: 0,
      paddingHorizontal: 2,
    },
    sampleBadge: {
      backgroundColor: colors.bg,
      borderColor: colors.lineStrong,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    sampleBadgeText: {
      color: colors.sub,
      fontSize: 12,
      fontWeight: '700',
    },
    stageCaption: {
      color: colors.sub,
      flexShrink: 1,
      fontSize: 13,
      fontWeight: '600',
    },
    dots: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 5,
      justifyContent: 'center',
      paddingTop: 4,
    },
    dot: {
      backgroundColor: colors.lineStrong,
      borderRadius: 3,
      height: 6,
      opacity: 0.45,
      width: 6,
    },
    dotActive: {
      backgroundColor: colors.sub,
      opacity: 1,
      width: 14,
    },
    carousel: {
      alignSelf: 'stretch',
      width: '100%',
    },
    page: {
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingBottom: 2,
    },
    pictureFrame: {
      alignSelf: 'center',
      backgroundColor: colors.card,
      borderColor: colors.line,
      borderRadius: 14,
      borderWidth: 1,
      marginBottom: 4,
      overflow: 'hidden',
      paddingBottom: 10,
      paddingHorizontal: 10,
      paddingTop: 10,
    },
    pageTwoFrame: {
      position: 'relative',
    },
    weekLabel: {
      color: colors.hint,
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 8,
    },
    stats: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10,
    },
    miniStat: {
      backgroundColor: colors.input,
      borderColor: colors.line,
      borderRadius: 10,
      borderWidth: 1,
      flexGrow: 1,
      minWidth: '45%',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    miniStatValue: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: '600',
    },
    miniStatLabel: {
      color: colors.sub,
      fontSize: 12,
      marginTop: 1,
    },
    block: {
      backgroundColor: colors.input,
      borderColor: colors.line,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 8,
      paddingHorizontal: 11,
      paddingVertical: 10,
    },
    blockLabel: {
      color: colors.hint,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.2,
      marginBottom: 5,
    },
    blockBody: {
      color: colors.ink,
      fontSize: 14,
      lineHeight: 20,
    },
    pressHint: {
      color: colors.sub,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 2,
      textAlign: 'right',
    },
    mapHint: {
      color: colors.hint,
      fontSize: 11,
      lineHeight: 15,
      marginBottom: 8,
      textAlign: 'center',
    },
    recall: {
      backgroundColor: colors.youBg,
      borderColor: colors.line,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    recallLabel: {
      color: colors.you,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 6,
    },
    mapLink: {
      alignItems: 'center',
      backgroundColor: colors.input,
      borderColor: colors.line,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    mapLinkText: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    mapLinkTitle: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: '600',
    },
    mapLinkSub: {
      color: colors.hint,
      fontSize: 12,
      lineHeight: 16,
    },
    mapLinkGo: {
      color: colors.hint,
      fontSize: 20,
    },
    fade: {
      backgroundColor: colors.card,
      bottom: 0,
      height: 28,
      left: 0,
      opacity: 0.92,
      position: 'absolute',
      right: 0,
    },
  });
}
