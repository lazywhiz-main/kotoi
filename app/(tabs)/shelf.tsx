import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { DailyQuestionCard } from '@/components/DailyQuestionCard';
import { DailyQuestionEnableCard } from '@/components/DailyQuestionEnableCard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ShelfQuestionRow } from '@/components/ShelfQuestionRow';
import { useDailyQuestion } from '@/hooks/useDailyQuestion';
import { useOpenQuestions } from '@/hooks/useOpenQuestions';
import { useUserSettings } from '@/hooks/useUserSettings';
import {
  clearDailyQuestionEnableSkipped,
  isDailyQuestionEnableSkipped,
  markDailyQuestionEnableSkipped,
} from '@/lib/dailyQuestion';
import { filterOpenQuestions, QUESTION_FILTERS, type QuestionFilter } from '@/lib/openQuestions';
import { type ColorPalette } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useColors } from '@/providers/ThemeProvider';

export default function ShelfScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { user } = useAuth();
  const { questions, loading, error, refresh } = useOpenQuestions(user?.id);
  const { settings, updateSetting, savingKey } = useUserSettings(user?.id);
  const {
    delivery,
    loading: dailyLoading,
    acting,
    error: dailyError,
    refresh: refreshDaily,
    save,
    dismiss,
  } = useDailyQuestion(user?.id);
  const [filter, setFilter] = useState<QuestionFilter>('all');
  const [enableSkipped, setEnableSkipped] = useState(false);
  const [enableSkipReady, setEnableSkipReady] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  // settings 未取得中は判定しない（null を off 扱いするとチラつく）
  const recallOff = settings?.recall_rhythm === 'off';
  const showEnableCard =
    !!settings && recallOff && !delivery && enableSkipReady && !enableSkipped;

  const refreshEnableSkip = useCallback(async () => {
    if (!user?.id) {
      setEnableSkipped(false);
      setEnableSkipReady(true);
      return;
    }
    const skipped = await isDailyQuestionEnableSkipped(user.id);
    setEnableSkipped(skipped);
    setEnableSkipReady(true);
  }, [user?.id]);

  useEffect(() => {
    void refreshEnableSkip();
  }, [refreshEnableSkip]);

  const refreshAll = useCallback(() => {
    void refresh();
    void refreshDaily();
    void refreshEnableSkip();
  }, [refresh, refreshDaily, refreshEnableSkip]);

  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await Promise.all([refresh(), refreshDaily(), refreshEnableSkip()]);
    } finally {
      setPullRefreshing(false);
    }
  }, [refresh, refreshDaily, refreshEnableSkip]);

  useFocusEffect(
    useCallback(() => {
      refreshAll();
    }, [refreshAll]),
  );

  const filtered = useMemo(
    () => filterOpenQuestions(questions, filter),
    [questions, filter],
  );

  const listError = error ?? dailyError;

  const renderHeader = useCallback(
    () => (
      <View>
        {delivery ? (
          <DailyQuestionCard
            delivery={delivery}
            busy={acting}
            onOpen={() =>
              router.push({
                pathname: '/note/[id]',
                params: { id: delivery.anchor_note_id },
              })
            }
            onSave={() => {
              void save().then((threadItemId) => {
                if (threadItemId) {
                  void refresh();
                  router.push({
                    pathname: '/note/[id]',
                    params: {
                      id: delivery.anchor_note_id,
                      itemId: threadItemId,
                    },
                  });
                }
              });
            }}
            onDismiss={() => void dismiss()}
          />
        ) : null}
        {showEnableCard ? (
          <DailyQuestionEnableCard
            busy={savingKey === 'recall_rhythm' || savingKey === 'recall_hour'}
            initialHour={settings?.recall_hour ?? 8}
            onEnable={(hour) => {
              void (async () => {
                if (user?.id) await clearDailyQuestionEnableSkipped(user.id);
                setEnableSkipped(false);
                await updateSetting('recall_hour', hour);
                await updateSetting('recall_rhythm', 'daily');
                void refreshDaily();
              })();
            }}
            onSkip={() => {
              void (async () => {
                if (!user?.id) return;
                setEnableSkipped(true);
                await markDailyQuestionEnableSkipped(user.id);
              })();
            }}
          />
        ) : null}
        {dailyLoading && !delivery && !showEnableCard ? (
          <View style={styles.dailyLoading}>
            <ActivityIndicator color={colors.accent} size="small" />
          </View>
        ) : null}
        <Text style={styles.lead}>
          いま追っている問い {questions.length}件。押すと元のスレッドへ。
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filters}
        >
          {QUESTION_FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setFilter(item.id)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {listError ? <ErrorBanner message={listError} /> : null}
      </View>
    ),
    [
      acting,
      colors.accent,
      dailyLoading,
      delivery,
      dismiss,
      filter,
      listError,
      questions.length,
      refresh,
      refreshDaily,
      router,
      save,
      savingKey,
      showEnableCard,
      styles,
      updateSetting,
      user?.id,
    ],
  );

  // 問い一覧の初回ロード中でも、誘導カードは出す（スピナーでヘッダごと消さない）
  const showInitialSpinner =
    loading && questions.length === 0 && !delivery && !showEnableCard;

  return (
    <View style={styles.safe}>
      <View style={styles.container}>
        {showInitialSpinner ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={renderHeader}
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={pullRefreshing}
                onRefresh={() => void onPullRefresh()}
              />
            }
            ListEmptyComponent={
              <EmptyState
                title={filter === 'all' ? '未回答の問いはありません' : 'この類型の問いはありません'}
                description={
                  filter === 'all'
                    ? 'メモを放り込むと、ここに問いが集まります。'
                    : '別の類型を選ぶか、新しいメモから問いを育ててみてください。'
                }
              />
            }
            renderItem={({ item }) => (
              <ShelfQuestionRow
                row={item}
                onPress={() =>
                  router.push({
                    pathname: '/note/[id]',
                    params: { id: item.note_id, itemId: item.id },
                  })
                }
              />
            )}
          />
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    container: {
      flex: 1,
      paddingTop: 8,
    },
    dailyLoading: {
      alignItems: 'center',
      marginBottom: 12,
    },
    lead: {
      color: colors.sub,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 14,
      paddingHorizontal: 16,
    },
    filtersScroll: {
      flexGrow: 0,
      flexShrink: 0,
    },
    filters: {
      alignItems: 'center',
      gap: 6,
      paddingBottom: 14,
      paddingHorizontal: 16,
    },
    filterChip: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderColor: colors.line,
      borderRadius: 20,
      borderWidth: 1,
      justifyContent: 'center',
      minHeight: 34,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    filterChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    filterText: {
      color: colors.ink,
      fontSize: 14,
      includeFontPadding: false,
      lineHeight: 20,
      textAlignVertical: 'center',
    },
    filterTextActive: {
      color: colors.onAccent,
      fontWeight: '600',
      lineHeight: 20,
    },
    list: {
      flexGrow: 1,
      justifyContent: 'flex-start',
      paddingBottom: 16,
      paddingHorizontal: 16,
      paddingTop: 2,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
