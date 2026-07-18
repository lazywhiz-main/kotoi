/** Auth の明示的ログアウトから OpeningGate へ通知（循環 import 回避） */
type Handler = () => void;

let handler: Handler | null = null;

export function setOpeningLogoutHandler(next: Handler | null) {
  handler = next;
}

export function notifyExplicitLogout() {
  handler?.();
}
