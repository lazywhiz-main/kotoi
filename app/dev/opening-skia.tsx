import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OpeningRippleSkiaSample } from '@/components/opening/OpeningRippleSkiaSample';
import { spawnParticles, type OpeningThemeId } from '@/lib/opening/rippleSpec';
import { colors } from '@/lib/theme';

const SKIA_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

type Limitation = {
  title: string;
  mock: string;
  skia: string;
  verdict: 'ok' | 'partial' | 'hard';
};

const LIMITATIONS: Limitation[] = [
  {
    title: '放射グラデ背景・ビネット',
    mock: '2層の radial gradient',
    skia: 'RadialGradient で再現',
    verdict: 'ok',
  },
  {
    title: 'コースティクス（水面の揺らぎ線）',
    mock: 'sin 波の path stroke',
    skia: 'Path + stroke で再現',
    verdict: 'ok',
  },
  {
    title: '水滴・飛沫・屈折波紋',
    mock: 'ellipse + particles + wobble circle',
    skia: 'Ellipse / Circle / Path で再現',
    verdict: 'ok',
  },
  {
    title: '可変幅ベジェ枝',
    mock: '30分割の lineCap=round',
    skia: 'Line セグメント列で再現（本番は Path の trim かシェーダ検討）',
    verdict: 'partial',
  },
  {
    title: '先端グロー（shadowBlur）',
    mock: 'ctx.shadowBlur',
    skia: 'BlurMask + Circle。テキストグローは弱い',
    verdict: 'partial',
  },
  {
    title: 'グレイン（overlay ブレンド）',
    mock: 'createPattern + globalCompositeOperation=overlay',
    skia: 'overlay 相当のブレンドが Canvas2D ほど直感的でない。点群近似',
    verdict: 'hard',
  },
  {
    title: 'MONDO 字間・日本語ラベル',
    mock: 'measureText + drawSpaced',
    skia: 'Text + 手動字間。フォントは matchFont',
    verdict: 'partial',
  },
  {
    title: 'pill の影（offsetY）',
    mock: 'shadowOffsetY: 6',
    skia: 'BlurMask はオフセット影を直接持たない。y をずらして近似',
    verdict: 'partial',
  },
  {
    title: 'Web',
    mock: 'Canvas2D',
    skia: 'ネイティブ専用（このサンプルは iOS/Android のみ）',
    verdict: 'hard',
  },
];

function verdictLabel(verdict: Limitation['verdict']) {
  if (verdict === 'ok') return '◎';
  if (verdict === 'partial') return '△';
  return '×';
}

export default function OpeningSkiaDevScreen() {
  const router = useRouter();
  const [themeId, setThemeId] = useState<OpeningThemeId>('dark');
  const [speed, setSpeed] = useState(1);
  const [replayKey, setReplayKey] = useState(0);
  const [t, setT] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const particles = useMemo(() => spawnParticles(), [replayKey]);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const replay = useCallback((nextSpeed = speed) => {
    setSpeed(nextSpeed);
    setReplayKey((k) => k + 1);
    setT(0);
    startRef.current = null;
  }, [speed]);

  useEffect(() => {
    const frame = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      setT(((now - startRef.current) / 1000) * speed);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [replayKey, speed]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Skia オープニング検証',
          headerBackTitle: '設定',
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.lead}>
          mock_opening_ripple_v2.html の Skia 移植サンプルです。本番導線には未接続です。
        </Text>

        <View style={styles.phone} onLayout={onLayout}>
          <View style={[styles.screen, themeId === 'dark' ? styles.screenDark : styles.screenLight]}>
            {SKIA_SUPPORTED && size.width > 0 && size.height > 0 ? (
              <OpeningRippleSkiaSample
                width={size.width}
                height={size.height}
                themeId={themeId}
                t={t}
                particles={particles}
              />
            ) : (
              <View style={styles.fallback}>
                <Text style={styles.fallbackText}>
                  {SKIA_SUPPORTED
                    ? 'レイアウト計測中…'
                    : 'Skia サンプルは iOS / Android 実機・シミュレータでのみ表示できます。'}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable onPress={() => replay(1)} style={styles.chip}>
            <Text style={styles.chipText}>↻ リプレイ</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setThemeId('dark');
              replay(1);
            }}
            style={[styles.chip, themeId === 'dark' && styles.chipOn]}
          >
            <Text style={[styles.chipText, themeId === 'dark' && styles.chipTextOn]}>深い水面</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setThemeId('light');
              replay(1);
            }}
            style={[styles.chip, themeId === 'light' && styles.chipOn]}
          >
            <Text style={[styles.chipText, themeId === 'light' && styles.chipTextOn]}>淡い水面</Text>
          </Pressable>
          <Pressable onPress={() => replay(0.5)} style={styles.chip}>
            <Text style={styles.chipText}>ゆっくり</Text>
          </Pressable>
        </View>

        <Text style={styles.time}>t = {t.toFixed(2)}s · speed ×{speed}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Skia の限界メモ（このサンプル時点）</Text>
          {LIMITATIONS.map((item) => (
            <View key={item.title} style={styles.limitRow}>
              <Text style={styles.limitMark}>{verdictLabel(item.verdict)}</Text>
              <View style={styles.limitBody}>
                <Text style={styles.limitTitle}>{item.title}</Text>
                <Text style={styles.limitDetail}>
                  モック: {item.mock}
                  {'\n'}
                  Skia: {item.skia}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {__DEV__ ? (
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>設定に戻る</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#e9e6de',
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.sub,
  },
  phone: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 360,
    aspectRatio: 360 / 700,
    backgroundColor: '#000',
    borderRadius: 44,
    padding: 11,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  screen: {
    flex: 1,
    borderRadius: 33,
    overflow: 'hidden',
  },
  screenDark: {
    backgroundColor: '#100f0d',
  },
  screenLight: {
    backgroundColor: '#eae7df',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  fallbackText: {
    color: colors.sub,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#d9d5c9',
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  chipOn: {
    backgroundColor: '#3a3630',
    borderColor: '#3a3630',
  },
  chipText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#3d3b34',
  },
  chipTextOn: {
    color: '#f7f5ef',
  },
  time: {
    textAlign: 'center',
    fontSize: 14,
    color: colors.hint,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  limitRow: {
    flexDirection: 'row',
    gap: 10,
  },
  limitMark: {
    width: 18,
    fontSize: 15,
    color: colors.ink,
  },
  limitBody: {
    flex: 1,
    gap: 2,
  },
  limitTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  limitDetail: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.sub,
  },
  back: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  backText: {
    fontSize: 15,
    color: colors.sub,
  },
});
