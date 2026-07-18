/** feeling メモに付けられる問いの上限（振り返りを掘りすぎない） */
export const FEELING_MAX_QUESTIONS = 3;

export function feelingQuestionLimitCopy(currentCount: number): string {
  const n = Math.max(0, Math.min(currentCount, FEELING_MAX_QUESTIONS));
  if (n >= FEELING_MAX_QUESTIONS) {
    return `感情メモの問いは最大${FEELING_MAX_QUESTIONS}つまでです`;
  }
  return `感情メモの問いは最大${FEELING_MAX_QUESTIONS}つまで（いま ${n}/${FEELING_MAX_QUESTIONS}）`;
}

export function canAddFeelingQuestion(currentCount: number): boolean {
  return currentCount < FEELING_MAX_QUESTIONS;
}
