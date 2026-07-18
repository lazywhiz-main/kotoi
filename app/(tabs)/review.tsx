import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ReviewSamplePreview } from '@/components/ReviewSamplePreview';
import { TutorialPulse } from '@/components/TutorialPulse';
import { useTutorialScene } from '@/hooks/useTutorialScene';
import { useWeeklyReview } from '@/hooks/useWeeklyReview';
import { type ColorPalette } from '@/lib/theme';
import { QUESTION_LABEL, type ReviewAccumulation, type WeeklyReviewResult } from '@/lib/types';
import { formatReviewDateLabel } from '@/lib/weeklyReviewClient';
import { useAuth } from '@/providers/AuthProvider';
import { useColors } from '@/providers/ThemeProvider';

type StatItem = {
  value: number;
  label: string;
};

function StatCard({ value, label, onLiveZone }: StatItem & { onLiveZone?: boolean }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.statCard, onLiveZone && styles.statCardOnLive]}>
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ZoneTag({ label, variant }: { label: string; variant: 'live' | 'record' }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.zoneTag, variant === 'live' ? styles.zoneTagLive : styles.zoneTagRecord]}>
      <Text
        style={[
          styles.zoneTagText,
          variant === 'live' ? styles.zoneTagTextLive : styles.zoneTagTextRecord,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function ReviewBlock({ label, body }: { label: string; body: string }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.block}>
      <Text style={styles.blockLabel}>{label}</Text>
      <Text style={styles.blockBody}>{body}</Text>
    </View>
  );
}

function ReviewSnapshot({
  item,
  onOpenQuestion,
  onMapLink,
  compact,
}: {
  item: WeeklyReviewResult;
  onOpenQuestion: (noteId: string) => void;
  onMapLink?: () => void;
  compact?: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      <View style={styles.stats}>
        <StatCard value={item.stats.new_notes} label="新しいメモ" />
        <StatCard value={item.stats.new_questions} label="生まれた問い" />
        <StatCard value={item.stats.answered_questions} label="アーカイブした問い" />
        <StatCard value={item.stats.new_explorations} label="立ち上がった探究" />
      </View>

      <ReviewBlock label="今週くり返し出たテーマ" body={item.recurring_theme} />

      {item.hottest_question ? (
        <Pressable
          onPress={() => onOpenQuestion(item.hottest_question!.note_id)}
          style={({ pressed }) => [styles.block, pressed && styles.blockPressed]}
        >
          <Text style={styles.blockLabel}>未回答で、いちばん熱い問い</Text>
          <Text style={styles.blockBody}>{item.hottest_question.body}</Text>
        </Pressable>
      ) : (
        <ReviewBlock label="未回答で、いちばん熱い問い" body="いま追っている問いはありません。" />
      )}

      {!compact && item.recall ? (
        <Pressable
          onPress={() => onOpenQuestion(item.recall!.note_id)}
          style={({ pressed }) => [styles.recall, pressed && styles.blockPressed]}
        >
          <Text style={styles.recallLabel}>↻ 呼び戻し</Text>
          <Text style={styles.blockBody}>{item.recall.prompt}</Text>
        </Pressable>
      ) : null}

      {!compact && onMapLink ? (
        <Pressable
          onPress={onMapLink}
          style={({ pressed }) => [styles.mapLink, pressed && styles.blockPressed]}
        >
          <View style={styles.mapLinkText}>
            <Text style={styles.mapLinkTitle}>問いの地図</Text>
            <Text style={styles.mapLinkSub}>今週の問いのつながりを俯瞰する（副次）</Text>
          </View>
          <Text style={styles.mapLinkGo}>›</Text>
        </Pressable>
      ) : null}
    </>
  );
}

function AccumulationSection({
  accumulation,
  sinceLabel,
  isFirst,
  onOpenNote,
}: {
  accumulation: ReviewAccumulation;
  sinceLabel?: string;
  isFirst?: boolean;
  onOpenNote: (noteId: string) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { stats } = accumulation;
  const extraNotes = Math.max(0, stats.new_notes - accumulation.notes.length);
  const extraQuestions = Math.max(0, stats.new_questions - accumulation.questions.length);
  const extraAnswered = Math.max(0, stats.answered_questions - accumulation.answered.length);
  const extraExplorations = Math.max(
    0,
    stats.new_explorations - accumulation.exploration_updates.length,
  );
  const hasDetails =
    accumulation.notes.length > 0 ||
    accumulation.questions.length > 0 ||
    accumulation.answered.length > 0 ||
    accumulation.exploration_updates.length > 0 ||
    extraNotes > 0 ||
    extraQuestions > 0 ||
    extraAnswered > 0 ||
    extraExplorations > 0;

  return (
    <View style={styles.liveZoneWrap}>
      <View style={styles.liveZone}>
        <ZoneTag label="いま溜まっている" variant="live" />
        <Text style={styles.accumulationTitle}>このあいだに溜まったもの</Text>
        <Text style={styles.accumulationLead}>
          {isFirst
            ? 'はじめてのふりかえりまで'
            : `前回のふりかえり（${sinceLabel ?? ''}）から`}
        </Text>

        {!accumulation.has_activity ? (
          <Text style={styles.accumulationEmpty}>
            まだ新しい動きはありません。メモを放り込むと、ここに集まります。
          </Text>
        ) : (
          <>
            <View style={styles.miniStats}>
              <StatCard onLiveZone value={stats.new_notes} label="新しいメモ" />
              <StatCard onLiveZone value={stats.new_questions} label="生まれた問い" />
              <StatCard onLiveZone value={stats.answered_questions} label="アーカイブした問い" />
              <StatCard onLiveZone value={stats.new_explorations} label="探究の更新" />
            </View>

            {hasDetails ? (
              <Pressable
                onPress={() => setDetailsOpen((value) => !value)}
                style={({ pressed }) => [styles.detailsToggle, pressed && styles.blockPressed]}
              >
                <Text style={styles.detailsToggleText}>
                  {detailsOpen ? '▾ 内訳を閉じる' : '▸ 内訳を見る'}
                </Text>
              </Pressable>
            ) : null}

            {detailsOpen ? (
              <View style={styles.accumDetails}>
                {accumulation.notes.length > 0 || extraNotes > 0 ? (
                  <View style={styles.accumGroup}>
                    <Text style={styles.accumGroupLabel}>メモ {stats.new_notes}件</Text>
                    {accumulation.notes.map((note) => (
                      <Text key={note.id} style={styles.accumItem}>
                        · {note.preview}
                      </Text>
                    ))}
                    {extraNotes > 0 ? <Text style={styles.accumMore}>ほか {extraNotes} 件</Text> : null}
                  </View>
                ) : null}

                {accumulation.questions.length > 0 || extraQuestions > 0 ? (
                  <View style={styles.accumGroup}>
                    <Text style={styles.accumGroupLabel}>問い {stats.new_questions}件</Text>
                    {accumulation.questions.map((question) => (
                      <Pressable key={question.id} onPress={() => onOpenNote(question.note_id)}>
                        <Text style={styles.accumItem}>
                          · {question.body}（{QUESTION_LABEL[question.question_type]}）
                        </Text>
                      </Pressable>
                    ))}
                    {extraQuestions > 0 ? (
                      <Text style={styles.accumMore}>ほか {extraQuestions} 件</Text>
                    ) : null}
                  </View>
                ) : null}

                {accumulation.answered.length > 0 || extraAnswered > 0 ? (
                  <View style={styles.accumGroup}>
                    <Text style={styles.accumGroupLabel}>
                      アーカイブした問い {stats.answered_questions}件
                    </Text>
                    {accumulation.answered.map((question) => (
                      <Pressable key={question.id} onPress={() => onOpenNote(question.note_id)}>
                        <Text style={styles.accumItem}>· {question.body}</Text>
                      </Pressable>
                    ))}
                    {extraAnswered > 0 ? (
                      <Text style={styles.accumMore}>ほか {extraAnswered} 件</Text>
                    ) : null}
                  </View>
                ) : null}

                {accumulation.exploration_updates.length > 0 || extraExplorations > 0 ? (
                  <View style={styles.accumGroup}>
                    <Text style={styles.accumGroupLabel}>探究の更新 {stats.new_explorations}件</Text>
                    {accumulation.exploration_updates.map((exploration) => (
                      <Text key={exploration.id} style={styles.accumItem}>
                        · {exploration.title}
                      </Text>
                    ))}
                    {extraExplorations > 0 ? (
                      <Text style={styles.accumMore}>ほか {extraExplorations} 件</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function HistoryReviewRow({
  item,
  onOpenQuestion,
}: {
  item: WeeklyReviewResult;
  onOpenQuestion: (noteId: string) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.historyRow}>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.historyHeader}>
        <Text style={styles.historyChevron}>{open ? '▾' : '▸'}</Text>
        <View style={styles.historyHeaderText}>
          <Text style={styles.historyPeriod}>{item.week_label}</Text>
          <Text numberOfLines={open ? undefined : 2} style={styles.historyTheme}>
            {item.recurring_theme}
          </Text>
        </View>
      </Pressable>
      {open ? (
        <View style={styles.historyBody}>
          <ReviewSnapshot item={item} onOpenQuestion={onOpenQuestion} compact />
        </View>
      ) : null}
    </View>
  );
}

export default function ReviewScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { user } = useAuth();
  const {
    review,
    history,
    accumulation,
    cooldown,
    usingDevMock,
    loading,
    generating,
    error,
    refresh,
    generate,
  } = useWeeklyReview(user?.id);

  const {
    visible: reviewReadyVisible,
    markSeen: markReviewReadySeen,
  } = useTutorialScene('reviewReady');

  const olderReviews = history.length > 1 ? history.slice(1) : [];
  const showFirstSample = !review && !loading && !usingDevMock;
  const emphasizeFirstReview =
    !review && cooldown.eligible && !generating && reviewReadyVisible && !usingDevMock;
  const [pullRefreshing, setPullRefreshing] = useState(false);

  useEffect(() => {
    if (reviewReadyVisible && review) {
      void markReviewReadySeen();
    }
  }, [review, reviewReadyVisible, markReviewReadySeen]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await refresh();
    } finally {
      setPullRefreshing(false);
    }
  }, [refresh]);

  const handleGenerate = useCallback(() => {
    if (reviewReadyVisible) void markReviewReadySeen();
    void generate();
  }, [generate, reviewReadyVisible, markReviewReadySeen]);

  const handleOpenQuestion = useCallback(
    (noteId: string) => {
      if (noteId.startsWith('dev-')) return;
      router.push(`/note/${noteId}`);
    },
    [router],
  );

  const handleMapLink = useCallback(() => {
    if (review?.exploration_id) {
      router.push(`/exploration/${review.exploration_id}`);
      return;
    }
    router.push('/(tabs)/explorations');
  }, [review?.exploration_id, router]);

  const generateLabel = generating
    ? '作成中…'
    : cooldown.eligible
      ? review
        ? 'ふりかえりを作成'
        : 'はじめてのふりかえりを作成'
      : `次のふりかえりまであと${cooldown.days_remaining}日`;

  return (
    <View style={styles.safe}>
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={pullRefreshing} onRefresh={() => void onPullRefresh()} />
        }
      >
        <Text style={styles.heading}>今週のふりかえり</Text>
        <Text style={styles.lead}>{review?.week_label ?? 'まだふりかえりがありません'}</Text>

        {usingDevMock ? (
          <Text style={styles.devBanner}>開発用サンプル — 2回以上のふりかえりをプレビュー中</Text>
        ) : null}

        {error ? <ErrorBanner message={error} /> : null}

        {loading && !review && !accumulation ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}

        {accumulation ? (
          <AccumulationSection
            accumulation={accumulation}
            isFirst={!review}
            sinceLabel={review ? formatReviewDateLabel(review.generated_at) : undefined}
            onOpenNote={handleOpenQuestion}
          />
        ) : null}

        <View style={styles.actionBlock}>
          <TutorialPulse active={emphasizeFirstReview} fadeOnly align="start">
            <Pressable
              disabled={generating || !cooldown.eligible}
              onPress={handleGenerate}
              style={({ pressed }) => [
                styles.updateBtn,
                emphasizeFirstReview && styles.updateBtnEmphasized,
                (!cooldown.eligible || generating) && styles.updateBtnDisabled,
                pressed && cooldown.eligible && !generating && styles.updateBtnPressed,
              ]}
            >
              {generating ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Text style={styles.updateBtnText}>{generateLabel}</Text>
              )}
            </Pressable>
          </TutorialPulse>

          {!cooldown.eligible && accumulation?.has_activity ? (
            <Text style={styles.cooldownHint}>
              このあいだの動きが溜まっています。次のふりかえりで反映されます。
            </Text>
          ) : null}

          {cooldown.eligible && accumulation?.has_activity ? (
            <Text style={styles.cooldownHint}>上に溜まった分を、ふりかえりにまとめます。</Text>
          ) : null}
        </View>

        {review ? (
          <>
            <View style={styles.recordSection}>
              <ZoneTag label="前回のふりかえり" variant="record" />
              <Text style={styles.recordMeta}>
                {review.week_label} · {formatReviewDateLabel(review.generated_at)}に作成
              </Text>
              <ReviewSnapshot
                item={review}
                onOpenQuestion={handleOpenQuestion}
                onMapLink={handleMapLink}
              />
            </View>

            {olderReviews.length > 0 ? (
              <View style={styles.historySection}>
                <Text style={styles.historyTitle}>これまでのふりかえり</Text>
                <Text style={styles.historyLead}>{olderReviews.length}件の記録</Text>
                {olderReviews.map((item) => (
                  <HistoryReviewRow
                    key={item.id}
                    item={item}
                    onOpenQuestion={handleOpenQuestion}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : showFirstSample ? (
          <View style={styles.firstSampleStack}>
            <Text style={styles.firstSampleLead}>
              押すと、下のような記録が残ります。
            </Text>
            <ReviewSamplePreview />
          </View>
        ) : !loading ? (
          <EmptyState
            title="まだふりかえりがありません"
            description="メモや問いが溜まったら、週に一度ふりかえりを作成できます。"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  firstSampleStack: {
    gap: 8,
    marginTop: 4,
  },
  firstSampleLead: {
    color: colors.sub,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2,
  },
  actionBlock: {
    marginBottom: 8,
    marginTop: 12,
  },
  heading: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 3,
  },
  lead: {
    color: colors.sub,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  devBanner: {
    backgroundColor: colors.cardElevated,
    borderRadius: 10,
    color: colors.sub,
    fontSize: 13,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  updateBtn: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 10,
    justifyContent: 'center',
    marginBottom: 10,
    minHeight: 36,
    minWidth: 180,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  updateBtnEmphasized: {
    borderColor: colors.lineStrong,
    borderWidth: 2,
  },
  updateBtnDisabled: {
    backgroundColor: '#9a978c',
  },
  updateBtnPressed: {
    opacity: 0.9,
  },
  updateBtnText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  cooldownHint: {
    color: colors.sub,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  center: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  liveZoneWrap: {
    marginBottom: 4,
    marginHorizontal: -16,
  },
  liveZone: {
    backgroundColor: colors.tabBar,
    borderBottomColor: colors.lineStrong,
    borderBottomWidth: 1,
    borderTopColor: colors.lineStrong,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  zoneTag: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    marginBottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  zoneTagLive: {
    backgroundColor: colors.actBg,
  },
  zoneTagRecord: {
    backgroundColor: colors.cardElevated,
  },
  zoneTagText: {
    fontSize: 14,
    fontWeight: '700',
  },
  zoneTagTextLive: {
    color: colors.act,
  },
  zoneTagTextRecord: {
    color: colors.sub,
  },
  recordSection: {
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 4,
  },
  recordMeta: {
    color: colors.hint,
    fontSize: 13,
    marginBottom: 12,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: '47%',
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  statCardOnLive: {
    backgroundColor: colors.input,
    borderColor: colors.lineStrong,
  },
  statNumber: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '600',
  },
  statLabel: {
    color: colors.sub,
    fontSize: 15,
    marginTop: 2,
  },
  block: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 11,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  blockPressed: {
    opacity: 0.92,
  },
  blockLabel: {
    color: colors.hint,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 7,
  },
  blockBody: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 24,
  },
  recall: {
    backgroundColor: colors.youBg,
    borderColor: colors.you,
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 1,
    marginBottom: 11,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  recallLabel: {
    color: colors.you,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 7,
  },
  mapLink: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  mapLinkText: {
    flex: 1,
    paddingRight: 8,
  },
  mapLinkTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '500',
  },
  mapLinkSub: {
    color: colors.hint,
    fontSize: 15,
    marginTop: 2,
  },
  mapLinkGo: {
    color: colors.hint,
    fontSize: 19,
  },
  accumulationTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  accumulationLead: {
    color: colors.sub,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  accumulationEmpty: {
    color: colors.sub,
    fontSize: 15,
    lineHeight: 24,
  },
  miniStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginBottom: 4,
  },
  detailsToggle: {
    alignSelf: 'flex-start',
    marginBottom: 4,
    marginTop: 6,
    paddingVertical: 4,
  },
  detailsToggleText: {
    color: colors.sub,
    fontSize: 14,
    fontWeight: '600',
  },
  accumDetails: {
    marginTop: 8,
  },
  accumGroup: {
    marginBottom: 12,
  },
  accumGroupLabel: {
    color: colors.hint,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  accumItem: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 4,
  },
  accumMore: {
    color: colors.sub,
    fontSize: 15,
    marginTop: 2,
  },
  historySection: {
    marginTop: 12,
  },
  historyTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  historyLead: {
    color: colors.sub,
    fontSize: 14,
    marginBottom: 10,
  },
  historyRow: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  historyHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  historyChevron: {
    color: colors.hint,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 1,
    width: 12,
  },
  historyHeaderText: {
    flex: 1,
  },
  historyPeriod: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  historyTheme: {
    color: colors.sub,
    fontSize: 15,
    lineHeight: 22,
  },
  historyBody: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingBottom: 8,
    paddingHorizontal: 13,
    paddingTop: 4,
  },
});
}
