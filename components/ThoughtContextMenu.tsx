import { useMemo } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';

export type ThoughtMenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ActionMenuProps = {
  visible: boolean;
  anchor: ThoughtMenuAnchor | null;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

type ConfirmProps = {
  visible: boolean;
  preview: string;
  onCancel: () => void;
  onConfirm: () => void;
};

const MENU_WIDTH = 156;
const ROW_HEIGHT = 44;
const SCREEN_PADDING = 16;

function useMenuPosition(anchor: ThoughtMenuAnchor | null, rowCount: number) {
  return useMemo(() => {
    if (!anchor) return null;

    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
    const menuHeight = rowCount * ROW_HEIGHT + 8;
    const left = Math.min(
      Math.max(SCREEN_PADDING, anchor.x + anchor.width - MENU_WIDTH),
      screenWidth - MENU_WIDTH - SCREEN_PADDING,
    );

    let top = anchor.y + anchor.height + 6;
    if (top + menuHeight > screenHeight - SCREEN_PADDING - 24) {
      top = anchor.y - menuHeight - 6;
    }

    return { left, top, width: MENU_WIDTH, height: menuHeight };
  }, [anchor, rowCount]);
}

export function ThoughtActionMenu({
  visible,
  anchor,
  canEdit,
  canDelete,
  onClose,
  onEdit,
  onDelete,
}: ActionMenuProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const rowCount = (canEdit ? 1 : 0) + (canDelete ? 1 : 0);
  const position = useMenuPosition(anchor, rowCount);

  if (!visible || !anchor || !position || rowCount === 0) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="メニューを閉じる" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View
          style={[
            styles.menu,
            { left: position.left, top: position.top, width: position.width },
          ]}
        >
          {canEdit ? (
            <Pressable
              onPress={() => {
                onClose();
                onEdit();
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <Text style={styles.menuLabel}>編集</Text>
            </Pressable>
          ) : null}
          {canEdit && canDelete ? <View style={styles.menuDivider} /> : null}
          {canDelete ? (
            <Pressable
              onPress={() => {
                onClose();
                onDelete();
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <Text style={[styles.menuLabel, styles.menuLabelDanger]}>削除</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export function ThoughtDeleteConfirm({
  visible,
  preview,
  onCancel,
  onConfirm,
}: ConfirmProps) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!visible) return null;

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={[styles.backdrop, styles.backdropCentered]}>
        <Pressable accessibilityLabel="削除をやめる" onPress={onCancel} style={StyleSheet.absoluteFill} />
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>一言を削除</Text>
          <Text style={styles.confirmBody}>「{preview}」を削除しますか？</Text>
          <View style={styles.confirmActions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [styles.confirmBtn, pressed && styles.confirmBtnPressed]}
            >
              <Text style={styles.confirmCancelText}>やめる</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.confirmBtn,
                styles.confirmDangerBtn,
                pressed && styles.confirmBtnPressed,
              ]}
            >
              <Text style={styles.confirmDangerText}>削除</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(38, 37, 31, 0.18)',
    flex: 1,
  },
  backdropCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  menu: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 13,
    borderWidth: 1,
    elevation: 8,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#26251f',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  menuRow: {
    alignItems: 'center',
    height: ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  menuRowPressed: {
    backgroundColor: colors.input,
  },
  menuDivider: {
    backgroundColor: colors.line,
    height: 1,
  },
  menuLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '500',
  },
  menuLabelDanger: {
    color: colors.ref,
  },
  confirmCard: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: 320,
    paddingHorizontal: 18,
    paddingVertical: 16,
    width: '100%',
  },
  confirmTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
  },
  confirmBody: {
    color: colors.sub,
    fontSize: 17,
    lineHeight: 24,
    marginBottom: 16,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  confirmBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  confirmBtnPressed: {
    opacity: 0.85,
  },
  confirmDangerBtn: {
    backgroundColor: colors.refBg,
  },
  confirmCancelText: {
    color: colors.sub,
    fontSize: 17,
    fontWeight: '600',
  },
  confirmDangerText: {
    color: colors.ref,
    fontSize: 17,
    fontWeight: '600',
  },
});
}
