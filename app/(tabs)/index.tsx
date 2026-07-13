import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { CaptureComposer } from '@/components/CaptureComposer';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { NoteCard } from '@/components/NoteCard';
import { useDeleteNote } from '@/hooks/useDeleteNote';
import { useNotes } from '@/hooks/useNotes';
import { useTutorialScene } from '@/hooks/useTutorialScene';
import { type ColorPalette } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useOpeningGate } from '@/providers/OpeningGateProvider';
import { useColors } from '@/providers/ThemeProvider';

export default function HomeScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { user } = useAuth();
  const { justFinished, clearWelcome } = useOpeningGate();
  const { notes, loading, error, refresh } = useNotes(user?.id);
  const { deleteNote, deleting, error: deleteError, clearError: clearDeleteError } = useDeleteNote();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const {
    ready: homeTutorialReady,
    seen: homeTutorialSeen,
    visible: homeTutorialVisible,
    markSeen: markHomeTutorialSeen,
  } = useTutorialScene('home0');

  const isEmpty = notes.length === 0;
  const emphasizeComposer = justFinished || (isEmpty && homeTutorialVisible);
  const listError = error ?? deleteError;

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!isEmpty && homeTutorialReady && !homeTutorialSeen) {
      void markHomeTutorialSeen();
    }
  }, [isEmpty, homeTutorialReady, homeTutorialSeen, markHomeTutorialSeen]);

  const handleDelete = useCallback(
    (noteId: string) => {
      void (async () => {
        setDeletingId(noteId);
        try {
          const ok = await deleteNote(noteId);
          if (ok) void refresh();
        } finally {
          setDeletingId(null);
        }
      })();
    },
    [deleteNote, refresh],
  );

  return (
    <View style={styles.safe}>
      <Stack.Screen
        options={{
          title: 'MONDO',
          headerRight: () => (
            <Pressable
              accessibilityLabel="設定"
              onPress={() => router.push('/settings')}
              style={styles.settingsButton}
            >
              <SymbolView
                name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
                tintColor={colors.sub}
                size={22}
              />
            </Pressable>
          ),
        }}
      />

      <View style={styles.flex}>
        {loading && notes.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.list}
            data={notes}
            keyExtractor={(item) => item.id}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={loading || deleting} onRefresh={() => void refresh()} />
            }
            ListEmptyComponent={
              <EmptyState
                title="まだメモがありません"
                description="上の欄に雑多に放り込むと、AIが分類して問いを返します。"
              />
            }
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <CaptureComposer
                  autoFocus={justFinished || emphasizeComposer}
                  emphasized={emphasizeComposer}
                  onDismissWelcome={() => {
                    clearWelcome();
                    if (homeTutorialVisible) void markHomeTutorialSeen();
                  }}
                  onSubmitted={() => {
                    void markHomeTutorialSeen();
                    void refresh();
                  }}
                />
                {listError ? (
                  <ErrorBanner message={listError} onDismiss={clearDeleteError} />
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <NoteCard
                note={item}
                summary={item.summary}
                deleting={deletingId === item.id}
                onPress={() => router.push(`/note/${item.id}`)}
                onDelete={() => handleDelete(item.id)}
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
    flex: {
      flex: 1,
    },
    listHeader: {
      paddingTop: 8,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      flexGrow: 1,
    },
    settingsButton: {
      marginRight: Platform.OS === 'web' ? 12 : 16,
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
  });
}
