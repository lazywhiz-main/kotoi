import {
  BlurMask,
  Canvas,
  Circle,
  Oval,
  Group,
  Line,
  Path,
  RadialGradient,
  Rect,
  RoundedRect,
  Skia,
  Text,
  matchFont,
  vec,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  OPENING_BRANCHES,
  OPENING_THEMES,
  OPENING_TIMING,
  bez,
  clamp,
  computeBranchFade,
  computeCapFade,
  easeInOut,
  easeOut,
  hexA,
  rgba,
  type OpeningThemeId,
  type Particle,
  type Point,
} from '@/lib/opening/rippleSpec';

type Props = {
  width: number;
  height: number;
  themeId: OpeningThemeId;
  t: number;
  particles: Particle[];
};

const T = OPENING_TIMING;

const labelFont = matchFont({
  fontFamily: Platform.select({
    ios: 'Hiragino Sans',
    android: 'sans-serif',
    default: 'system-ui',
  }),
  fontSize: 14,
  fontWeight: '500',
});

const wordFont = matchFont({
  fontFamily: Platform.select({
    ios: 'Helvetica Neue',
    android: 'sans-serif',
    default: 'system-ui',
  }),
  fontSize: 30,
  fontWeight: '700',
});

const tagFont = matchFont({
  fontFamily: Platform.select({
    ios: 'Hiragino Sans',
    android: 'sans-serif',
    default: 'system-ui',
  }),
  fontSize: 14,
  fontWeight: '400',
});

const captureFont = matchFont({
  fontFamily: Platform.select({
    ios: 'Hiragino Sans',
    android: 'sans-serif',
    default: 'system-ui',
  }),
  fontSize: 16,
  fontWeight: '400',
});

const hintFont = matchFont({
  fontFamily: Platform.select({
    ios: 'Hiragino Sans',
    android: 'sans-serif',
    default: 'system-ui',
  }),
  fontSize: 13,
  fontWeight: '400',
});

function makeWobbleRipplePath(cx: number, cy: number, rr: number, k: number, age: number): string {
  const path = Skia.Path.Make();
  for (let d = 0; d <= Math.PI * 2 + 0.05; d += 0.13) {
    const wob = 1 + Math.sin(d * 3 + k) * 0.012 + Math.sin(d * 7 - age * 2) * 0.008;
    const x = cx + Math.cos(d) * rr * wob;
    const y = cy + Math.sin(d) * rr * wob * 0.98;
    if (d === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.close();
  return path.toSVGString();
}

function makeCausticPath(y: number, t: number, i: number, width: number): string {
  const path = Skia.Path.Make();
  for (let x = 0; x <= width; x += 7) {
    const yy = y + Math.sin(x * 0.045 + t * 1.0 + i * 1.3) * 2.6 + Math.sin(x * 0.13 - t * 0.6) * 1.2;
    if (x === 0) path.moveTo(x, yy);
    else path.lineTo(x, yy);
  }
  return path.toSVGString();
}

function spacedTextWidth(text: string, spacing: number, font = wordFont): number {
  const chars = [...text];
  return chars.reduce((sum, ch, i) => sum + font.measureText(ch).width + (i < chars.length - 1 ? spacing : 0), 0);
}

function SpacedText({
  text,
  x,
  y,
  spacing,
  color,
  font,
}: {
  text: string;
  x: number;
  y: number;
  spacing: number;
  color: string;
  font: ReturnType<typeof matchFont>;
}) {
  const chars = [...text];
  const total = spacedTextWidth(text, spacing, font);
  let cursor = x - total / 2;

  return (
    <>
      {chars.map((ch, i) => {
        const width = font.measureText(ch).width;
        const node = (
          <Text key={`${ch}-${i}`} x={cursor} y={y} text={ch} font={font} color={color} />
        );
        cursor += width + spacing;
        return node;
      })}
    </>
  );
}

function DropLayer({ cx, cy, t, theme }: { cx: number; cy: number; t: number; theme: Props['themeId'] }) {
  const TH = OPENING_THEMES[theme];
  if (t < T.dropStart || t > T.impact + 0.05) return null;

  const p = clamp((t - T.dropStart) / (T.impact - T.dropStart), 0, 1);
  const y = -24 + (cy + 24) * easeInOut(p);
  const stretch = 1 + Math.pow(p, 1.5) * 2.2;

  return (
    <>
      <Oval
        x={cx - 1.2}
        y={y - 6 * stretch - 7 * stretch}
        width={2.4}
        height={14 * stretch}
        color={rgba(TH.drop, 0.5)}
      />
      <Oval
        x={cx - 2.6}
        y={y - 3.1 * stretch}
        width={5.2}
        height={6.2 * stretch}
        color={rgba(TH.drop, 0.95)}
      />
    </>
  );
}

function ParticlesLayer({
  cx,
  cy,
  t,
  fade,
  particles,
  theme,
}: {
  cx: number;
  cy: number;
  t: number;
  fade: number;
  particles: Particle[];
  theme: OpeningThemeId;
}) {
  const TH = OPENING_THEMES[theme];
  if (t < T.impact) return null;

  const age = t - T.impact;
  return (
    <>
      {particles.map((pt, i) => {
        if (age > pt.life) return null;
        const pr = age / pt.life;
        const dist = pt.sp * age * (1 - pr * 0.3);
        const x = cx + Math.cos(pt.a) * dist;
        const y = cy + Math.sin(pt.a) * dist + age * age * 160;
        const al = (1 - pr) * 0.8 * fade;
        return (
          <Circle
            key={i}
            cx={x}
            cy={y}
            r={pt.r * (1 - pr * 0.4)}
            color={rgba(TH.edge, al)}
          />
        );
      })}
    </>
  );
}

function RipplesLayer({
  cx,
  cy,
  t,
  fade,
  theme,
}: {
  cx: number;
  cy: number;
  t: number;
  fade: number;
  theme: OpeningThemeId;
}) {
  const TH = OPENING_THEMES[theme];
  if (t < T.impact) return null;

  const ripples = [];
  for (let k = 0; k < 7; k += 1) {
    const s = T.impact + k * 0.32;
    if (t < s) continue;
    const age = t - s;
    const life = 2.1;
    if (age > life) continue;
    const rr = easeOut(age / life) * 160;
    const al = (1 - age / life) * 0.45 * fade;
    const svg = makeWobbleRipplePath(cx, cy, rr, k, age);
    ripples.push(
      <Group key={k}>
        <Path path={svg} style="stroke" strokeWidth={1.4} color={rgba(TH.ripple, al)} />
        <Path path={svg} style="stroke" strokeWidth={0.8} color={rgba(TH.edge, al * 0.5)} />
      </Group>,
    );
  }

  const flashA = clamp(1 - (t - T.impact) / 0.45, 0, 1) * 0.7 * fade;

  return (
    <>
      {ripples}
      {flashA > 0 ? <Circle cx={cx} cy={cy} r={5} color={rgba(TH.edge, flashA)} /> : null}
    </>
  );
}

function BranchLayer({
  cx,
  cy,
  t,
  fade,
  theme,
}: {
  cx: number;
  cy: number;
  t: number;
  fade: number;
  theme: OpeningThemeId;
}) {
  const TH = OPENING_THEMES[theme];

  return (
    <>
      {OPENING_BRANCHES.map((b, i) => {
        const p = easeOut(clamp((t - T.brStart - i * T.brStag) / T.brDur, 0, 1));
        if (p <= 0) return null;

        const rad = (b.a * Math.PI) / 180;
        const len = 140;
        const perp = rad + Math.PI / 2;
        const P0: Point = { x: cx, y: cy };
        const P3: Point = { x: cx + Math.cos(rad) * len, y: cy + Math.sin(rad) * len };
        const C1: Point = {
          x: cx + Math.cos(rad) * len * 0.33 + Math.cos(perp) * b.w,
          y: cy + Math.sin(rad) * len * 0.33 + Math.sin(perp) * b.w,
        };
        const C2: Point = {
          x: cx + Math.cos(rad) * len * 0.7 - Math.cos(perp) * b.w * 0.6,
          y: cy + Math.sin(rad) * len * 0.7 - Math.sin(perp) * b.w * 0.6,
        };

        const col = TH.tips[b.key];
        const segments = [];
        let prev = P0;
        const N = 30;
        for (let s = 1; s <= N; s += 1) {
          const tt = (s / N) * p;
          const pt = bez(P0, C1, C2, P3, tt);
          const wdt = 2.6 * (1 - tt * 0.82);
          segments.push(
            <Line
              key={s}
              p1={vec(prev.x, prev.y)}
              p2={vec(pt.x, pt.y)}
              color={hexA(col, 0.9 * fade)}
              style="stroke"
              strokeWidth={wdt}
              strokeCap="round"
            />,
          );
          prev = pt;
        }

        const end = bez(P0, C1, C2, P3, p);
        const pulse = 1 + Math.sin(t * 3 + i) * 0.12;
        const tipR = (1.8 + 2.4 * p) * pulse;
        const labelA = p > 0.82 ? clamp((p - 0.82) / 0.18, 0, 1) * fade : 0;
        const lx = cx + Math.cos(rad) * (len + 20);
        const ly = cy + Math.sin(rad) * (len + 20) + 4;

        return (
          <Group key={b.key}>
            {segments}
            <Circle cx={end.x} cy={end.y} r={tipR + 5} color={hexA(col, 0.22 * fade)} />
            <Group>
              <BlurMask blur={12} style="normal" />
              <Circle cx={end.x} cy={end.y} r={tipR} color={hexA(col, 0.95 * fade)} />
            </Group>
            {labelA > 0 ? (
              <Text
                x={lx - labelFont.measureText(b.lab).width / 2}
                y={ly}
                text={b.lab}
                font={labelFont}
                color={hexA(col, labelA)}
              />
            ) : null}
          </Group>
        );
      })}
    </>
  );
}

function WordmarkLayer({
  cx,
  cy,
  t,
  theme,
}: {
  cx: number;
  cy: number;
  t: number;
  theme: OpeningThemeId;
}) {
  const TH = OPENING_THEMES[theme];
  const p = easeOut(clamp((t - T.wordStart) / T.wordDur, 0, 1));
  if (p <= 0) return null;

  const cap = easeInOut(clamp((t - T.capStart) / T.capDur, 0, 1));
  const settle = 1.05 - 0.05 * easeOut(clamp((t - T.wordStart) / 0.7, 0, 1));
  const y = cy - cap * (cy - 72);
  const size = (27 - cap * 12) * settle;
  const al = Math.min(p, 1);
  const spacing = size * 0.16 * al;
  const hw = (1 - cap) * 46 * p;
  const tagA = cap < 0.5 ? (1 - cap * 2) * al : 0;
  const scale = size / 27;

  const activeWordFont = useMemo(
    () =>
      matchFont({
        fontFamily: Platform.select({
          ios: 'Helvetica Neue',
          android: 'sans-serif',
          default: 'system-ui',
        }),
        fontSize: 27,
        fontWeight: '700',
      }),
    [],
  );

  return (
    <Group transform={[{ translateX: cx }, { translateY: y }, { scale }, { translateX: -cx }, { translateY: -y }]}>
      {/* モックの shadowBlur 相当 — BlurMask は文字が潰れるためレイヤー重ね */}
      <SpacedText
        text="KOTOI"
        x={cx}
        y={y + 1}
        spacing={spacing + 1.5}
        color={rgba(TH.glow, 0.18 * al)}
        font={activeWordFont}
      />
      <SpacedText
        text="KOTOI"
        x={cx}
        y={y}
        spacing={spacing}
        color={rgba(TH.word, al)}
        font={activeWordFont}
      />
      {hw > 1 ? (
        <Line
          p1={vec(cx - hw, y + 14)}
          p2={vec(cx + hw, y + 14)}
          color={rgba(TH.tag, 0.4 * al)}
          style="stroke"
          strokeWidth={0.6}
        />
      ) : null}
      {tagA > 0 ? (
        <SpacedText
          text="問いが増える"
          x={cx}
          y={y + 30}
          spacing={2 * tagA}
          color={rgba(TH.tag, tagA)}
          font={tagFont}
        />
      ) : null}
    </Group>
  );
}

function CaptureLayer({
  cx,
  width,
  height,
  t,
  theme,
}: {
  cx: number;
  width: number;
  height: number;
  t: number;
  theme: OpeningThemeId;
}) {
  const TH = OPENING_THEMES[theme];
  const p = easeOut(clamp((t - T.capStart - 0.2) / T.capDur, 0, 1));
  if (p <= 0) return null;

  const w = 268;
  const h = 52;
  const x = cx - w / 2;
  const y = height * 0.6;
  const al = p;
  const blink = Math.sin(t * 4) * 0.5 + 0.5;

  return (
    <Group>
      <Group>
        <BlurMask blur={18} style="normal" />
        <RoundedRect
          x={x}
          y={y + 6 * al}
          width={w}
          height={h}
          r={26}
          color={rgba(TH.pillFill, TH.pillFillA * al)}
        />
      </Group>
      <RoundedRect
        x={x}
        y={y}
        width={w}
        height={h}
        r={26}
        color={rgba(TH.pill, 0.55 * al)}
        style="stroke"
        strokeWidth={0.8}
      />
      <Text x={x + 22} y={y + h / 2 + 5} text="いま、何が気になってる？" font={captureFont} color={rgba(TH.ph, al)} />
      <Rect x={x + 20} y={y + 16} width={1.5} height={20} color={rgba(TH.caret, al * blink)} />
      <Text
        x={cx - hintFont.measureText('メモも、動画リンクも。').width / 2}
        y={y + h + 26}
        text="メモも、動画リンクも。"
        font={hintFont}
        color={rgba(TH.hint, 0.85 * al)}
      />
    </Group>
  );
}

/** グレインは Skia で overlay ブレンドが難しいため、低不透明度のノイズ矩形で近似 */
function GrainLayer({ width, height, theme }: { width: number; height: number; theme: OpeningThemeId }) {
  const grainA = OPENING_THEMES[theme].grainA;
  const grain = OPENING_THEMES[theme].grain;
  const dots = useMemo(() => {
    const items: { x: number; y: number; a: number }[] = [];
    for (let i = 0; i < 900; i += 1) {
      items.push({
        x: Math.random() * width,
        y: Math.random() * height,
        a: Math.random() * grainA * 2,
      });
    }
    return items;
  }, [width, height, grainA]);

  return (
    <>
      {dots.map((d, i) => (
        <Rect key={i} x={d.x} y={d.y} width={1} height={1} color={rgba(grain, d.a)} />
      ))}
    </>
  );
}

export function OpeningRippleSkiaSample({ width, height, themeId, t, particles }: Props) {
  const TH = OPENING_THEMES[themeId];
  const cx = width / 2;
  const cy = height * 0.4;
  const capFade = computeCapFade(t);
  const branchFade = computeBranchFade(t, capFade);

  if (width <= 0 || height <= 0) {
    return <View style={styles.empty} />;
  }

  return (
    <Canvas style={{ width, height }}>
      <Rect x={0} y={0} width={width} height={height}>
        <RadialGradient c={vec(cx, cy)} r={height * 0.75} colors={[TH.inner, TH.outer]} />
      </Rect>
      <Rect x={0} y={0} width={width} height={height}>
        <RadialGradient
          c={vec(cx, cy)}
          r={height * 0.72}
          colors={['rgba(0,0,0,0)', TH.vig]}
        />
      </Rect>

      {Array.from({ length: 5 }, (_, i) => {
        const y = cy + (i - 2) * 52;
        const svg = makeCausticPath(y, t, i, width);
        return (
          <Path
            key={i}
            path={svg}
            style="stroke"
            strokeWidth={1}
            color={rgba(TH.ripple, 0.05)}
          />
        );
      })}

      <DropLayer cx={cx} cy={cy} t={t} theme={themeId} />
      <ParticlesLayer cx={cx} cy={cy} t={t} fade={capFade} particles={particles} theme={themeId} />
      <RipplesLayer cx={cx} cy={cy} t={t} fade={capFade} theme={themeId} />
      <BranchLayer cx={cx} cy={cy} t={t} fade={branchFade} theme={themeId} />
      <WordmarkLayer cx={cx} cy={cy} t={t} theme={themeId} />
      <CaptureLayer cx={cx} width={width} height={height} t={t} theme={themeId} />
      <GrainLayer width={width} height={height} theme={themeId} />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
  },
});
