import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';

type Props = {
  title: string;
  tip: string;
};

/**
 * ナビタイトル＋インフォ。タップでツールチップを表示する。
 */
export function HeaderTitleWithInfo({ title, tip }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<LayoutRectangle | null>(null);
  const iconRef = useRef<View>(null);

  const openTip = useCallback(() => {
    iconRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  }, []);

  const tipTop = anchor ? anchor.y + anchor.height + 8 : insets.top + 56;

  return (
    <>
      <View style={styles.row}>
        <Text style={styles.title}>{title}</Text>
        <View ref={iconRef} collapsable={false}>
          <Pressable
            accessibilityLabel={`${title}の説明`}
            accessibilityRole="button"
            hitSlop={10}
            onPress={openTip}
            style={({ pressed }) => [styles.infoBtn, pressed && styles.infoBtnPressed]}
          >
            <SymbolView
              name={{ ios: 'info.circle', android: 'info', web: 'info' }}
              tintColor={colors.hint}
              size={18}
            />
          </Pressable>
        </View>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        transparent
        visible={open}
      >
        <View style={styles.backdrop}>
          <Pressable
            accessibilityLabel="説明を閉じる"
            onPress={() => setOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View
            pointerEvents="box-none"
            style={[styles.tipWrap, { top: tipTop }]}
          >
            <View style={styles.tipBubble}>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
      maxWidth: '100%',
    },
    title: {
      color: colors.ink,
      fontSize: 19,
      fontWeight: '600',
    },
    infoBtn: {
      padding: 2,
    },
    infoBtnPressed: {
      opacity: 0.7,
    },
    backdrop: {
      flex: 1,
    },
    tipWrap: {
      left: 16,
      position: 'absolute',
      right: 16,
    },
    tipBubble: {
      alignSelf: 'flex-start',
      backgroundColor: colors.card,
      borderColor: colors.line,
      borderRadius: 12,
      borderWidth: 1,
      maxWidth: 320,
      paddingHorizontal: 14,
      paddingVertical: 12,
      // soft elevation without multi-layer shadow noise
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    tipText: {
      color: colors.sub,
      fontSize: 14,
      lineHeight: 21,
    },
  });
}
