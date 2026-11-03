// CrazyGames HTML5 SDK v3 包裝（對照 docs.crazygames.com/sdk/{game,data}）。
// 沒有 SDK（本機開發、擋廣告、測試）時每個呼叫都是安全的空操作，遊戲不依賴它。
// 不接廣告：Basic Launch 期間平台不放廣告；要上 Full Launch 時再依 docs.crazygames.com/sdk/video-ads 加回。
// - gameplayStart/Stop、happytime 呼叫太密 SDK 會 console.error「call throttled」：gameplay 合併成 ≥ 1.1 秒一次、happytime ≥ 10 秒一次
// - init 之前呼叫的 loadingStart / gameplayStart 會在 SDK 就緒後補送
// - SDK 腳本晚到（慢網路）：init 會在腳本載完時自動重試，不會整場都沒有 SDK
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    CrazyGames?: { SDK?: any };
    __cgSdk?: Promise<void>;
    __cgSdkDone?: () => void;
    __bootP?: (p: number) => void;
    __bootFail?: () => void;
  }
}

const sdk = (): any => window.CrazyGames?.SDK;
const GAP_MS = 1100;
const HAPPY_GAP_MS = 10000;
const INIT_TIMEOUT_MS = 4000;
let ready = false;
let playing = false; // 遊戲要求的狀態
let sdkPlaying = false; // 上一次告訴 SDK 的狀態
let lastGameplayCall = -Infinity;
let syncTimer = 0;
let lastHappy = -Infinity;
let loading = false;
let initing: Promise<boolean> | null = null;
const muteFns = new Set<(m: boolean) => void>();
const readyFns = new Set<() => void>();

const settingsMuted = () => !!(ready && sdk()?.game?.settings?.muteAudio);
const emitMute = () => {
  const m = settingsMuted();
  muteFns.forEach((fn) => fn(m));
};
const call = (fn: (s: any) => void) => {
  if (!ready) return;
  try {
    fn(sdk());
  } catch (e) {
    console.warn('[cg]', e);
  }
};

// 把最新的要求告訴 SDK，但不快於 GAP_MS；很快的 stop→start（或反過來）會互相抵銷
function syncGameplay(force = false): void {
  clearTimeout(syncTimer);
  syncTimer = 0;
  if (sdkPlaying === playing) return;
  const wait = lastGameplayCall + GAP_MS - performance.now();
  if (wait > 0 && !force) {
    syncTimer = window.setTimeout(syncGameplay, wait);
    return;
  }
  sdkPlaying = playing;
  lastGameplayCall = performance.now();
  call((s) => (playing ? s.game.gameplayStart() : s.game.gameplayStop()));
}

async function tryInit(): Promise<boolean> {
  if (ready) return true;
  if (!sdk()) return false;
  try {
    await Promise.race([sdk().init(), new Promise((_, rej) => setTimeout(() => rej(new Error('SDK init timeout')), INIT_TIMEOUT_MS))]);
    ready = true;
    if (loading) call((s) => s.game.loadingStart());
    sdkPlaying = false;
    syncGameplay(true);
    sdk().game.addSettingsChangeListener?.(emitMute);
    emitMute();
    readyFns.forEach((fn) => fn());
    return true;
  } catch (e) {
    console.warn('[cg] init failed, running without SDK for now', e);
    return false;
  }
}

export const cg = {
  // 開機時等一次（最多 INIT_TIMEOUT_MS）。腳本當下還沒到的話，等它載完（window.__cgSdk）再自動補 init
  init(): Promise<boolean> {
    if (!initing) {
      initing = tryInit().then((ok) => {
        if (!ok && !ready)
          window.__cgSdk?.then(() => {
            if (!ready) void tryInit();
          });
        return ok;
      });
    }
    return initing;
  },
  get ready() {
    return ready;
  },
  /** SDK 晚到就緒時要做的事（例如改從雲端讀存檔） */
  onReady(fn: () => void) {
    readyFns.add(fn);
    if (ready) fn();
  },
  loadingStart() {
    loading = true;
    call((s) => s.game.loadingStart());
  },
  loadingStop() {
    loading = false;
    call((s) => s.game.loadingStop());
  },
  gameplayStart() {
    if (playing) return;
    playing = true;
    syncGameplay();
  },
  gameplayStop() {
    if (!playing) return;
    playing = false;
    syncGameplay();
  },
  // 少見的真正成就（新紀錄、破世界）；10 秒內多的呼叫丟掉
  happytime() {
    const now = performance.now();
    if (now - lastHappy < HAPPY_GAP_MS) return;
    lastHappy = now;
    call((s) => s.game.happytime());
  },
  // fn(muted) 在平台靜音設定改變時觸發
  onMute(fn: (m: boolean) => void) {
    muteFns.add(fn);
    fn(settingsMuted());
    return () => muteFns.delete(fn);
  },
  get muted() {
    return settingsMuted();
  },
  // 存檔：localStorage 永遠是鏡像（開機先讀它，不等 SDK），SDK 就緒後同時寫雲端；from 指定只讀哪一邊（開機讀本機、就緒後讀雲端來合併）
  getItem(key: string, from: 'auto' | 'local' | 'cloud' = 'auto'): string | null {
    try {
      const cloud = from !== 'local' && ready && !!sdk().data;
      if (from === 'cloud' && !cloud) return null;
      return cloud ? sdk().data.getItem(key) : localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    const v = String(value);
    try {
      localStorage.setItem(key, v);
    } catch {
      /* 存不了就算了 */
    }
    if (ready && sdk().data) {
      try {
        sdk().data.setItem(key, v);
      } catch (e) {
        console.warn('[cg] setItem', e);
      }
    }
  },
  saveJSON(key: string, obj: unknown): void {
    cg.setItem(key, JSON.stringify(obj));
  },
};
