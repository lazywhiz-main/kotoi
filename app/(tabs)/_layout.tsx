import { useRef } from 'react';
import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';

import { TutorialPulse } from '@/components/TutorialPulse';
import { useOpenQuestionCount } from '@/hooks/useOpenQuestionCount';
import { useTutorialScene } from '@/hooks/useTutorialScene';
import { useAuth } from '@/providers/AuthProvider';
import { useColors } from '@/providers/ThemeProvider';

export default function TabLayout() {
  const colors = useColors();
  const { user } = useAuth();
  const { count: openQuestionCount } = useOpenQuestionCount(user?.id);
  const { visible: shelfHintVisible, markSeen: markShelfHintSeen } = useTutorialScene('shelfHint');
  const pulseShelf = shelfHintVisible && openQuestionCount > 0;

  const pulseRef = useRef(pulseShelf);
  pulseRef.current = pulseShelf;
  const markShelfHintRef = useRef(markShelfHintSeen);
  markShelfHintRef.current = markShelfHintSeen;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.hint,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.line,
        },
        headerStyle: {
          backgroundColor: colors.bg,
        },
        headerTitleStyle: {
          color: colors.ink,
          fontWeight: '600',
          fontSize: 19,
        },
        tabBarLabelStyle: {
          fontSize: 15,
        },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'house', android: 'home', web: 'home' }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="shelf"
        listeners={{
          focus: () => {
            if (pulseRef.current) void markShelfHintRef.current();
          },
        }}
        options={{
          title: '問いの棚',
          tabBarIcon: ({ color, focused }) => {
            const tint = pulseShelf && !focused ? colors.ink : color;
            return (
              <TutorialPulse active={pulseShelf && !focused} ring>
                <SymbolView
                  name={{ ios: 'books.vertical', android: 'menu_book', web: 'menu_book' }}
                  tintColor={tint}
                  size={24}
                />
              </TutorialPulse>
            );
          },
        }}
      />
      <Tabs.Screen
        name="explorations"
        options={{
          title: '探究',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'circle.grid.cross', android: 'hub', web: 'hub' }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: 'ふりかえり',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}
