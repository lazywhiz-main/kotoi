// MONDO design tokens — light: mock_thread / dark: mock_dark_app_v1

export type AppearancePreference = 'system' | 'light' | 'dark';
export type ColorSchemeName = 'light' | 'dark';

export type ColorPalette = {
  bg: string;
  ink: string;
  sub: string;
  hint: string;
  card: string;
  cardElevated: string;
  line: string;
  lineStrong: string;
  dig: string;
  digBg: string;
  con: string;
  conBg: string;
  ref: string;
  refBg: string;
  act: string;
  actBg: string;
  exp: string;
  expBg: string;
  you: string;
  youBg: string;
  accent: string;
  onAccent: string;
  tabBar: string;
  composer: string;
  input: string;
};

export const lightPalette: ColorPalette = {
  bg: '#f4f2ec',
  ink: '#26251f',
  sub: '#6b6960',
  hint: '#9a978c',
  card: '#ffffff',
  cardElevated: '#ffffff',
  line: '#e7e4da',
  lineStrong: '#b5b0a2',
  dig: '#534AB7',
  digBg: '#EEEDFE',
  con: '#0F6E56',
  conBg: '#E1F5EE',
  ref: '#993C1D',
  refBg: '#FAECE7',
  act: '#3B6D11',
  actBg: '#EAF3DE',
  exp: '#0C447C',
  expBg: '#E6F1FB',
  you: '#8a5a00',
  youBg: '#FAEEDA',
  accent: '#3a3630',
  onAccent: '#f7f5ef',
  tabBar: '#efece4',
  composer: '#ffffff',
  input: '#faf9f5',
};

export const darkPalette: ColorPalette = {
  bg: '#100f0d',
  ink: '#ece7dd',
  sub: '#9c9488',
  hint: '#8a8276',
  card: '#1c1815',
  cardElevated: '#221d18',
  line: '#2c2620',
  lineStrong: '#6a6256',
  dig: '#9a93f0',
  digBg: 'rgba(122,119,221,0.17)',
  con: '#66d8b1',
  conBg: 'rgba(29,158,117,0.17)',
  ref: '#f4ab8b',
  refBg: 'rgba(216,90,48,0.16)',
  act: '#abd873',
  actBg: 'rgba(99,153,34,0.17)',
  exp: '#93c4f5',
  expBg: 'rgba(55,138,221,0.17)',
  you: '#e3b665',
  youBg: 'rgba(227,182,101,0.12)',
  accent: '#ece7dd',
  onAccent: '#1c1815',
  tabBar: '#151210',
  composer: '#151210',
  input: '#211c17',
};

/** ログイン画面は常に深い水面 */
export const loginPalette: ColorPalette = {
  ...darkPalette,
  bg: '#100f0d',
  card: '#1c1815',
  input: '#211c17',
};

export const colors = lightPalette;

export function getQuestionColors(c: ColorPalette) {
  return {
    dig: { text: c.dig, bg: c.digBg },
    con: { text: c.con, bg: c.conBg },
    ref: { text: c.ref, bg: c.refBg },
    act: { text: c.act, bg: c.actBg },
    exp: { text: c.exp, bg: c.expBg },
  } as const;
}

export function getNoteTypeColors(c: ColorPalette) {
  return {
    learn: { text: c.exp, bg: c.expBg },
    seed: { text: c.you, bg: c.youBg },
    task: { text: c.act, bg: c.actBg },
    feeling: { text: c.ref, bg: c.refBg },
    ref: { text: c.sub, bg: c.cardElevated },
    video: { text: c.ref, bg: c.refBg },
  } as const;
}

export const questionColors = getQuestionColors(lightPalette);
export const noteTypeColors = getNoteTypeColors(lightPalette);
