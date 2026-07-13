import { useCallback, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OpeningRippleSkiaSample } from '@/components/opening/OpeningRippleSkiaSample';
import { useOpeningAnimation } from '@/hooks/useOpeningAnimation';
import { OPENING_TIMING } from '@/lib/opening/rippleSpec';
import { useOpeningGate } from '@/providers/OpeningGateProvider';

const SKIA_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

type Props = {
  onFinished?: () => void;
};

export function OpeningExperience({ onFinished }: Props) {
  const { markCompleted } = useOpeningGate();
  const { t, particles } = useOpeningAnimation(1, 0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [finishing, setFinishing] = useState(false);

  const canSkip = t >= 2;
  const canContinue = t >= OPENING_TIMING.capStart - 0.2;

  const finish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    await markCompleted();
    onFinished?.();
  }, [finishing, markCompleted, onFinished]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.flex}>
        <Pressable
          style={styles.tapArea}
          onPress={() => {
            if (canContinue) void finish();
          }}
          disabled={!canContinue || finishing}
        >
          <View style={styles.canvas} onLayout={onLayout}>
            {SKIA_SUPPORTED && size.width > 0 && size.height > 0 ? (
              <OpeningRippleSkiaSample
                width={size.width}
                height={size.height}
                themeId="dark"
                t={t}
                particles={particles}
              />
            ) : (
              <View style={styles.webFallback}>
                <Text style={styles.webBrand}>KOTOI</Text>
                <Text style={styles.webTag}>問いが増える</Text>
              </View>
            )}
          </View>
        </Pressable>

        {canSkip ? (
          <Pressable
            onPress={() => void finish()}
            disabled={finishing}
            style={({ pressed }) => [styles.skip, pressed && styles.skipPressed]}
          >
            <Text style={styles.skipText}>{canContinue ? 'はじめる' : 'スキップ'}</Text>
          </Pressable>
        ) : null}

        {canContinue && !finishing ? (
          <Text style={styles.hint} pointerEvents="none">
            タップしてはじめる
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#100f0d',
  },
  flex: {
    flex: 1,
  },
  tapArea: {
    flex: 1,
  },
  canvas: {
    flex: 1,
  },
  webFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  webBrand: {
    color: '#f4f2ec',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 6,
  },
  webTag: {
    color: '#b0a898',
    fontSize: 15,
  },
  skip: {
    position: 'absolute',
    top: 12,
    right: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(128,120,108,0.55)',
    backgroundColor: 'rgba(28,24,21,0.72)',
    zIndex: 2,
  },
  skipPressed: {
    opacity: 0.75,
  },
  skipText: {
    color: '#d8d0c4',
    fontSize: 15,
    fontWeight: '500',
  },
  hint: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    color: 'rgba(150,143,131,0.85)',
    fontSize: 14,
    zIndex: 2,
  },
});
