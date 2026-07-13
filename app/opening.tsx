import { Stack } from 'expo-router';

import { OpeningExperience } from '@/components/opening/OpeningExperience';

export default function OpeningScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <OpeningExperience />
    </>
  );
}
