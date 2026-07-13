import { useCallback, useState } from 'react';

import { invokeFunction } from '@/lib/api';
import { formatApiError } from '@/lib/errors';
import { applyReviewDevMocks } from '@/lib/reviewDevMock';
import type {
  ReviewAccumulation,
  ReviewCooldown,
  WeeklyReviewResult,
} from '@/lib/types';
import {
  fetchLatestWeeklyReview,
  fetchReviewAccumulation,
  fetchWeeklyReviewHistory,
  getReviewCooldown,
} from '@/lib/weeklyReviewClient';

type GenerateResponse = {
  ok: boolean;
  status: 'generated' | 'cooldown';
  review: WeeklyReviewResult;
  next_eligible_at: string | null;
  days_remaining: number;
  error?: string;
};

export function useWeeklyReview(userId: string | undefined) {
  const [review, setReview] = useState<WeeklyReviewResult | null>(null);
  const [history, setHistory] = useState<WeeklyReviewResult[]>([]);
  const [accumulation, setAccumulation] = useState<ReviewAccumulation | null>(null);
  const [cooldown, setCooldown] = useState<ReviewCooldown>({
    eligible: true,
    next_eligible_at: null,
    days_remaining: 0,
  });
  const [usingDevMock, setUsingDevMock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccumulation = useCallback(
    async (latest: WeeklyReviewResult | null, mockAccumulation: ReviewAccumulation | null) => {
      if (mockAccumulation) {
        setAccumulation(mockAccumulation);
        return;
      }
      if (!userId) {
        setAccumulation(null);
        return;
      }
      // 初回は「これまでのすべて」、2回目以降は前回ふりかえり以降
      const sinceAt = latest?.generated_at ?? '1970-01-01T00:00:00.000Z';
      const data = await fetchReviewAccumulation(userId, sinceAt);
      setAccumulation(data);
    },
    [userId],
  );

  const refresh = useCallback(async () => {
    if (!userId) {
      setReview(null);
      setHistory([]);
      setAccumulation(null);
      setCooldown({ eligible: true, next_eligible_at: null, days_remaining: 0 });
      setUsingDevMock(false);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const [latestRaw, historyRaw] = await Promise.all([
        fetchLatestWeeklyReview(userId),
        fetchWeeklyReviewHistory(userId),
      ]);

      const mocked = applyReviewDevMocks(latestRaw, historyRaw.length > 0 ? historyRaw : latestRaw ? [latestRaw] : []);
      setReview(mocked.latest);
      setHistory(mocked.history);
      setCooldown(mocked.usingMock ? mocked.cooldown : getReviewCooldown(mocked.latest));
      setUsingDevMock(mocked.usingMock);
      await loadAccumulation(mocked.latest, mocked.usingMock ? mocked.accumulation : null);
      return mocked.latest;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ふりかえりの取得に失敗しました';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadAccumulation, userId]);

  const generate = useCallback(async () => {
    if (!userId) return null;

    setGenerating(true);
    setError(null);

    try {
      const result = await invokeFunction<GenerateResponse>('weekly-review', {});
      if (result.error) {
        throw new Error(formatApiError(result.error, 'ふりかえりの作成に失敗しました'));
      }

      const historyRaw = await fetchWeeklyReviewHistory(userId);
      const mocked = applyReviewDevMocks(result.review, historyRaw);
      setReview(mocked.latest);
      setHistory(mocked.history);
      setCooldown(mocked.usingMock ? mocked.cooldown : getReviewCooldown(result.review));
      setUsingDevMock(mocked.usingMock);

      if (mocked.usingMock) {
        await loadAccumulation(result.review, mocked.accumulation);
      } else {
        await loadAccumulation(result.review, null);
      }

      return result;
    } catch (err) {
      const message = formatApiError(err, 'ふりかえりの作成に失敗しました');
      setError(message);
      return null;
    } finally {
      setGenerating(false);
    }
  }, [loadAccumulation, userId]);

  return {
    review,
    history,
    accumulation,
    cooldown,
    usingDevMock,
    loading,
    generating,
    error,
    refresh,
    generate,
  };
}
