import { useCallback, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { ExplorationCard } from '@/components/ExplorationCard';
import { QuestionMap } from '@/components/QuestionMap';
import {
  SAMPLE_EXPLORATION,
  SAMPLE_EXPLORATION_SUBTHEMES,
  SAMPLE_GRAPHIC_REC_IMAGE,
} from '@/lib/tutorial/explorationSample';
import { getQuestionColors, type ColorPalette } from '@/lib/theme';
import { QUESTION_LABEL } from '@/lib/types';
import { useColors } from '@/providers/ThemeProvider';

const PAGES = 2;
/** 点線枠からのわずかな余白だけ残す */
const SAMPLE_INSET = 4;

/** 探究ゼロ時に、束と問いの地図の見本を実コンポで見せる（本物の一覧とは分離） */
export function ExplorationSamplePreview() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const questionColors = useMemo(() => getQuestionColors(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState(0);
  const [frameHeight, setFrameHeight] = useState(0);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const width = pageWidth > 0 ? pageWidth : Math.max(windowWidth - 64, 240);
  const cardWidth = Math.max(width - SAMPLE_INSET * 2, 200);
  const mapWidth = Math.min(200, cardWidth - 24);
  const mapHeight = Math.round(mapWidth * 0.88);

  const sampleList = useMemo(() => {
    let index = 0;
    return SAMPLE_EXPLORATION_SUBTHEMES.filter((subtheme) => subtheme.questions.length > 0).map(
      (subtheme) => ({
        id: subtheme.id,
        label: subtheme.label,
        questions: subtheme.questions.map((question) => {
          index += 1;
          return { question, mapIndex: index };
        }),
      }),
    );
  }, []);

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
      accessibilityLabel="探究の見本。横にスワイプして束と地図を見られます"
    >
      <View style={styles.stage}>
        <View style={styles.stageHeader}>
          <View style={styles.sampleBadge}>
            <Text style={styles.sampleBadgeText}>見本</Text>
          </View>
          <Text style={styles.stageCaption}>
            {page === 0 ? '束カード（見取り図つき）' : '地図と問いリスト'}
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
                <ExplorationCard
                  exploration={SAMPLE_EXPLORATION}
                  graphicRecSource={SAMPLE_GRAPHIC_REC_IMAGE}
                  allowGraphicSave={false}
                  embedded
                  compact
                  hideOpenButton
                  hideProgress
                  onOpen={() => goToPage(1)}
                />
              </View>
            </View>

            <View style={[styles.page, { width }]}>
              <View
                style={[
                  styles.pictureFrame,
                  styles.mapPageFrame,
                  { width: cardWidth, height: frameHeight > 0 ? frameHeight : undefined },
                ]}
              >
                <Text style={styles.mapHint}>中心が探究、まわりが切り口、外側が問い</Text>
                <View style={styles.mapWrap}>
                  <QuestionMap
                    shortLabel={SAMPLE_EXPLORATION.short_label ?? SAMPLE_EXPLORATION.title}
                    subthemes={SAMPLE_EXPLORATION_SUBTHEMES}
                    width={mapWidth}
                    height={mapHeight}
                  />
                </View>

                <Text style={styles.listTitle}>この探究の問い</Text>
                {sampleList.map((subtheme) => (
                  <View key={subtheme.id} style={styles.subthemeBlock}>
                    <View style={styles.subthemeHeader}>
                      <Text style={styles.subthemeEyebrow}>切り口</Text>
                      <Text style={styles.subthemeTitle} numberOfLines={1}>
                        {subtheme.label}
                      </Text>
                    </View>
                    {subtheme.questions.map(({ question, mapIndex }) => {
                      const tag = questionColors[question.question_type];
                      return (
                        <View key={question.id} style={styles.qRow}>
                          <View style={styles.qIndex}>
                            <Text style={styles.qIndexText}>{mapIndex}</Text>
                          </View>
                          <View style={[styles.qTag, { backgroundColor: tag.bg }]}>
                            <Text style={[styles.qTagText, { color: tag.text }]}>
                              {QUESTION_LABEL[question.question_type]}
                            </Text>
                          </View>
                          <Text style={styles.qBody} numberOfLines={1}>
                            {question.body}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ))}
                {frameHeight > 0 ? (
                  <View style={styles.fade} pointerEvents="none" />
                ) : null}
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
      paddingBottom: 8,
      paddingHorizontal: 6,
      paddingTop: 6,
    },
    mapPageFrame: {
      position: 'relative',
    },
    mapHint: {
      color: colors.hint,
      fontSize: 11,
      lineHeight: 15,
      marginBottom: 2,
      paddingHorizontal: 4,
      textAlign: 'center',
    },
    mapWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
      width: '100%',
    },
    listTitle: {
      color: colors.ink,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 6,
      paddingHorizontal: 4,
    },
    subthemeBlock: {
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    subthemeHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
      marginBottom: 4,
    },
    subthemeEyebrow: {
      color: colors.hint,
      fontSize: 10,
      fontWeight: '700',
    },
    subthemeTitle: {
      color: colors.ink,
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
    },
    qRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
      marginBottom: 4,
      paddingVertical: 2,
    },
    qIndex: {
      alignItems: 'center',
      borderColor: colors.line,
      borderRadius: 8,
      borderWidth: 1,
      height: 18,
      justifyContent: 'center',
      minWidth: 18,
    },
    qIndexText: {
      color: colors.sub,
      fontSize: 10,
      fontWeight: '700',
    },
    qTag: {
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    qTagText: {
      fontSize: 10,
      fontWeight: '700',
    },
    qBody: {
      color: colors.ink,
      flex: 1,
      fontSize: 12,
      lineHeight: 16,
    },
    fade: {
      backgroundColor: colors.card,
      bottom: 0,
      height: 36,
      left: 0,
      opacity: 0.92,
      position: 'absolute',
      right: 0,
    },
  });
}
