import AsyncStorage from '@react-native-async-storage/async-storage';

export type AuthMethod = 'apple' | 'google' | 'email_otp' | 'email_password';

const KEY = 'kotoi_last_auth_method';

export const AUTH_METHOD_LABEL: Record<AuthMethod, string> = {
  apple: 'Apple',
  google: 'Google',
  email_otp: 'メール（確認コード）',
  email_password: 'メール（パスワード）',
};

export async function getLastAuthMethod(): Promise<AuthMethod | null> {
  const value = await AsyncStorage.getItem(KEY);
  if (
    value === 'apple' ||
    value === 'google' ||
    value === 'email_otp' ||
    value === 'email_password'
  ) {
    return value;
  }
  return null;
}

export async function setLastAuthMethod(method: AuthMethod): Promise<void> {
  await AsyncStorage.setItem(KEY, method);
}
