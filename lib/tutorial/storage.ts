import AsyncStorage from '@react-native-async-storage/async-storage';

export type TutorialSceneId =
  | 'home0'
  | 'capture'
  | 'thread1'
  | 'shelfHint'
  | 'explore0'
  | 'exploreReady'
  | 'exploreDone'
  | 'reviewReady';

const keyFor = (id: TutorialSceneId) => `kotoi_tutorial_seen_${id}`;

export async function isTutorialSeen(id: TutorialSceneId): Promise<boolean> {
  const value = await AsyncStorage.getItem(keyFor(id));
  return value === '1';
}

export async function markTutorialSeen(id: TutorialSceneId): Promise<void> {
  await AsyncStorage.setItem(keyFor(id), '1');
}

export async function clearTutorialSeen(id: TutorialSceneId): Promise<void> {
  await AsyncStorage.removeItem(keyFor(id));
}

const FIRST_EXPLORATION_ASSIGN_KEY = 'kotoi_exploration_first_assign_pressed';

export async function clearAllTutorials(): Promise<void> {
  const ids: TutorialSceneId[] = [
    'home0',
    'capture',
    'thread1',
    'shelfHint',
    'explore0',
    'exploreReady',
    'exploreDone',
    'reviewReady',
  ];
  await Promise.all([
    ...ids.map((id) => AsyncStorage.removeItem(keyFor(id))),
    AsyncStorage.removeItem(FIRST_EXPLORATION_ASSIGN_KEY),
  ]);
}

/** 探究0の初回CTAを一度押したか */
export async function hasPressedFirstExplorationAssign(): Promise<boolean> {
  const value = await AsyncStorage.getItem(FIRST_EXPLORATION_ASSIGN_KEY);
  return value === '1';
}

export async function markPressedFirstExplorationAssign(): Promise<void> {
  await AsyncStorage.setItem(FIRST_EXPLORATION_ASSIGN_KEY, '1');
}
