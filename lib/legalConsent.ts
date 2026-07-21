import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'kotoi.legal_agreed_v1';

export async function getLegalAgreed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setLegalAgreed(value: boolean): Promise<void> {
  try {
    if (value) await AsyncStorage.setItem(KEY, '1');
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
