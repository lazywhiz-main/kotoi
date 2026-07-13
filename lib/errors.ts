export const DAILY_LIMIT_MESSAGE = '本日の利用上限に達しました。明日また試してください。';
export const PAYWALL_MESSAGE = '次の見取り図から、KOTOIの続きを。';
export const READ_ONLY_MESSAGE =
  'いまは閲覧のみです。これまでの記録はそのまま残っています。';

export function formatApiError(error: unknown, fallback = '処理に失敗しました'): string {
  if (error == null) return fallback;

  const code =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : typeof error === 'object' && error !== null && 'error' in error
            ? String((error as { error: unknown }).error)
            : fallback;

  if (code === 'daily_limit_exceeded') return DAILY_LIMIT_MESSAGE;
  if (code === 'paywall_required') return PAYWALL_MESSAGE;
  if (code === 'read_only') return READ_ONLY_MESSAGE;
  return code || fallback;
}
