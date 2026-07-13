import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExplorationGraphicRec } from '@/components/ExplorationGraphicRec';
import { QuestionMap } from '@/components/QuestionMap';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ShelfQuestionRow } from '@/components/ShelfQuestionRow';
import { useExplorationDetail } from '@/hooks/useExplorationDetail';
import { useExplorationGraphicRec } from '@/hooks/useExplorationGraphicRec';
import { useSubscription } from '@/hooks/useSubscription';
import { type ColorPalette } from '@/lib/theme';
import type { ExplorationQuestion, OpenQuestionRow } from '@/lib/types';
import { useColors } from '@/providers/ThemeProvider';

function toOpenQuestionRow(
  question: ExplorationQuestion,
  userId: string,
  createdAt: string,
): OpenQuestionRow {
  return {
    id: question.id,
    user_id: userId,
    note_id: question.note_id,
    question_type: question.question_type,
    body: question.body,
    created_at: createdAt,
    note_raw: question.note_raw,
    is_video: question.is_video,
    video_title: question.video_title,
  };
}

function countQuestions(
  subthemes: NonNullable<ReturnType<typeof useExplorationDetail>['detail']>['subthemes'],
) {
  return subthemes.reduce((total, subtheme) => total + subtheme.questions.length, 0);
}

export default function ExplorationScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detail, loading, error, refresh } = useExplorationDetail(id);
  const { graphicGateFor, refresh: refreshSubscription } = useSubscription();
  const {
    imageUrl,
    loadingUrl,
    generating,
    pendingSince,
    error: graphicRecError,
    generate: generateGraphicRec,
    clearError: clearGraphicRecError,
  } = useExplorationGraphicRec(
    id,
    detail?.graphic_rec_storage_path,
    detail?.graphic_rec_status,
    () => {
      void refresh({ silent: true });
      void refreshSubscription();
    },
  );
  const graphicGate = id ? graphicGateFor(id) : 'allow';
  const secondGraphicHint =
    graphicGate === 'paywall' &&
    detail?.graphic_rec_status !== 'done' &&
    detail?.graphic_rec_status !== 'stale' &&
    !detail?.graphic_rec_storage_path;
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const rowRefs = useRef<Map<string, View>>(new Map());
  const [highlightedQuestionId, setHighlightedQuestionId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHighlightTimer = useCallback(() => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearHighlightTimer, [clearHighlightTimer]);

  useFocusEffect(
    useCallback(() => {
      // ペイウォール等から戻った直後も、直前の探究詳細＋購読ゲートを揃える
      void refresh({ silent: true });
      void refreshSubscription();
      clearGraphicRecError();
    }, [refresh, refreshSubscription, clearGraphicRecError]),
  );

  useEffect(() => {
    if (detail?.graphic_rec_status !== 'pending') return;
    const intervalId = setInterval(() => {
      void refresh({ silent: true });
    }, 10_000);
    return () => clearInterval(intervalId);
  }, [detail?.graphic_rec_status, refresh]);

  const scrollToQuestion = useCallback(
    (questionId: string) => {
      const row = rowRefs.current.get(questionId);
      const content = contentRef.current;
      const scroll = scrollRef.current;
      if (!row || !content || !scroll) return;

      row.measureLayout(content, (_x, y) => {
        scroll.scrollTo({ y: Math.max(0, y - 12), animated: true });
      });
    },
    [],
  );

  const handleMapQuestionPress = useCallback(
    (questionId: string) => {
      clearHighlightTimer();
      setHighlightedQuestionId(questionId);
      scrollToQuestion(questionId);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedQuestionId(null);
        highlightTimerRef.current = null;
      }, 2200);
    },
    [clearHighlightTimer, scrollToQuestion],
  );

  if (loading && !detail) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <ErrorBanner message={error ?? '探究が見つかりません。'} />
      </View>
    );
  }

  const questionCount = countQuestions(detail.subthemes);
  let mapIndex = 0;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <View ref={contentRef}>
          <ExplorationGraphicRec
            detail={detail}
            imageUrl={imageUrl}
            loadingUrl={loadingUrl}
            generating={generating}
            pendingSince={pendingSince}
            error={graphicRecError}
            secondGraphicHint={secondGraphicHint}
            onGenerate={() => {
              if (graphicGate === 'paywall') {
                router.push({
                  pathname: '/paywall',
                  params: { reason: 'second_graphic' },
                });
                return;
              }
              void generateGraphicRec().then((result) => {
                if (result && result.ok === false && 'paywall' in result && result.paywall) {
                  router.push({
                    pathname: '/paywall',
                    params: { reason: result.reason },
                  });
                  return;
                }
                void refresh({ silent: true });
                void refreshSubscription();
              });
            }}
          />

          <View style={styles.synthBox}>
            <Text style={styles.synthLabel}>この束が示唆すること</Text>
            <Text style={styles.synthText}>{detail.synthesis ?? ''}</Text>
          </View>

          <View style={styles.progressBox}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${detail.progress}%` }]} />
            </View>
            <Text style={styles.progressLabel}>
              向き合った {detail.questions.filter((q) => q.answered || q.thoughts.length > 0).length}/
              {questionCount} · {detail.progress}%
            </Text>
          </View>

          <Text style={styles.mapHint}>
            問いの地図 — 中心が探究、まわりが切り口、外側が問い（点は一言あり）
          </Text>
          <QuestionMap
            shortLabel={detail.short_label ?? detail.title}
            subthemes={detail.subthemes}
            highlightedQuestionId={highlightedQuestionId}
            onQuestionPress={(questionId) => handleMapQuestionPress(questionId)}
          />

          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>この探究の問い</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countNumber}>{questionCount}</Text>
              <Text style={styles.countUnit}>件</Text>
            </View>
          </View>
          <Text style={styles.sectionLead}>
            地図の番号を押すと下の問いへ。カードを押すと元スレッドへ。
          </Text>

          {questionCount === 0 ? (
            <EmptyState
              title="問いがまだありません"
              description="探究を更新すると、関連する問いがここに集まります。"
            />
          ) : (
            detail.subthemes.map((subtheme) => {
            if (subtheme.questions.length === 0) return null;

            return (
              <View key={subtheme.id} style={styles.subthemeSection}>
                <View style={styles.subthemeHeader}>
                  <Text style={styles.subthemeEyebrow}>切り口</Text>
                  <Text style={styles.subthemeTitle}>{subtheme.label}</Text>
                  <View style={styles.subthemeCountBadge}>
                    <Text style={styles.subthemeCountText}>{subtheme.questions.length}件</Text>
                  </View>
                </View>

                {subtheme.questions.map((question) => {
                  mapIndex += 1;
                  const currentMapIndex = mapIndex;

                  return (
                    <View
                      key={question.id}
                      ref={(node) => {
                        if (node) rowRefs.current.set(question.id, node);
                        else rowRefs.current.delete(question.id);
                      }}
                    >
                      <ShelfQuestionRow
                        row={toOpenQuestionRow(question, detail.user_id, detail.created_at)}
                        thoughts={question.thoughts}
                        mapIndex={currentMapIndex}
                        highlighted={highlightedQuestionId === question.id}
                        onPress={() =>
                          router.push({
                            pathname: '/note/[id]',
                            params: { id: question.note_id, itemId: question.id },
                          })
                        }
                      />
                    </View>
                  );
                })}
              </View>
            );
          })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: 24,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  synthBox: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  synthLabel: {
    color: colors.hint,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  synthText: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
  },
  progressBox: {
    marginBottom: 12,
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
  },
  mapHint: {
    color: colors.sub,
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
    marginTop: 8,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  countBadge: {
    alignItems: 'baseline',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  countNumber: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  countUnit: {
    color: colors.sub,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionLead: {
    color: colors.sub,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  subthemeSection: {
    marginBottom: 6,
  },
  subthemeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    marginTop: 4,
  },
  subthemeEyebrow: {
    color: colors.hint,
    fontSize: 14,
    fontWeight: '700',
  },
  subthemeTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  subthemeCountBadge: {
    backgroundColor: '#f6f4ee',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  subthemeCountText: {
    color: colors.sub,
    fontSize: 14,
    fontWeight: '600',
  },
});
}
