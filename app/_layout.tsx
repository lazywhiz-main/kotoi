import { Stack, Redirect, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { usePushNotificationNavigation } from '@/hooks/usePushNotificationNavigation';
import { OpeningGateProvider, useOpeningGate } from '@/providers/OpeningGateProvider';
import { ThemeProvider, useColors, useTheme } from '@/providers/ThemeProvider';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { session, loading, configured, passwordOfferPending } = useAuth();
  const { completed: openingCompleted, loading: openingLoading } = useOpeningGate();
  const colors = useColors();
  const { scheme } = useTheme();
  const segments = useSegments();

  usePushNotificationNavigation(!!session && openingCompleted === true && !passwordOfferPending);

  const onOpening = segments[0] === 'opening';
  const inAuthGroup = segments[0] === '(auth)';
  const inDev = segments[0] === 'dev';
  const onPasswordOffer = segments[0] === 'password-offer';

  const ready = !loading && !openingLoading;

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.bg }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (openingCompleted === false && !onOpening && !inDev) {
    return <Redirect href="/opening" />;
  }

  if (openingCompleted === true && onOpening) {
    if (!configured || !session) {
      return <Redirect href="/(auth)/login" />;
    }
    if (passwordOfferPending) {
      return <Redirect href="/password-offer" />;
    }
    return <Redirect href="/(tabs)" />;
  }

  if (openingCompleted === true) {
    if (!configured || !session) {
      if (!inAuthGroup && !inDev) {
        return <Redirect href="/(auth)/login" />;
      }
    } else if (passwordOfferPending) {
      if (!onPasswordOffer) {
        return <Redirect href="/password-offer" />;
      }
    } else if (onPasswordOffer) {
      return <Redirect href="/(tabs)" />;
    } else if (inAuthGroup) {
      return <Redirect href="/(tabs)" />;
    }
  }

  return (
    <>
      <StatusBar style={onOpening || scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="opening" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="password-offer" options={{ headerShown: false }} />
        <Stack.Screen
          name="paywall"
          options={{ title: '続ける', presentation: 'modal', headerBackTitle: '閉じる' }}
        />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'ホーム' }} />
        <Stack.Screen
          name="note/[id]"
          options={{ title: '育つスレッド', headerBackTitle: 'ホーム' }}
        />
        <Stack.Screen
          name="note/transcript/[id]"
          options={{ title: '文字起こし', headerBackTitle: '育つスレッド' }}
        />
        <Stack.Screen name="exploration/[id]" options={{ title: '問いの地図', headerBackTitle: '探究' }} />
        <Stack.Screen name="settings" options={{ title: '設定', headerBackTitle: 'ホーム' }} />
        <Stack.Screen
          name="dev/opening-skia"
          options={{ title: 'Skia オープニング検証', headerBackTitle: '設定' }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <AuthProvider>
        <OpeningGateProvider>
          <ThemeProvider>
            <RootNavigator />
          </ThemeProvider>
        </OpeningGateProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
