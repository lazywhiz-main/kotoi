import AsyncStorage from '@react-native-async-storage/async-storage';

const OPENING_COMPLETED_KEY = 'kotoi_opening_completed';

export async function isOpeningCompleted(): Promise<boolean> {
  const value = await AsyncStorage.getItem(OPENING_COMPLETED_KEY);
  return value === '1';
}

export async function setOpeningCompleted(): Promise<void> {
  await AsyncStorage.setItem(OPENING_COMPLETED_KEY, '1');
}

export async function clearOpeningCompleted(): Promise<void> {
  await AsyncStorage.removeItem(OPENING_COMPLETED_KEY);
}
