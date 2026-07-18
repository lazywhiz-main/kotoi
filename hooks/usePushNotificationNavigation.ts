import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export function usePushNotificationNavigation(enabled: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const explorationId = data?.exploration_id;
      if (typeof explorationId === 'string') {
        router.push(`/exploration/${explorationId}`);
        return;
      }
      const noteId = data?.note_id;
      if (typeof noteId === 'string') {
        router.push(`/note/${noteId}`);
        return;
      }
      if (data?.screen === 'explorations') {
        router.push('/(tabs)/explorations');
        return;
      }
      if (data?.screen === 'shelf') {
        router.push('/(tabs)/shelf');
      }
    });

    return () => subscription.remove();
  }, [enabled, router]);
}
