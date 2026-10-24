// CrazyGames HTML5 SDK v3 wrapper (checked against docs.crazygames.com/sdk/{game,video-ads,data}, 2026-10-25).
// index.html <head> must contain: <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
// Every call is a safe no-op without the SDK (local dev, adblock, SDK blocked in tests), so the game never depends on it.
// Copy this file into src/ unchanged; only the coordinator edits the master copy in crazygames/_shared/.
const sdk = () => window.CrazyGames?.SDK;
let ready = false;
let playing = false;
let adMuted = false;
const muteFns = new Set();

const settingsMuted = () => !!(ready && sdk().game.settings?.muteAudio);
const emitMute = () => { const m = adMuted || settingsMuted(); muteFns.forEach((fn) => fn(m)); };
const call = (fn) => { if (!ready) return; try { fn(sdk()); } catch (e) { console.warn('[cg]', e); } };

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
  // Call when play begins/resumes (round start, revive, next level). Deduped.
  gameplayStart() { if (playing) return; playing = true; call((s) => s.game.gameplayStart()); },
  // Call at every break (pause, menu, game over, level end). Deduped.
  gameplayStop() { if (!playing) return; playing = false; call((s) => s.game.gameplayStop()); },
  // Rare, real achievements only (new best, boss beaten) — not every level.
  happytime() { call((s) => s.game.happytime()); },
  // fn(muted:boolean) fires when an ad starts/ends or the platform's muteAudio setting changes.
  onMute(fn) { muteFns.add(fn); fn(adMuted || settingsMuted()); return () => muteFns.delete(fn); },
  get muted() { return adMuted || settingsMuted(); },
  // Midgame: only at natural breaks (after game over / between levels), never from menu buttons.
  // Resolves when the ad is done or failed; the SDK itself enforces frequency (max 1 per 3 min).
  midgame() { return requestAd('midgame').then(() => {}); },
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
  return new Promise((resolve) => {
    const end = (ok) => { if (adMuted) { adMuted = false; emitMute(); } resolve(ok); };
    try {
      sdk().ad.requestAd(type, {
        adStarted: () => { adMuted = true; emitMute(); }, // mute only once the ad really starts
        adFinished: () => end(true),
        adError: (err) => { console.warn(`[cg] ${type} ad error`, err); end(false); },
      });
    } catch (e) { console.warn('[cg]', e); end(false); }
  });
}
