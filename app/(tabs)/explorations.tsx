import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ErrorBanner } from '@/components/ErrorBanner';
import { ExplorationCard } from '@/components/ExplorationCard';
import { ExplorationSamplePreview } from '@/components/ExplorationSamplePreview';
import { HeaderTitleWithInfo } from '@/components/HeaderTitleWithInfo';
import { TutorialExploreProgress } from '@/components/TutorialExploreProgress';
import { TutorialPulse } from '@/components/TutorialPulse';
import { useClusterExplorations } from '@/hooks/useClusterExplorations';
import { useExplorations } from '@/hooks/useExplorations';
import { useTutorialScene } from '@/hooks/useTutorialScene';
import { useUnclusteredQuestionCount } from '@/hooks/useUnclusteredQuestionCount';
import { TUTORIAL_EXPLORE_READY_COUNT } from '@/lib/tutorial/constants';
import {
  hasPressedFirstExplorationAssign,
  markPressedFirstExplorationAssign,
} from '@/lib/tutorial/storage';
import { type ColorPalette } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useColors } from '@/providers/ThemeProvider';

function confirmRebuildExplorations(onConfirm: () => void) {
  const title = '束を組み直しますか？';
  const message =
    '探究と見取り図はすべて作り直されます。今の見取り図や探究の束を残したい場合は、個別に保存してください。';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: 'キャンセル', style: 'cancel' },
    { text: '組み直す', style: 'destructive', onPress: onConfirm },
  ]);
}

export default function ExplorationsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const router = useRouter();
  const { user } = useAuth();
  const { explorations, loading, error, refresh } = useExplorations(user?.id);
  const {
    count: unclusteredCount,
    newSinceClusterCount,
    clusteredAt,
    refresh: refreshUnclustered,
  } = useUnclusteredQuestionCount(user?.id);
  const { cluster, clustering, job, error: clusterError, refreshJob } = useClusterExplorations(
    user?.id,
    () => {
      void refresh({ silent: true });
      void refreshUnclustered();
    },
  );
  const {
    visible: explore0Visible,
    markSeen: markExplore0Seen,
  } = useTutorialScene('explore0');
  const {
    visible: exploreReadyVisible,
    markSeen: markExploreReadySeen,
  } = useTutorialScene('exploreReady');

  const hasPendingGraphicRec = explorations.some(
    (item) => item.graphic_rec_status === 'pending',
  );
  const hasExplorations = explorations.length > 0;
  const isCurrentAfterCluster = hasExplorations && newSinceClusterCount === 0;
  const hasNewSinceCluster = hasExplorations && newSinceClusterCount > 0;
  const showLeftoverNudge = isCurrentAfterCluster && unclusteredCount > 0;
  const isRebuildJob = job.mode === 'rebuild';
  const pendingLabel = isRebuildJob ? '束を組み直し中…' : '問いを振り分け中…';
  const showExploreProgress =
    !hasExplorations && unclusteredCount < TUTORIAL_EXPLORE_READY_COUNT;
  const showEmptyAssign =
    !hasExplorations && unclusteredCount >= TUTORIAL_EXPLORE_READY_COUNT;
  const emphasizeAssignButton = showEmptyAssign && exploreReadyVisible && !clustering;
  const [firstAssignPressed, setFirstAssignPressed] = useState<boolean | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  useEffect(() => {
    void hasPressedFirstExplorationAssign().then(setFirstAssignPressed);
  }, []);

  useEffect(() => {
    if (clusteredAt) setFirstAssignPressed(true);
  }, [clusteredAt]);

  const emptyAssignLabel =
    showEmptyAssign && firstAssignPressed === false
      ? '初めて探究の束を作ってみる'
      : '新しい問いを振り分ける';

  const headerTip = useMemo(() => {
    const base = '似たメモと問いが束になって立ち上がったテーマ。';
    if (explorations.length === 0) return base;
    return `${base}${explorations.length}件が育っています。`;
  }, [explorations.length]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => <HeaderTitleWithInfo title="探究" tip={headerTip} />,
    });
  }, [navigation, headerTip]);

  useFocusEffect(
    useCallback(() => {
      void refresh({ silent: true });
      void refreshUnclustered();
      void refreshJob();
    }, [refresh, refreshUnclustered, refreshJob]),
  );

  const onPullRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await Promise.all([
        refresh(),
        refreshUnclustered(),
        refreshJob(),
      ]);
    } finally {
      setPullRefreshing(false);
    }
  }, [refresh, refreshUnclustered, refreshJob]);

  useEffect(() => {
    if (!hasPendingGraphicRec && !clustering) return;
    const intervalId = setInterval(() => {
      void refresh({ silent: true });
    }, 10_000);
    return () => clearInterval(intervalId);
  }, [hasPendingGraphicRec, clustering, refresh]);

  useEffect(() => {
    if (!explore0Visible) return;
    if (hasExplorations || unclusteredCount >= TUTORIAL_EXPLORE_READY_COUNT) {
      void markExplore0Seen();
    }
  }, [explore0Visible, hasExplorations, unclusteredCount, markExplore0Seen]);

  useEffect(() => {
    if (exploreReadyVisible && hasExplorations) {
      void markExploreReadySeen();
    }
  }, [exploreReadyVisible, hasExplorations, markExploreReadySeen]);

  const handleCluster = useCallback(() => {
    if (clustering) return;
    if (hasExplorations && !hasNewSinceCluster) return;
    if (exploreReadyVisible) void markExploreReadySeen();
    if (showEmptyAssign && firstAssignPressed === false) {
      setFirstAssignPressed(true);
      void markPressedFirstExplorationAssign();
    }
    void cluster('incremental');
  }, [
    hasExplorations,
    hasNewSinceCluster,
    cluster,
    clustering,
    exploreReadyVisible,
    markExploreReadySeen,
    showEmptyAssign,
    firstAssignPressed,
  ]);

  const handleRebuild = useCallback(() => {
    if (clustering || !hasExplorations) return;
    confirmRebuildExplorations(() => {
      void cluster('rebuild');
    });
  }, [cluster, clustering, hasExplorations]);

  return (
    <View style={styles.safe}>
      <View style={styles.container}>
        {hasExplorations ? (
          <View style={styles.assignBlock}>
            {clustering ? (
              <View style={styles.pendingBlock}>
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.accent} size="small" />
                  <Text style={styles.statusLead}>{pendingLabel}</Text>
                </View>
                <Text style={styles.assignHint}>
                  終わったらお知らせします。この画面を閉じても大丈夫です。
                </Text>
              </View>
            ) : isCurrentAfterCluster ? (
              <>
                <Text style={styles.upToDate}>探究は最新です</Text>
                {showLeftoverNudge ? (
                  <Text style={styles.assignHint}>
                    まだ束になっていない問いが {unclusteredCount} 件あります。
                    あたらしい問いが生まれると、ここから探究の束になれることがあります。
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.statusLead}>あたらしい問いが増えています</Text>
                <Text style={styles.assignHint}>
                  振り分けてから {newSinceClusterCount} 件の問いが加わっています。
                  既存の探究に足すか、新しい探究を立てます。
                </Text>
              </>
            )}

            <View style={styles.actionRow}>
              <Pressable
                disabled={!hasNewSinceCluster || clustering}
                onPress={handleCluster}
                style={({ pressed }) => [
                  styles.updateBtn,
                  (!hasNewSinceCluster || clustering) && styles.updateBtnDisabled,
                  hasNewSinceCluster && !clustering && pressed && styles.updateBtnPressed,
                ]}
                accessibilityState={{ disabled: !hasNewSinceCluster || clustering }}
              >
                <Text
                  style={[
                    styles.updateBtnText,
                    (!hasNewSinceCluster || clustering) && styles.updateBtnTextDisabled,
                  ]}
                >
                  {clustering && !isRebuildJob ? pendingLabel : '新しい問いを振り分ける'}
                </Text>
              </Pressable>

              <Pressable
                disabled={clustering}
                onPress={handleRebuild}
                style={({ pressed }) => [styles.rebuildLink, pressed && styles.updateBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="束を組み直す"
              >
                <Text style={styles.rebuildLinkText}>
                  {clustering && isRebuildJob ? pendingLabel : '束を組み直す'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : showEmptyAssign ? (
          <View style={[styles.assignBlock, styles.assignBlockEmpty]}>
            {clustering ? (
              <View style={styles.pendingBlock}>
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.accent} size="small" />
                  <Text style={styles.statusLead}>{pendingLabel}</Text>
                </View>
                <Text style={styles.assignHint}>
                  終わったらお知らせします。この画面を閉じても大丈夫です。
                </Text>
              </View>
            ) : null}
            <TutorialPulse active={emphasizeAssignButton} fadeOnly align="start">
              <Pressable
                disabled={clustering}
                onPress={handleCluster}
                style={({ pressed }) => [
                  styles.updateBtn,
                  emphasizeAssignButton && styles.updateBtnEmphasized,
                  clustering && styles.updateBtnDisabled,
                  !clustering && pressed && styles.updateBtnPressed,
                ]}
              >
                <Text style={[styles.updateBtnText, clustering && styles.updateBtnTextDisabled]}>
                  {clustering ? pendingLabel : emptyAssignLabel}
                </Text>
              </Pressable>
            </TutorialPulse>
            {!clustering ? (
              <Text style={styles.assignHint}>
                未整理の問いが {unclusteredCount} 件あります。似たテーマの束を見つけます。
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={styles.assignHintMuted}>
            問いが溜まると、ここから探究の束をつくれます。
          </Text>
        )}

        {error || clusterError ? (
          <ErrorBanner message={error ?? clusterError ?? ''} />
        ) : null}

        {loading && explorations.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <FlatList
            data={explorations}
            keyExtractor={(item) => item.id}
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={pullRefreshing}
                onRefresh={() => void onPullRefresh()}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyStack}>
                {showExploreProgress ? (
                  <TutorialExploreProgress
                    count={unclusteredCount}
                    total={TUTORIAL_EXPLORE_READY_COUNT}
                    compact
                  />
                ) : null}
                <ExplorationSamplePreview />
              </View>
            }
            renderItem={({ item }) => (
              <ExplorationCard
                exploration={item}
                onOpen={() => router.push(`/exploration/${item.id}`)}
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
    assignBlock: {
      marginBottom: 14,
      paddingHorizontal: 16,
    },
    assignBlockEmpty: {
      marginBottom: 8,
    },
    pendingBlock: {
      marginBottom: 4,
    },
    actionRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 10,
    },
    updateBtn: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: colors.accent,
      borderRadius: 10,
      justifyContent: 'center',
      minHeight: 36,
      minWidth: 180,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    updateBtnEmphasized: {
      borderColor: colors.lineStrong,
      borderWidth: 2,
    },
    loadingRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    updateBtnPressed: {
      opacity: 0.9,
    },
    updateBtnText: {
      color: colors.onAccent,
      fontSize: 15,
      fontWeight: '600',
    },
    updateBtnDisabled: {
      backgroundColor: colors.line,
      opacity: 0.72,
    },
    updateBtnTextDisabled: {
      color: colors.hint,
    },
    assignHint: {
      color: colors.sub,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 8,
    },
    assignHintMuted: {
      color: colors.hint,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 8,
      paddingHorizontal: 16,
    },
    statusLead: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 22,
    },
    upToDate: {
      color: colors.hint,
      fontSize: 14,
      fontWeight: '500',
      marginBottom: 4,
    },
    rebuildLink: {
      marginLeft: 12,
      paddingVertical: 4,
    },
    rebuildLinkText: {
      color: colors.hint,
      fontSize: 13,
      textDecorationLine: 'underline',
    },
    list: {
      flexGrow: 1,
      paddingBottom: 16,
      paddingHorizontal: 16,
    },
    emptyStack: {
      paddingTop: 2,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
