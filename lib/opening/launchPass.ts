/**
 * React ツリーが remount されても、同一 JS 実行中の「オープニング通過」を失わない。
 * （フルリロード／アプリ再起動では false に戻る → 未ログイン起動でまた表示）
 */
let passedOpeningThisLaunch = false;

export function hasPassedOpeningThisLaunch(): boolean {
  return passedOpeningThisLaunch;
}

export function markPassedOpeningThisLaunch(): void {
  passedOpeningThisLaunch = true;
}

export function clearPassedOpeningThisLaunch(): void {
  passedOpeningThisLaunch = false;
}
