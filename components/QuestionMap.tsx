import React from 'react';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { mapNodeLines } from '@/lib/mapLabel';
import { getQuestionColors } from '@/lib/theme';

import type { ExplorationSubtheme, QuestionType } from '@/lib/types';
import { useColors } from '@/providers/ThemeProvider';

type Props = {
  shortLabel: string;
  subthemes: ExplorationSubtheme[];
  width?: number;
  height?: number;
  highlightedQuestionId?: string | null;
  onQuestionPress?: (questionId: string, mapIndex: number) => void;
};

function HubLabel({
  x,
  y,
  label,
  fallback,
  fillColor,
}: {
  x: number;
  y: number;
  label: string;
  fallback: string;
  fillColor: string;
}) {
  const lines = mapNodeLines(label, fallback);

  return (
    <>
      {lines.map((line, index) => (
        <SvgText
          key={`${line}-${index}`}
          x={x}
          y={y - (lines.length === 2 ? 4 : 0) + index * 11}
          textAnchor="middle"
          fontSize={8.5}
          fill={fillColor}
        >
          {line}
        </SvgText>
      ))}
    </>
  );
}

export function QuestionMap({
  shortLabel,
  subthemes,
  width = 336,
  height = 356,
  highlightedQuestionId,
  onQuestionPress,
}: Props) {
  const colors = useColors();
  const cx = width / 2;
  const cy = height / 2 - 8;
  const r1 = 88;
  const r2 = 138;
  const hubCount = Math.max(subthemes.length, 1);

  const centerLines = shortLabel.split('\n').slice(0, 2);
  let questionNumber = 0;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {subthemes.map((hub, hubIndex) => {
        const baseDeg = -90 + hubIndex * (360 / hubCount);
        const angle = (baseDeg * Math.PI) / 180;
        const mx = cx + r1 * Math.cos(angle);
        const my = cy + r1 * Math.sin(angle);
        const spread = (hub.questions.length - 1) * 17;
        const fallback = `T${hubIndex + 1}`;

        return (
          <React.Fragment key={hub.id}>
            <Line x1={cx} y1={cy} x2={mx} y2={my} stroke={colors.lineStrong} strokeWidth={1.4} />
            <Circle cx={mx} cy={my} r={30} fill={colors.card} stroke={colors.lineStrong} strokeWidth={1.4} />
            <HubLabel
              x={mx}
              y={my + 3}
              label={hub.mapLabel || hub.label}
              fallback={fallback}
              fillColor={colors.sub}
            />
            {hub.questions.map((question, questionIndex) => {
              questionNumber += 1;
              const currentIndex = questionNumber;
              const qa = (baseDeg + (questionIndex * 17 - spread / 2)) * (Math.PI / 180);
              const qx = cx + r2 * Math.cos(qa);
              const qy = cy + r2 * Math.sin(qa);
              const palette = getQuestionColors(colors)[question.question_type];
              const highlighted = highlightedQuestionId === question.id;
              const hasThoughts = question.thoughts.length > 0;
              const radius = highlighted ? 14 : 12;

              return (
                <React.Fragment key={question.id}>
                  <Line
                    x1={mx}
                    y1={my}
                    x2={qx}
                    y2={qy}
                    stroke={palette.text}
                    strokeWidth={highlighted ? 1.6 : 1.2}
                    opacity={highlighted ? 0.75 : 0.5}
                  />
                  <G
                    onPress={
                      onQuestionPress
                        ? () => onQuestionPress(question.id, currentIndex)
                        : undefined
                    }
                  >
                    <Circle
                      cx={qx}
                      cy={qy}
                      r={radius}
                      fill={palette.bg}
                      stroke={palette.text}
                      strokeWidth={highlighted ? 2.2 : 1.3}
                    />
                    <SvgText
                      x={qx}
                      y={qy + 3.5}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight="700"
                      fill={palette.text}
                    >
                      {currentIndex}
                    </SvgText>
                    {hasThoughts ? (
                      <Circle cx={qx + 8} cy={qy - 8} r={3.2} fill={palette.text} opacity={0.85} />
                    ) : null}
                  </G>
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}

      <Circle cx={cx} cy={cy} r={42} fill={colors.accent} />
      {centerLines.map((line, index) => (
        <SvgText
          key={`${line}-${index}`}
          x={cx}
          y={cy - 3 + index * 14}
          textAnchor="middle"
          fontSize={10.5}
          fill={colors.onAccent}
        >
          {line}
        </SvgText>
      ))}
    </Svg>
  );
}
