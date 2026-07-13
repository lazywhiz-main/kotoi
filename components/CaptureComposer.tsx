import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ErrorBanner } from '@/components/ErrorBanner';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { useCaptureNote } from '@/hooks/useCaptureNote';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { type ColorPalette } from '@/lib/theme';
import { useColors } from '@/providers/ThemeProvider';

type Props = {
  autoFocus?: boolean;
  emphasized?: boolean;
  onSubmitted?: () => void;
  onDismissWelcome?: () => void;
};

export function CaptureComposer({
  autoFocus = false,
  emphasized = false,
  onSubmitted,
  onDismissWelcome,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const { submit, submitting, error, clearError } = useCaptureNote();
  const { preview, loading: previewLoading, url } = useLinkPreview(text);

  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 450);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  const handleSubmit = async () => {
    const id = await submit(text);
    if (id) {
      setText('');
      clearError();
      onDismissWelcome?.();
      onSubmitted?.();
    }
  };

  return (
    <View style={[styles.wrap, emphasized && styles.wrapEmphasized]}>
      <Text style={styles.label}>{emphasized ? 'ここからはじめよう' : '放り込む'}</Text>
      <Text style={styles.subhint}>メモも、動画リンクも。</Text>
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          multiline
          placeholder="いま、何が気になってる？"
          placeholderTextColor={colors.hint}
          style={[styles.input, emphasized && styles.inputEmphasized]}
          value={text}
          onChangeText={(value) => {
            setText(value);
            if (error) clearError();
          }}
          onBlur={() => {
            if (emphasized && !text.trim()) onDismissWelcome?.();
          }}
        />
        <Pressable
          disabled={submitting || !text.trim()}
          onPress={() => void handleSubmit()}
          style={({ pressed }) => [
            styles.send,
            (pressed || submitting || !text.trim()) && styles.sendPressed,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onAccent} size="small" />
          ) : (
            <Text style={styles.sendIcon}>↑</Text>
          )}
        </Pressable>
      </View>
      {url ? (
        <LinkPreviewCard
          url={url}
          preview={preview}
          loading={previewLoading}
          isVideo={/(?:youtube\.com|youtu\.be)/i.test(url)}
          compact
        />
      ) : (
        <Text style={styles.footHint}>保存後、分類・要約・問いが裏で進みます。</Text>
      )}
      {error ? <ErrorBanner message={error} onDismiss={clearError} /> : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: colors.card,
      borderColor: colors.line,
      borderRadius: 16,
      borderWidth: 1,
      marginBottom: 16,
      padding: 14,
    },
    wrapEmphasized: {
      borderColor: colors.lineStrong,
      borderWidth: 2,
    },
    label: {
      color: colors.sub,
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
    },
    subhint: {
      color: colors.hint,
      fontSize: 15,
      lineHeight: 20,
      marginBottom: 8,
    },
    inputRow: {
      alignItems: 'flex-end',
      flexDirection: 'row',
      gap: 8,
    },
    input: {
      backgroundColor: colors.input,
      borderColor: colors.line,
      borderRadius: 14,
      borderWidth: 1,
      color: colors.ink,
      flex: 1,
      fontSize: 17,
      lineHeight: 24,
      maxHeight: 120,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 10,
      textAlignVertical: 'top',
    },
    inputEmphasized: {
      borderColor: colors.lineStrong,
      borderRadius: 22,
      borderWidth: 1.5,
    },
    send: {
      alignItems: 'center',
      backgroundColor: colors.accent,
      borderRadius: 20,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    sendPressed: {
      opacity: 0.65,
    },
    sendIcon: {
      color: colors.onAccent,
      fontSize: 19,
      fontWeight: '600',
      lineHeight: 22,
    },
    footHint: {
      color: colors.hint,
      fontSize: 15,
      lineHeight: 20,
      marginTop: 8,
    },
  });
}
