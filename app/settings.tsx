import { Link, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, type ReactNode, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/ErrorBanner';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSubscription } from '@/hooks/useSubscription';
import { useUsageSummary } from '@/hooks/useUsageSummary';
import { useUserSettings } from '@/hooks/useUserSettings';
import { invokeFunction } from '@/lib/api';
import {
  RECALL_RHYTHM_OPTIONS,
  WEEKDAY_OPTIONS,
  recallHourChipOptions,
  recallHourLabel,
} from '@/lib/dailyQuestion';
import { LEGAL_URLS } from '@/lib/legal';
import {
  annualUpgradeHint,
  annualUpgradeTarget,
  canUpgradeToAnnual,
  formatRenewalDate,
  isDevBillingStore,
  planDisplayName,
} from '@/lib/planDisplay';
import {
  isPurchasesAvailable,
  purchasePlan,
  waitForSubscribed,
} from '@/lib/purchases';
import { clearAllTutorials } from '@/lib/tutorial/storage';
import { track } from '@/lib/analytics';
import { deleteAccount } from '@/lib/deleteAccount';
import { formatUsd, mergeUsageBreakdown } from '@/lib/usageLabels';
import { entitlementOf, type SubscriptionRow } from '@/lib/entitlements';
import { type AppearancePreference, type ColorPalette } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useOpeningGate } from '@/providers/OpeningGateProvider';
import { useColors, useTheme } from '@/providers/ThemeProvider';

function openLegalUrl(url: string) {
  void Linking.openURL(url).catch(() => {
    Alert.alert('', 'ページを開けませんでした');
  });
}

function planStatusCopy(sub: SubscriptionRow): {
  title: string;
  body: string;
  cta: string;
  reason: string;
} {
  const readOnly =
    sub.trial_state === 'expired' || sub.trial_state === 'read_only';
  if (readOnly) {
    const usedFree = !!sub.free_graphic_rec_exploration_id;
    return {
      title: 'いまは閲覧が中心です',
      body: usedFree
        ? 'お試しの目安に達しました。これまでの記録と見取り図はそのまま残っています。'
        : 'お試しの目安に達しました。これまでの記録はそのまま残っています。見取り図の無料1枚は、まだ受け取れます。',
      cta: '続きを書く',
      reason: 'read_only',
    };
  }
  if (sub.free_graphic_rec_exploration_id) {
    return {
      title: 'お試し',
      body: '無料の見取り図は受け取り済みです。もう一枚から、続けるためのプランが必要です。',
      cta: '続ける',
      reason: 'settings',
    };
  }
  return {
    title: 'お試し',
    body: '見取り図は1枚まで無料です。記録を残しながら、続きはいつでも書けます。',
    cta: 'プランを見る',
    reason: 'settings',
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function SettingRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={styles.rowDescription}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.line, true: colors.conBg }}
        thumbColor={value ? colors.con : colors.card}
      />
    </View>
  );
}

function AppearancePicker({
  value,
  onChange,
  disabled,
}: {
  value: AppearancePreference;
  onChange: (next: AppearancePreference) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const options: { id: AppearancePreference; label: string }[] = [
    { id: 'system', label: 'システム' },
    { id: 'light', label: 'ライト' },
    { id: 'dark', label: 'ダーク' },
  ];

  return (
    <View style={styles.appearanceRow}>
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <Pressable
            key={option.id}
            disabled={disabled}
            onPress={() => onChange(option.id)}
            style={[
              styles.appearanceChip,
              selected && styles.appearanceChipOn,
              disabled && styles.appearanceChipDisabled,
            ]}
          >
            <Text style={[styles.appearanceChipText, selected && styles.appearanceChipTextOn]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { preference, setPreference } = useTheme();
  const { resetOpening } = useOpeningGate();
  const router = useRouter();
  const [lifetimeOpen, setLifetimeOpen] = useState(true);
  const [periodOpen, setPeriodOpen] = useState(true);
  const [billingBusy, setBillingBusy] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const { subscription, refresh: refreshSubscription } = useSubscription();
  const {
    user,
    signOut,
    linkedProviders,
    linkApple,
    linkGoogle,
    providerLabel,
    refreshUser,
    setPassword,
  } = useAuth();
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const {
    settings,
    loading: settingsLoading,
    savingKey,
    error: settingsError,
    updateSetting,
  } = useUserSettings(user?.id);
  const { summary, loading: usageLoading, error: usageError, refresh } = useUsageSummary();

  usePushNotifications(user?.id);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void refreshSubscription();
    }, [refresh, refreshSubscription]),
  );

  const loading = settingsLoading || usageLoading;
  const error = settingsError ?? usageError;
  const usageRatio =
    summary && summary.daily_limit_usd > 0
      ? Math.min(summary.today_cost_usd / summary.daily_limit_usd, 1)
      : 0;
  const usageRows = summary ? mergeUsageBreakdown(summary.by_fn) : [];
  const lifetimeRows = summary?.lifetime_by_fn
    ? mergeUsageBreakdown(summary.lifetime_by_fn)
    : [];
  const periodRows = summary?.period_by_fn
    ? mergeUsageBreakdown(summary.period_by_fn)
    : [];
  const isSubscribed = subscription?.trial_state === 'subscribed';
  const isReadOnly =
    !!subscription && entitlementOf(subscription) === 'read_only';
  const planCopy =
    subscription && !isSubscribed ? planStatusCopy(subscription) : null;
  const renewalLabel = formatRenewalDate(subscription?.current_period_end);

  const setBillingMode = useCallback(
    async (on: boolean) => {
      setBillingBusy(true);
      try {
        // SEAM: 実課金後は Store 購入 / 解約フローに差し替え
        await invokeFunction('trial-dev-override', {
          action: on ? 'subscribe' : 'reset_trial',
          ...(on ? { plan: 'monthly' } : {}),
        });
        await refreshSubscription();
        await refresh();
        Alert.alert(
          '',
          on
            ? '課金モード（仮）を ON にしました。プランと更新日が設定に出ます。'
            : '課金モードを OFF にし、無料トライアルに戻しました。',
        );
      } catch (err: unknown) {
        Alert.alert(
          '',
          err instanceof Error ? err.message : '失敗（ALLOW_TRIAL_DEV_OVERRIDE を確認）',
        );
      } finally {
        setBillingBusy(false);
      }
    },
    [refresh, refreshSubscription],
  );

  const upgradeHint = annualUpgradeHint(subscription?.plan);
  const upgradeTarget = annualUpgradeTarget(subscription?.plan);
  const showAnnualUpgrade =
    isSubscribed && canUpgradeToAnnual(subscription?.plan) && !!upgradeTarget;

  const handleUpgradeToAnnual = useCallback(() => {
    if (!upgradeTarget) return;

    track('annual_upgrade_tapped');

    const isStudent = upgradeTarget === 'student_annual';
    Alert.alert(
      '年払いに切り替える',
      [
        isStudent
          ? '学割の年額プラン（¥5,000 / 年）に切り替えます。'
          : '年額プラン（¥10,000 / 年）に切り替えます。',
        '',
        'いまの月額との差額や反映のタイミングは、ストアの購入画面の表示に従います。',
        'キャンセルすれば、いまの月額のままです。',
      ].join('\n'),
      [
        {
          text: 'やめる',
          style: 'cancel',
          onPress: () => track('annual_upgrade_result', { result: 'cancel' }),
        },
        {
          text: '切り替える',
          onPress: () => {
            void (async () => {
              setUpgradeBusy(true);
              try {
                if (isDevBillingStore(subscription?.store)) {
                  await invokeFunction('trial-dev-override', {
                    action: 'subscribe',
                    plan: upgradeTarget,
                  });
                  await refreshSubscription();
                  track('annual_upgrade_result', { result: 'ok' });
                  Alert.alert('', '年払いに切り替えました（仮）。');
                  return;
                }

                if (!isPurchasesAvailable()) {
                  track('annual_upgrade_result', { result: 'fail', error_code: 'unavailable' });
                  Alert.alert(
                    '',
                    'ストア課金を使えるビルドでお試しください（TestFlight など）。',
                  );
                  return;
                }

                const result = await purchasePlan(upgradeTarget);
                if (!result.ok) {
                  if (result.cancelled) {
                    track('annual_upgrade_result', { result: 'cancel' });
                    return;
                  }
                  track('annual_upgrade_result', { result: 'fail' });
                  Alert.alert('', result.message);
                  return;
                }

                const ok = await waitForSubscribed(async () => {
                  const row = await refreshSubscription();
                  return (
                    row?.plan === 'annual' || row?.plan === 'student_annual'
                  );
                });
                track('annual_upgrade_result', { result: 'ok' });
                Alert.alert(
                  '',
                  ok
                    ? '年払いに切り替えました。'
                    : '購入は完了しています。反映まで少し時間がかかることがあります。',
                );
              } catch (err: unknown) {
                track('annual_upgrade_result', { result: 'fail' });
                Alert.alert(
                  '',
                  err instanceof Error ? err.message : '切り替えに失敗しました',
                );
              } finally {
                setUpgradeBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [upgradeTarget, subscription?.store, refreshSubscription]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'アカウントを削除しますか？',
      'メモ・問い・探究・設定など、このアカウントのデータはすべて削除されます。元に戻せません。',
      [
        { text: 'やめる', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '最終確認',
              '本当にアカウントを削除しますか？',
              [
                { text: 'やめる', style: 'cancel' },
                {
                  text: '完全に削除',
                  style: 'destructive',
                  onPress: () => {
                    void (async () => {
                      setDeleteBusy(true);
                      try {
                        await deleteAccount();
                        await signOut();
                        Alert.alert('', 'アカウントを削除しました。');
                      } catch (err: unknown) {
                        Alert.alert(
                          '',
                          err instanceof Error
                            ? err.message
                            : '削除に失敗しました。しばらくしてから再度お試しください。',
                        );
                      } finally {
                        setDeleteBusy(false);
                      }
                    })();
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }, [signOut]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: '設定' }} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => {
              void refresh();
              void refreshSubscription();
            }}
          />
        }
      >
        {error ? <ErrorBanner message={error} /> : null}

        {isSubscribed && subscription ? (
          <Section title="プラン">
            <Text style={styles.planStatusTitle}>
              {planDisplayName(subscription.plan)}
              {isDevBillingStore(subscription.store) ? '（仮）' : ''}
            </Text>
            <Text style={styles.rowDescription}>
              {renewalLabel
                ? `次回更新  ${renewalLabel}`
                : '契約期間の情報はまだありません。'}
            </Text>
            {showAnnualUpgrade && upgradeHint ? (
              <View style={styles.upgradeBlock}>
                <Text style={styles.upgradeHint}>{upgradeHint}</Text>
                <Pressable
                  disabled={upgradeBusy || billingBusy}
                  onPress={handleUpgradeToAnnual}
                  style={({ pressed }) => [
                    styles.planCta,
                    (pressed || upgradeBusy) && styles.pressed,
                  ]}
                >
                  {upgradeBusy ? (
                    <ActivityIndicator color={colors.onAccent} size="small" />
                  ) : (
                    <Text style={styles.planCtaText}>年払いに切り替える</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
            {summary ? (
              <>
                <View style={styles.lifetimeBox}>
                  <Pressable
                    onPress={() => setPeriodOpen((open) => !open)}
                    style={styles.lifetimeHeader}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: periodOpen }}
                  >
                    <Text style={styles.lifetimeTitle}>この契約期間の利用</Text>
                    <Text style={styles.lifetimeTotal}>
                      {formatUsd(summary.period_cost_usd ?? 0)}
                      {periodOpen ? ' ▲' : ' ▼'}
                    </Text>
                  </Pressable>
                  <Text style={styles.lifetimeHint}>
                    購読してからの利用です。お試し中の分は含みません
                  </Text>
                  {periodOpen && periodRows.length > 0 ? (
                    <View style={styles.breakdown}>
                      {periodRows.map((row) => (
                        <View key={row.key} style={styles.breakdownRow}>
                          <Text style={styles.breakdownLabel}>{row.label}</Text>
                          <Text style={styles.breakdownValue}>
                            {formatUsd(row.cost_usd)} · {row.count}回
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {periodOpen && periodRows.length === 0 ? (
                    <Text style={styles.emptyHint}>まだこの期間の利用はありません</Text>
                  ) : null}
                </View>
                {lifetimeRows.length > 0 ? (
                  <View style={styles.lifetimeBox}>
                    <Pressable
                      onPress={() => setLifetimeOpen((open) => !open)}
                      style={styles.lifetimeHeader}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: lifetimeOpen }}
                    >
                      <Text style={styles.lifetimeTitle}>これまでの積み上げ</Text>
                      <Text style={styles.lifetimeTotal}>
                        {formatUsd(summary.lifetime_cost_usd ?? 0)}
                        {lifetimeOpen ? ' ▲' : ' ▼'}
                      </Text>
                    </Pressable>
                    <Text style={styles.lifetimeHint}>
                      お試し期間を含む、すべての利用です
                    </Text>
                    {lifetimeOpen ? (
                      <View style={styles.breakdown}>
                        {lifetimeRows.map((row) => (
                          <View key={row.key} style={styles.breakdownRow}>
                            <Text style={styles.breakdownLabel}>{row.label}</Text>
                            <Text style={styles.breakdownValue}>
                              {formatUsd(row.cost_usd)} · {row.count}回
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : null}
          </Section>
        ) : null}

        {planCopy ? (
          <Section title="プラン">
            <Text style={styles.planStatusTitle}>{planCopy.title}</Text>
            <Text style={styles.rowDescription}>{planCopy.body}</Text>
            {summary ? (
              <View style={styles.lifetimeBox}>
                <Pressable
                  onPress={() => setLifetimeOpen((open) => !open)}
                  style={styles.lifetimeHeader}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: lifetimeOpen }}
                >
                  <Text style={styles.lifetimeTitle}>これまでの利用</Text>
                  <Text style={styles.lifetimeTotal}>
                    {formatUsd(summary.lifetime_cost_usd ?? 0)}
                    {lifetimeOpen ? ' ▲' : ' ▼'}
                  </Text>
                </Pressable>
                <Text style={styles.lifetimeHint}>
                  {isReadOnly
                    ? 'お試しの目安に使われた内訳です（今日の上限とは別）'
                    : 'お試し中の累積です。目安の安全弁に使われます（今日の上限とは別）'}
                </Text>
                {lifetimeOpen && lifetimeRows.length > 0 ? (
                  <View style={styles.breakdown}>
                    {lifetimeRows.map((row) => (
                      <View key={row.key} style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>{row.label}</Text>
                        <Text style={styles.breakdownValue}>
                          {formatUsd(row.cost_usd)} · {row.count}回
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {lifetimeOpen && lifetimeRows.length === 0 ? (
                  <Text style={styles.emptyHint}>まだ累積の利用はありません</Text>
                ) : null}
              </View>
            ) : null}
            <Pressable
              onPress={() => {
                router.push({
                  pathname: '/paywall',
                  params: { reason: planCopy.reason },
                });
              }}
              style={({ pressed }) => [styles.planCta, pressed && styles.pressed]}
            >
              <Text style={styles.planCtaText}>{planCopy.cta}</Text>
            </Pressable>
          </Section>
        ) : null}

        <Section title="今日の AI 上限">
          {loading && !summary ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : summary ? (
            <>
              <Text style={styles.usageLead}>
                調べる・深掘り・見取り図・探究の整理など、重めの処理の今日の目安です
                {isReadOnly
                  ? '。お試しの状態とは別のメーターです。'
                  : '。'}
              </Text>
              <View style={styles.usageHeader}>
                <Text style={styles.usageCost}>{formatUsd(summary.today_cost_usd)}</Text>
                <Text style={styles.usageLimit}>
                  / {formatUsd(summary.daily_limit_usd)} まで
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${usageRatio * 100}%` }]} />
              </View>
              {usageRows.length > 0 ? (
                <View style={styles.breakdown}>
                  {usageRows.map((row) => (
                    <View key={row.key} style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>{row.label}</Text>
                      <Text style={styles.breakdownValue}>
                        {formatUsd(row.cost_usd)} · {row.count}回
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyHint}>まだ今日の利用はありません</Text>
              )}
            </>
          ) : null}
        </Section>

        <Section title="外観">
          <Text style={styles.appearanceLead}>ダークモードは夜や暗い場所での閲覧に向いています。</Text>
          <AppearancePicker
            value={preference}
            onChange={(next) => void setPreference(next)}
          />
        </Section>

        <Section title="通知">
          <SettingRow
            label="調べる・深掘り・見取り図・探究の完了"
            description="エージェントや見取り図、問いの振り分けが終わったら知らせます"
            value={settings?.notify_agent_done ?? true}
            onValueChange={(next) => void updateSetting('notify_agent_done', next)}
            disabled={settingsLoading || savingKey === 'notify_agent_done'}
          />
          <View style={styles.divider} />
          <SettingRow
            label="今週のふりかえり"
            description="ふりかえりができたら知らせます"
            value={settings?.notify_weekly_review ?? true}
            onValueChange={(next) => void updateSetting('notify_weekly_review', next)}
            disabled={settingsLoading || savingKey === 'notify_weekly_review'}
          />
          {Platform.OS === 'web' ? (
            <Text style={styles.platformHint}>プッシュ通知は実機アプリでのみ利用できます</Text>
          ) : null}
        </Section>

        <Section title="別角度の呼び戻し">
          <Text style={styles.appearanceLead}>
            問いの棚に、溜まったメモと問いから別角度の問いを届けます。はじめはオフです。
          </Text>
          <Text style={styles.choiceLabel}>リズム</Text>
          <View style={styles.choiceRow}>
            {RECALL_RHYTHM_OPTIONS.map((opt) => {
              const active = (settings?.recall_rhythm ?? 'off') === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  disabled={settingsLoading || savingKey === 'recall_rhythm'}
                  onPress={() => void updateSetting('recall_rhythm', opt.id)}
                  style={[styles.choiceChip, active && styles.choiceChipActive]}
                >
                  <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {(settings?.recall_rhythm ?? 'off') === 'weekly' ? (
            <>
              <Text style={styles.choiceLabel}>曜日</Text>
              <View style={styles.choiceRow}>
                {WEEKDAY_OPTIONS.map((opt) => {
                  const active = (settings?.recall_weekday ?? 0) === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      disabled={settingsLoading || savingKey === 'recall_weekday'}
                      onPress={() => void updateSetting('recall_weekday', opt.value)}
                      style={[styles.choiceChip, active && styles.choiceChipActive]}
                    >
                      <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
          {(settings?.recall_rhythm ?? 'off') !== 'off' ? (
            <>
              <Text style={styles.choiceLabel}>届く時刻（日本時間）</Text>
              <View style={styles.choiceRow}>
                {recallHourChipOptions(settings?.recall_hour).map((hour) => {
                  const active = (settings?.recall_hour ?? 8) === hour;
                  return (
                    <Pressable
                      key={hour}
                      disabled={settingsLoading || savingKey === 'recall_hour'}
                      onPress={() => void updateSetting('recall_hour', hour)}
                      style={[styles.choiceChip, active && styles.choiceChipActive]}
                    >
                      <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                        {recallHourLabel(hour)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.divider} />
              <SettingRow
                label="届いたら通知"
                description="今日の問いが届いたときに知らせます"
                value={settings?.notify_daily_question ?? true}
                onValueChange={(next) => void updateSetting('notify_daily_question', next)}
                disabled={settingsLoading || savingKey === 'notify_daily_question'}
              />
            </>
          ) : null}
        </Section>

        <Section title="ログイン方法">
          <Text style={styles.appearanceLead}>
            つながっている方法です。Apple でメールを隠した場合は、先にメールで入ってからここで追加してください。
          </Text>
          {linkedProviders.length > 0 ? (
            <View style={styles.providerList}>
              {linkedProviders.map((provider) => (
                <Text key={provider} style={styles.providerItem}>
                  · {providerLabel(provider)}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyHint}>まだ連携情報がありません</Text>
          )}
          {linkError ? <Text style={styles.linkError}>{linkError}</Text> : null}
          {!linkedProviders.includes('apple') ? (
            <Pressable
              disabled={linking}
              onPress={() => {
                setLinking(true);
                setLinkError(null);
                void linkApple().then((result) => {
                  setLinking(false);
                  if (result.error) setLinkError(result.error);
                  else void refreshUser();
                });
              }}
              style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
            >
              <Text style={styles.rowLabel}>Apple を追加</Text>
            </Pressable>
          ) : null}
          {!linkedProviders.includes('google') ? (
            <>
              {!linkedProviders.includes('apple') ? <View style={styles.divider} /> : null}
              <Pressable
                disabled={linking}
                onPress={() => {
                  setLinking(true);
                  setLinkError(null);
                  void linkGoogle().then((result) => {
                    setLinking(false);
                    if (result.error) setLinkError(result.error);
                    else void refreshUser();
                  });
                }}
                style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
              >
                <Text style={styles.rowLabel}>Google を追加</Text>
              </Pressable>
            </>
          ) : null}
          {linking ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />
          ) : null}

          <View style={styles.divider} />
          <Text style={styles.rowLabel}>パスワードを設定・変更</Text>
          <Text style={styles.rowDescription}>
            確認コードだけで使っている場合も、ここでパスワードを足せます。
          </Text>
          {user?.email ? (
            <Text style={styles.passwordEmail}>{user.email}</Text>
          ) : null}
          <View style={styles.passwordInputShell}>
            <TextInput
              autoCapitalize="none"
              autoComplete="new-password"
              placeholder="6文字以上"
              placeholderTextColor={colors.hint}
              secureTextEntry
              style={styles.passwordInput}
              value={newPassword}
              onChangeText={setNewPassword}
            />
          </View>
          {passwordError ? <Text style={styles.linkError}>{passwordError}</Text> : null}
          {passwordMessage ? <Text style={styles.passwordOk}>{passwordMessage}</Text> : null}
          <Pressable
            disabled={passwordSaving}
            onPress={() => {
              setPasswordSaving(true);
              setPasswordError(null);
              setPasswordMessage(null);
              void setPassword(newPassword).then((result) => {
                setPasswordSaving(false);
                if (result.error) {
                  setPasswordError(result.error);
                  return;
                }
                setNewPassword('');
                setPasswordMessage('パスワードを保存しました。次回からパスワードでも入れます。');
              });
            }}
            style={({ pressed }) => [styles.passwordSaveBtn, pressed && styles.pressed]}
          >
            {passwordSaving ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Text style={styles.passwordSaveText}>パスワードを保存</Text>
            )}
          </Pressable>
        </Section>

        <Section title="案内">
          <Pressable
            onPress={() => {
              Alert.alert(
                '案内をもう一度',
                'ホームや探究の短い印を、はじめからやり直せます。',
                [
                  { text: 'やめる', style: 'cancel' },
                  {
                    text: 'やり直す',
                    onPress: () => {
                      void clearAllTutorials().then(() => {
                        router.replace('/(tabs)');
                      });
                    },
                  },
                ],
              );
            }}
            style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>案内をもう一度</Text>
              <Text style={styles.rowDescription}>
                放り込む・棚・探究の短い印を最初から見られます
              </Text>
            </View>
          </Pressable>
        </Section>

        <Section title="法務">
          <Pressable
            onPress={() => openLegalUrl(LEGAL_URLS.terms)}
            style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
          >
            <Text style={styles.rowLabel}>利用規約</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            onPress={() => openLegalUrl(LEGAL_URLS.privacy)}
            style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
          >
            <Text style={styles.rowLabel}>プライバシーポリシー</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            onPress={() => openLegalUrl(LEGAL_URLS.tokushoho)}
            style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
          >
            <Text style={styles.rowLabel}>特定商取引法に基づく表記</Text>
          </Pressable>
        </Section>

        {__DEV__ ? (
          <Section title="開発">
            <Link href="/dev/opening-skia" asChild>
              <Pressable style={({ pressed }) => [styles.devLink, pressed && styles.pressed]}>
                <Text style={styles.devLinkText}>Skia オープニング検証（サンプル）</Text>
              </Pressable>
            </Link>
            <Pressable
              onPress={() => {
                void resetOpening().then(() => {
                  router.replace('/opening');
                });
              }}
              style={({ pressed }) => [styles.devLink, pressed && styles.pressed]}
            >
              <Text style={styles.devLinkText}>オープニングをリセット</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void clearAllTutorials().then(() => {
                  router.replace('/(tabs)');
                });
              }}
              style={({ pressed }) => [styles.devLink, pressed && styles.pressed]}
            >
              <Text style={styles.devLinkText}>チュートリアル案内をリセット（確認なし）</Text>
            </Pressable>
            <Text style={styles.rowDescription}>
              トライアル: {subscription?.trial_state ?? '（未取得）'}
              {subscription?.free_graphic_rec_exploration_id
                ? ' · 見取り図1枠使用済'
                : ''}
              {'\n'}安全弁は常に有効。課金モードは仮の購読状態です（実 Store 課金前）。
            </Text>
            <View style={styles.billingModeRow}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>課金モード（仮）</Text>
                <Text style={styles.rowDescription}>
                  ON で購読相当。プラン・契約期間の利用・積み上げが出ます
                </Text>
              </View>
              <Switch
                value={isSubscribed}
                onValueChange={(next) => void setBillingMode(next)}
                disabled={billingBusy}
                trackColor={{ false: colors.line, true: colors.conBg }}
                thumbColor={isSubscribed ? colors.con : colors.card}
              />
            </View>
            <Pressable
              onPress={() => {
                void invokeFunction('trial-dev-override', { action: 'force_expire' })
                  .then(() => refreshSubscription())
                  .then(() =>
                    Alert.alert(
                      '',
                      'expired（閲覧のみ）にしました。メモ等のAIは止まり、見取り図1枚目未作成なら生成可、2枚目はペイウォールです。',
                    ),
                  )
                  .catch((err: unknown) => {
                    Alert.alert(
                      '',
                      err instanceof Error ? err.message : '失敗（ALLOW_TRIAL_DEV_OVERRIDE を確認）',
                    );
                  });
              }}
              style={({ pressed }) => [styles.devLink, pressed && styles.pressed]}
            >
              <Text style={styles.devLinkText}>安全弁後（閲覧のみ）にする</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void invokeFunction('trial-dev-override', {
                  action: 'subscribe',
                  plan: 'annual',
                })
                  .then(() => refreshSubscription())
                  .then(() => refresh())
                  .then(() => Alert.alert('', '年額（仮）にしました。'))
                  .catch((err: unknown) => {
                    Alert.alert(
                      '',
                      err instanceof Error ? err.message : '失敗（ALLOW_TRIAL_DEV_OVERRIDE を確認）',
                    );
                  });
              }}
              style={({ pressed }) => [styles.devLink, pressed && styles.pressed]}
            >
              <Text style={styles.devLinkText}>年額プラン（仮）にする</Text>
            </Pressable>
          </Section>
        ) : null}

        <Section title="アカウント">
          <Pressable
            onPress={() => void signOut()}
            style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
          >
            <Text style={styles.signOutText}>ログアウト</Text>
          </Pressable>
          <Pressable
            disabled={deleteBusy}
            onPress={handleDeleteAccount}
            style={({ pressed }) => [
              styles.deleteAccountButton,
              (pressed || deleteBusy) && styles.pressed,
            ]}
          >
            {deleteBusy ? (
              <ActivityIndicator color={colors.ref} />
            ) : (
              <Text style={styles.deleteAccountText}>アカウントを削除</Text>
            )}
          </Pressable>
          <Text style={styles.deleteAccountHint}>
            削除後は復元できません。ログインできない場合は{' '}
            <Text
              style={styles.deleteAccountLink}
              onPress={() => openLegalUrl(LEGAL_URLS.accountDelete)}
            >
              アカウント削除ページ
            </Text>
            から請求できます。
          </Text>
        </Section>
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
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 20,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.sub,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
  },
  center: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  usageHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 10,
  },
  usageLead: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.sub,
  },
  usageCost: {
    fontSize: 30,
    fontWeight: '600',
    color: colors.ink,
  },
  usageLimit: {
    fontSize: 15,
    color: colors.sub,
  },
  progressTrack: {
    marginTop: 12,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.con,
  },
  breakdown: {
    marginTop: 16,
    gap: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  breakdownLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
  },
  breakdownValue: {
    fontSize: 15,
    color: colors.sub,
  },
  planStatusTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 6,
  },
  lifetimeBox: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  lifetimeHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  lifetimeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  lifetimeTotal: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.sub,
  },
  lifetimeHint: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: colors.hint,
  },
  planCta: {
    marginTop: 14,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  planCtaText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '700',
  },
  upgradeBlock: {
    marginTop: 14,
    gap: 10,
  },
  upgradeHint: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.sub,
  },
  billingModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  emptyHint: {
    marginTop: 12,
    fontSize: 15,
    color: colors.hint,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowLabel: {
    fontSize: 17,
    color: colors.ink,
  },
  rowDescription: {
    fontSize: 15,
    color: colors.sub,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 14,
  },
  platformHint: {
    marginTop: 12,
    fontSize: 14,
    color: colors.hint,
    lineHeight: 17,
  },
  signOutButton: {
    paddingVertical: 4,
  },
  signOutText: {
    fontSize: 17,
    color: colors.ref,
  },
  deleteAccountButton: {
    marginTop: 16,
    paddingVertical: 4,
  },
  deleteAccountText: {
    fontSize: 17,
    color: colors.ref,
    fontWeight: '600',
  },
  deleteAccountHint: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: colors.sub,
  },
  deleteAccountLink: {
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  actionRow: {
    paddingVertical: 4,
  },
  providerList: {
    gap: 4,
    marginBottom: 10,
  },
  providerItem: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
  },
  linkError: {
    color: colors.ref,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  passwordEmail: {
    color: colors.sub,
    fontSize: 14,
    marginBottom: 8,
    marginTop: 10,
  },
  passwordInputShell: {
    backgroundColor: colors.input,
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  passwordInput: {
    color: colors.ink,
    fontSize: 16,
    paddingVertical: 12,
  },
  passwordOk: {
    color: colors.con,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  passwordSaveBtn: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 10,
    minHeight: 36,
    minWidth: 140,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  passwordSaveText: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '600',
  },
  devLink: {
    paddingVertical: 4,
    marginTop: 4,
  },
  devLinkText: {
    fontSize: 17,
    color: colors.exp,
  },
  appearanceLead: {
    fontSize: 15,
    color: colors.sub,
    lineHeight: 20,
    marginBottom: 12,
  },
  choiceLabel: {
    color: colors.sub,
    fontSize: 13,
    marginBottom: 8,
    marginTop: 4,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  choiceChip: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  choiceChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  choiceChipText: {
    color: colors.ink,
    fontSize: 14,
  },
  choiceChipTextActive: {
    color: colors.onAccent,
    fontWeight: '600',
  },
  appearanceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  appearanceChip: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.input,
    borderRadius: 10,
    paddingVertical: 10,
  },
  appearanceChipOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  appearanceChipDisabled: {
    opacity: 0.6,
  },
  appearanceChipText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.sub,
  },
  appearanceChipTextOn: {
    color: colors.onAccent,
  },
  pressed: {
    opacity: 0.7,
  },
});
}
