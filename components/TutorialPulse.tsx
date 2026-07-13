import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useColors } from '@/providers/ThemeProvider';

type Props = {
  active: boolean;
  /** タブアイコンなど、背後にリングを足して目立たせる */
  ring?: boolean;
  /** ボタンなど、拡大せず透明度だけ脈動 */
  fadeOnly?: boolean;
  /** 子の寄せ。ボタンは start、タブアイコンは center */
  align?: 'center' | 'start';
  children: ReactNode;
};

/** チュートリアル用の脈動。既存要素を包むだけ。 */
export function TutorialPulse({
  active,
  ring = false,
  fadeOnly = false,
  align = 'center',
  children,
}: Props) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (!active) {
      opacity.stopAnimation();
      scale.stopAnimation();
      ringOpacity.stopAnimation();
      opacity.setValue(1);
      scale.setValue(1);
      ringOpacity.setValue(0.55);
      return;
    }

    const fade = Animated.sequence([
      Animated.timing(opacity, {
        toValue: fadeOnly ? 0.55 : 0.4,
        duration: 700,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]);

    const grow = Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.18,
        duration: 700,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 700,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]);

    const ringFade = Animated.sequence([
      Animated.timing(ringOpacity, {
        toValue: 0.15,
        duration: 700,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(ringOpacity, {
        toValue: 0.7,
        duration: 700,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]);

    const animations = [fade];
    if (!fadeOnly) animations.push(grow);
    if (ring) animations.push(ringFade);

    const loop = Animated.loop(Animated.parallel(animations));
    loop.start();
    return () => {
      loop.stop();
      opacity.setValue(1);
      scale.setValue(1);
      ringOpacity.setValue(0.55);
    };
  }, [active, fadeOnly, ring, opacity, scale, ringOpacity]);

  if (!active) return <>{children}</>;

  return (
    <View style={[styles.wrap, align === 'start' && styles.wrapStart]}>
      {ring ? (
        <Animated.View
          style={[
            styles.ring,
            {
              borderColor: colors.lineStrong,
              opacity: ringOpacity,
              transform: [{ scale }],
            },
          ]}
        />
      ) : null}
      <Animated.View
        style={{
          opacity,
          transform: [{ scale: ring || fadeOnly ? 1 : scale }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrapStart: {
    alignItems: 'flex-start',
  },
  ring: {
    borderRadius: 18,
    borderWidth: 2.5,
    height: 36,
    position: 'absolute',
    width: 36,
  },
});
