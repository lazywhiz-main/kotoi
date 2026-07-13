import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';
import { useMemo } from 'react';

type Props = {
  message: string;
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  actionBusy?: boolean;
};

export function ErrorBanner({
  message,
  onDismiss,
  actionLabel,
  onAction,
  actionBusy,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{message}</Text>
      {onAction && actionLabel ? (
        <Pressable
          disabled={actionBusy}
          hitSlop={8}
          onPress={onAction}
          style={styles.action}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          {actionBusy ? (
            <ActivityIndicator color={colors.ref} size="small" />
          ) : (
            <Text style={styles.actionText}>{actionLabel}</Text>
          )}
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable hitSlop={8} onPress={onDismiss} style={styles.dismiss}>
          <Text style={styles.dismissText}>閉じる</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  box: {
    backgroundColor: colors.refBg,
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  text: {
    color: colors.ref,
    fontSize: 15,
    lineHeight: 22,
  },
  action: {
    alignSelf: 'flex-start',
    marginTop: 8,
    minHeight: 20,
    justifyContent: 'center',
  },
  actionText: {
    color: colors.ref,
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  dismiss: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  dismissText: {
    color: colors.ref,
    fontSize: 14,
    fontWeight: '600',
  },
});
}
