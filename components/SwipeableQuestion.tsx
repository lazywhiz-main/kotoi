import { ReactNode, useRef, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';

type Props = {
  children: ReactNode;
  actionLabel: string;
  actionColor?: string;
  onAction: () => void;
  disabled?: boolean;
};

export function SwipeableQuestion({
  children,
  actionLabel,
  actionColor = '#8a8577',
  onAction,
  disabled,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const swipeRef = useRef<Swipeable>(null);

  if (disabled) {
    return <View style={styles.wrap}>{children}</View>;
  }

  const renderAction = () => (
    <Pressable
      onPress={() => {
        swipeRef.current?.close();
        onAction();
      }}
      style={[styles.action, { backgroundColor: actionColor }]}
    >
      <Text style={styles.actionText}>{actionLabel}</Text>
    </Pressable>
  );

  return (
    <Swipeable
      ref={swipeRef}
      overshootRight={false}
      renderRightActions={renderAction}
      onSwipeableOpen={(direction) => {
        if (direction === 'left') {
          swipeRef.current?.close();
          onAction();
        }
      }}
    >
      <View style={styles.wrap}>{children}</View>
    </Swipeable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  wrap: {
    backgroundColor: colors.bg,
  },
  action: {
    alignItems: 'center',
    borderRadius: 13,
    justifyContent: 'center',
    marginBottom: 12,
    minWidth: 88,
    paddingHorizontal: 14,
  },
  actionText: {
    color: colors.input,
    fontSize: 15,
    fontWeight: '700',
  },
});
}
