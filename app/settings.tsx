import { Link, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, type ReactNode, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { clearAllTutorials } from '@/lib/tutorial/storage';
import { formatUsd, mergeUsageBreakdown } from '@/lib/usageLabels';
import { entitlementOf, type SubscriptionRow } from '@/lib/entitlements';
import {
  formatRenewalDate,
  isDevBillingStore,
  planDisplayName,
} from '@/lib/planDisplay';
import { type AppearancePreference, type ColorPalette } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useOpeningGate } from '@/providers/OpeningGateProvider';
import { useColors, useTheme } from '@/providers/ThemeProvider';

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
  const { settings, loading: settingsLoading, saving, error: settingsError, updateSetting } =
    useUserSettings(user?.id);
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
            disabled={saving}
          />
        </Section>

        <Section title="通知">
          <SettingRow
            label="調べる・深掘り・見取り図・探究の完了"
            description="エージェントや見取り図、問いの振り分けが終わったら知らせます"
            value={settings?.notify_agent_done ?? true}
            onValueChange={(next) => void updateSetting('notify_agent_done', next)}
            disabled={saving || settingsLoading}
          />
          <View style={styles.divider} />
          <SettingRow
            label="今週のふりかえり"
            description="ふりかえりができたら知らせます"
            value={settings?.notify_weekly_review ?? true}
            onValueChange={(next) => void updateSetting('notify_weekly_review', next)}
            disabled={saving || settingsLoading}
          />
          {Platform.OS === 'web' ? (
            <Text style={styles.platformHint}>プッシュ通知は実機アプリでのみ利用できます</Text>
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
