// CrazyGames HTML5 SDK v3 wrapper (checked against docs.crazygames.com/sdk/{game,video-ads,data}, 2026-10-25).
// index.html <head> must contain: <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
// Every call is a safe no-op without the SDK (local dev, adblock, SDK blocked in tests), so the game never depends on it.
// Copy this file into src/ unchanged; only the coordinator edits the master copy in crazygames/_shared/.
// v2 (2026-10-25): the SDK console.errors "call throttled" when gameplayStart/Stop or happytime fire < 1 s apart,
// so gameplay calls are coalesced to >= 1.1 s apart and happytime to >= 10 s; midgame is skipped in a break where
// a rewarded ad already played (ads policy: never combine both in the same break).
const sdk = () => window.CrazyGames?.SDK;
const GAP_MS = 1100;
const HAPPY_GAP_MS = 10000;
let ready = false;
let playing = false; // what the game asked for
let sdkPlaying = false; // what the SDK was last told
let lastGameplayCall = -Infinity;
let syncTimer = 0;
let lastHappy = -Infinity;
let rewardedThisBreak = false;
let adMuted = false;
const muteFns = new Set();

const settingsMuted = () => !!(ready && sdk().game.settings?.muteAudio);
const emitMute = () => { const m = adMuted || settingsMuted(); muteFns.forEach((fn) => fn(m)); };
const call = (fn) => { if (!ready) return; try { fn(sdk()); } catch (e) { console.warn('[cg]', e); } };

// Tell the SDK the latest requested state, never faster than GAP_MS; a quick stop→start (or start→stop) cancels out.
function syncGameplay(force = false) {
  clearTimeout(syncTimer);
  syncTimer = 0;
  if (sdkPlaying === playing) return;
  const wait = lastGameplayCall + GAP_MS - performance.now();
  if (wait > 0 && !force) { syncTimer = setTimeout(syncGameplay, wait); return; }
  sdkPlaying = playing;
  lastGameplayCall = performance.now();
  call((s) => (playing ? s.game.gameplayStart() : s.game.gameplayStop()));
}

export const cg = {
  // Await once at boot, before reading saves. Gives up after 4 s so a slow/blocked SDK never stalls loading.
  async init() {
    if (!sdk()) return;
    try {
      await Promise.race([sdk().init(), new Promise((_, rej) => setTimeout(() => rej(new Error('SDK init timeout')), 4000))]);
      ready = true;
      sdk().game.addSettingsChangeListener?.(emitMute);
      emitMute();
    } catch (e) { console.warn('[cg] init failed, running without SDK', e); }
  },
  get ready() { return ready; },
  loadingStart() { call((s) => s.game.loadingStart()); },
  loadingStop() { call((s) => s.game.loadingStop()); },
  // Call when play begins/resumes (round start, revive, next level). Deduped and rate-limited.
  gameplayStart() { if (playing) return; playing = true; rewardedThisBreak = false; syncGameplay(); },
  // Call at every break (pause, menu, game over, level end). Deduped and rate-limited.
  gameplayStop() { if (!playing) return; playing = false; syncGameplay(); },
  // Rare, real achievements only (new best, boss beaten) — not every level. Extra calls within 10 s are dropped.
  happytime() { const now = performance.now(); if (now - lastHappy < HAPPY_GAP_MS) return; lastHappy = now; call((s) => s.game.happytime()); },
  // fn(muted:boolean) fires when an ad starts/ends or the platform's muteAudio setting changes.
  onMute(fn) { muteFns.add(fn); fn(adMuted || settingsMuted()); return () => muteFns.delete(fn); },
  get muted() { return adMuted || settingsMuted(); },
  // Midgame: only at natural breaks (after game over / between levels), never from menu buttons.
  // Resolves when the ad is done or failed; the SDK itself enforces frequency (max 1 per 3 min).
  // Resolves immediately (no ad) if a rewarded ad already played since the last gameplayStart.
  midgame() { return rewardedThisBreak ? Promise.resolve() : requestAd('midgame').then(() => {}); },
  // Rewarded: resolves true only on adFinished. Block the UI until it resolves; never reward on false.
  rewarded() { return requestAd('rewarded'); },
  // Same API as localStorage. Uses the SDK data module (cloud save) when ready, else localStorage.
  getItem(key) { try { return ready && sdk().data ? sdk().data.getItem(key) : localStorage.getItem(key); } catch { return null; } },
  setItem(key, value) { try { ready && sdk().data ? sdk().data.setItem(key, String(value)) : localStorage.setItem(key, String(value)); } catch {} },
  loadJSON(key, fallback) { try { const v = cg.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : { ...fallback }; } catch { return { ...fallback }; } },
  saveJSON(key, obj) { cg.setItem(key, JSON.stringify(obj)); },
};

function requestAd(type) {
  if (!ready) return Promise.resolve(false);
  if (!playing) syncGameplay(true); // ads only at breaks: make sure the SDK has heard the pending gameplayStop
  return new Promise((resolve) => {
    const end = (ok) => { if (adMuted) { adMuted = false; emitMute(); } resolve(ok); };
    try {
      sdk().ad.requestAd(type, {
        adStarted: () => { adMuted = true; emitMute(); if (type === 'rewarded') rewardedThisBreak = true; }, // mute only once the ad really starts
        adFinished: () => end(true),
        adError: (err) => { console.warn(`[cg] ${type} ad error`, err); end(false); },
      });
    } catch (e) { console.warn('[cg]', e); end(false); }
  });
}
