/** mock_opening_ripple_v2.html から移植したタイミング・テーマ・描画用ユーティリティ */

export type OpeningThemeId = 'dark' | 'light';

export type OpeningTheme = {
  outer: string;
  inner: string;
  vig: string;
  ripple: string;
  edge: string;
  drop: string;
  word: string;
  glow: string;
  tag: string;
  grain: string;
  grainA: number;
  pill: string;
  pillFill: string;
  pillFillA: number;
  ph: string;
  caret: string;
  hint: string;
  tips: Record<'dig' | 'con' | 'ref' | 'act' | 'exp', string>;
};

export const OPENING_THEMES: Record<OpeningThemeId, OpeningTheme> = {
  dark: {
    outer: '#100f0d',
    inner: '#1c1815',
    vig: 'rgba(74,66,52,0.45)',
    ripple: '202,190,168',
    edge: '248,240,226',
    drop: '248,240,226',
    word: '244,242,236',
    glow: '255,244,222',
    tag: '176,168,154',
    grain: '255,255,255',
    grainA: 0.022,
    pill: '128,120,108',
    pillFill: '255,255,255',
    pillFillA: 0.05,
    ph: '208,201,188',
    caret: '214,207,194',
    hint: '150,143,131',
    tips: {
      dig: '#9a93f0',
      con: '#66d8b1',
      ref: '#f4ab8b',
      act: '#abd873',
      exp: '#93c4f5',
    },
  },
  light: {
    outer: '#e7e3da',
    inner: '#f2efe8',
    vig: 'rgba(176,166,146,0.22)',
    ripple: '128,118,100',
    edge: '96,88,76',
    drop: '70,62,50',
    word: '38,37,31',
    glow: '255,255,255',
    tag: '120,116,108',
    grain: '40,36,28',
    grainA: 0.03,
    pill: '150,145,135',
    pillFill: '0,0,0',
    pillFillA: 0.03,
    ph: '112,108,100',
    caret: '82,78,70',
    hint: '140,135,126',
    tips: {
      dig: '#6f66d0',
      con: '#2fa77f',
      ref: '#c9663a',
      act: '#5f8f2f',
      exp: '#4f7fc0',
    },
  },
};

export const OPENING_BRANCHES = [
  { a: -90, key: 'dig' as const, lab: '深掘り', w: 0.0 },
  { a: -20, key: 'con' as const, lab: '接続', w: 8 },
  { a: 52, key: 'ref' as const, lab: '反証', w: -7 },
  { a: 128, key: 'act' as const, lab: '行動', w: 7 },
  { a: 200, key: 'exp' as const, lab: '拡張', w: -9 },
];

export const OPENING_TIMING = {
  dropStart: 0.6,
  impact: 1.5,
  brStart: 1.78,
  brDur: 1.5,
  brStag: 0.14,
  wordStart: 3.3,
  wordDur: 0.9,
  capStart: 4.7,
  capDur: 1.0,
  end: 6.0,
};

export type Point = { x: number; y: number };

export type Particle = {
  a: number;
  sp: number;
  r: number;
  life: number;
};

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

export const easeInOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export const rgba = (c: string, a: number) => `rgba(${c},${a})`;

export function hexA(hex: string, a: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function bez(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  return {
    x: uu * u * p0.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + tt * t * p3.y,
  };
}

export function spawnParticles(): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < 16; i += 1) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    particles.push({
      a,
      sp: 60 + Math.random() * 90,
      r: 0.8 + Math.random() * 1.6,
      life: 0.5 + Math.random() * 0.35,
    });
  }
  return particles;
}

export function computeCapFade(t: number): number {
  return 1 - easeOut(clamp((t - OPENING_TIMING.capStart) / (OPENING_TIMING.capDur * 0.8), 0, 1));
}

export function computeBranchFade(t: number, capFade: number): number {
  return 0.25 + 0.75 * capFade;
}
