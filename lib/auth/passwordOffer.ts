import AsyncStorage from '@react-native-async-storage/async-storage';

const DONE_KEY = 'mondo_password_offer_done';
const PENDING_KEY = 'mondo_password_offer_pending';

export async function isPasswordOfferDone(): Promise<boolean> {
  return (await AsyncStorage.getItem(DONE_KEY)) === '1';
}

export async function isPasswordOfferPending(): Promise<boolean> {
  return (await AsyncStorage.getItem(PENDING_KEY)) === '1';
}

/** OTP 検証前に呼び、タブ遷移を止める。失敗時は clearPasswordOfferPending */
export async function queuePasswordOffer(): Promise<boolean> {
  if (await isPasswordOfferDone()) return false;
  await AsyncStorage.setItem(PENDING_KEY, '1');
  return true;
}

export async function clearPasswordOfferPending(): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, '0');
}

export async function completePasswordOffer(): Promise<void> {
  await AsyncStorage.multiSet([
    [DONE_KEY, '1'],
    [PENDING_KEY, '0'],
  ]);
}

export async function skipPasswordOffer(): Promise<void> {
  await completePasswordOffer();
}
