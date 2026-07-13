/**
 * 軽量な計測フック。現状は開発ログのみ。
 * SEAM: PostHog / 自前イベント表などへ差し替え。
 */
export function track(
  event: string,
  props?: Record<string, string | number | boolean | null | undefined>
): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[analytics]', event, props ?? {});
  }
}
