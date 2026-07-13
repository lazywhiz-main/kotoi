import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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

import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ShelfQuestionRow } from '@/components/ShelfQuestionRow';
import { useOpenQuestions } from '@/hooks/useOpenQuestions';
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
  const [filter, setFilter] = useState<QuestionFilter>('all');

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const filtered = useMemo(
    () => filterOpenQuestions(questions, filter),
    [questions, filter],
  );

  return (
    <View style={styles.safe}>
      <View style={styles.container}>
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

        {error ? <ErrorBanner message={error} /> : null}

        {loading && questions.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
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
