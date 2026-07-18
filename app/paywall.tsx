import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { invokeFunction } from '@/lib/api';
import {
  isPurchasesAvailable,
  purchasePlan,
  restorePurchases,
  waitForSubscribed,
} from '@/lib/purchases';
import { type ColorPalette, loginPalette } from '@/lib/theme';
import { useSubscription } from '@/hooks/useSubscription';

const c = loginPalette;

type PlanChoice = 'annual' | 'monthly';

export default function PaywallScreen() {
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { refresh, subscription } = useSubscription();
  const [plan, setPlan] = useState<PlanChoice>('annual');
  const [busy, setBusy] = useState(false);
  const styles = useMemo(() => createStyles(c), []);

  const isSafety = reason === 'safety' || reason === 'read_only';
  const lead = isSafety
    ? 'いまは閲覧のみです。これまでの記録はそのまま残っています。続きを書くときは、ここから。'
    : '最初の見取り図は、お渡ししました。次の1枚から、続きを。';

  const finishAfterSubscribe = async () => {
    const ok = await waitForSubscribed(async () => {
      const row = await refresh();
      return row?.trial_state === 'subscribed';
    });
    if (ok) {
      Alert.alert('', '購読が始まりました。');
      handleLater();
      return;
    }
    Alert.alert(
      '',
      '購入は完了しています。反映まで少し時間がかかることがあります。設定のプラン表示を確認してください。',
    );
    handleLater();
  };

  const handleSubscribe = async () => {
    if (!isPurchasesAvailable()) {
      Alert.alert(
        '',
        'ストア課金の接続は準備中です。年払い ¥15,000（推奨）／月払い ¥1,800。',
      );
      return;
    }

    setBusy(true);
    try {
      const result = await purchasePlan(plan);
      if (!result.ok) {
        if (result.cancelled) return;
        Alert.alert('', result.message);
        return;
      }
      await finishAfterSubscribe();
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!isPurchasesAvailable()) {
      Alert.alert('', '復元できる環境ではありません。');
      return;
    }
    setBusy(true);
    try {
      const result = await restorePurchases();
      if (!result.ok) {
        Alert.alert('', result.message);
        return;
      }
      await finishAfterSubscribe();
    } finally {
      setBusy(false);
    }
  };

  const handleLater = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/explorations');
  };

  const handleDevSubscribe = async () => {
    setBusy(true);
    try {
      await invokeFunction('trial-dev-override', {
        action: 'subscribe',
        plan,
      });
      await refresh();
      Alert.alert('', '開発用に購読状態にしました。');
      handleLater();
    } catch (err) {
      const message = err instanceof Error ? err.message : '失敗しました';
      Alert.alert('', message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>KOTOI</Text>
        <Text style={styles.title}>続きは、KOTOIと一緒に</Text>
        <Text style={styles.lead}>{lead}</Text>
        <Text style={styles.frame}>月に、本1冊分。</Text>

        <View style={styles.planRow}>
          <PlanCard
            label="年払い"
            price="¥15,000 / 年"
            hint="推奨 · 月あたり ¥1,250"
            selected={plan === 'annual'}
            onPress={() => setPlan('annual')}
          />
          <PlanCard
            label="月払い"
            price="¥1,800 / 月"
            hint=""
            selected={plan === 'monthly'}
            onPress={() => setPlan('monthly')}
          />
        </View>

        <Pressable
          disabled={busy}
          onPress={() => void handleSubscribe()}
          style={({ pressed }) => [
            styles.primary,
            (pressed || busy) && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={c.onAccent} />
          ) : (
            <Text style={styles.primaryText}>
              {plan === 'annual' ? '年払いで続ける' : '月払いで続ける'}
            </Text>
          )}
        </Pressable>

        <Pressable
          disabled={busy}
          onPress={() => void handleRestore()}
          style={styles.restore}
        >
          <Text style={styles.restoreText}>購入を復元</Text>
        </Pressable>

        <Pressable disabled={busy} onPress={handleLater} style={styles.later}>
          <Text style={styles.laterText}>あとで</Text>
        </Pressable>

        {__DEV__ ? (
          <Pressable
            disabled={busy}
            onPress={() => void handleDevSubscribe()}
            style={styles.dev}
          >
            <Text style={styles.devText}>開発用: 購読状態にする</Text>
          </Pressable>
        ) : null}

        {__DEV__ && subscription ? (
          <Text style={styles.devMeta}>trial: {subscription.trial_state}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanCard({
  label,
  price,
  hint,
  selected,
  onPress,
}: {
  label: string;
  price: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useMemo(() => createStyles(c), []);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.planCard, selected && styles.planCardOn]}
    >
      <Text style={[styles.planLabel, selected && styles.planLabelOn]}>{label}</Text>
      <Text style={[styles.planPrice, selected && styles.planLabelOn]}>{price}</Text>
      {hint ? (
        <Text style={[styles.planHint, selected && styles.planHintOn]}>{hint}</Text>
      ) : null}
    </Pressable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    container: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 36,
    },
    brand: {
      color: colors.ink,
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: 4,
      marginBottom: 20,
      textAlign: 'center',
    },
    title: {
      color: colors.ink,
      fontSize: 24,
      fontWeight: '700',
      lineHeight: 34,
      marginBottom: 12,
      textAlign: 'center',
    },
    lead: {
      color: colors.sub,
      fontSize: 16,
      lineHeight: 24,
      marginBottom: 10,
      textAlign: 'center',
    },
    frame: {
      color: colors.hint,
      fontSize: 14,
      marginBottom: 28,
      textAlign: 'center',
    },
    planRow: { gap: 10, marginBottom: 20 },
    planCard: {
      backgroundColor: colors.card,
      borderColor: colors.lineStrong,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    planCardOn: {
      borderColor: colors.accent,
      borderWidth: 2,
    },
    planLabel: { color: colors.sub, fontSize: 13, fontWeight: '600', marginBottom: 4 },
    planLabelOn: { color: colors.ink },
    planPrice: { color: colors.ink, fontSize: 18, fontWeight: '700' },
    planHint: { color: colors.hint, fontSize: 13, marginTop: 4 },
    planHintOn: { color: colors.con },
    primary: {
      alignItems: 'center',
      backgroundColor: colors.accent,
      borderRadius: 26,
      paddingVertical: 15,
      minHeight: 52,
      justifyContent: 'center',
    },
    primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: '600' },
    restore: { alignItems: 'center', marginTop: 14, paddingVertical: 8 },
    restoreText: { color: colors.sub, fontSize: 14 },
    later: { alignItems: 'center', marginTop: 8, paddingVertical: 10 },
    laterText: { color: colors.sub, fontSize: 15 },
    pressed: { opacity: 0.75 },
    dev: { alignItems: 'center', marginTop: 28 },
    devText: { color: colors.hint, fontSize: 13 },
    devMeta: {
      color: colors.hint,
      fontSize: 12,
      marginTop: 8,
      textAlign: 'center',
    },
  });
}
