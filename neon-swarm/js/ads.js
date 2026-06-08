// NEON SWARM — ad / portal SDK abstraction.
//
// This is the single integration seam for monetization. The game only ever calls
// these methods; to publish on a portal you wire the real SDK in ONE place here.
//
// Quick wiring guides (uncomment + load the portal script in index.html):
//
//   POKI:        <script src="//game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>
//     init:          await PokiSDK.init()
//     gameplayStart: PokiSDK.gameplayStart()
//     gameplayStop:  PokiSDK.gameplayStop()
//     interstitial:  await PokiSDK.commercialBreak()
//     rewarded:      return await PokiSDK.rewardedBreak()   // -> boolean
//
//   CRAZYGAMES:  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
//     init:          await window.CrazyGames.SDK.init()
//     gameplayStart: CrazyGames.SDK.game.gameplayStart()
//     gameplayStop:  CrazyGames.SDK.game.gameplayStop()
//     interstitial:  CrazyGames.SDK.ad.requestAd('midgame', {...})
//     rewarded:      CrazyGames.SDK.ad.requestAd('rewarded', { adFinished, adError })
//
(function () {
  'use strict';

  const Ads = {
    provider: 'none',     // 'none' | 'poki' | 'crazygames' | ...
    inAd: false,

    async init() {
      // TODO(publish): call the portal SDK init here.
      return true;
    },

    // Active, interactive gameplay has begun (portals pause house ads / track engagement).
    gameplayStart() {
      // TODO(publish): PokiSDK.gameplayStart() / CrazyGames.SDK.game.gameplayStart()
    },

    // Gameplay paused or ended.
    gameplayStop() {
      // TODO(publish): PokiSDK.gameplayStop() / CrazyGames.SDK.game.gameplayStop()
    },

    // Non-rewarded break (e.g. between runs). Resolves when the ad is done/skipped.
    // Audio is muted around the break so house ads don't clash with the game.
    async interstitial() {
      if (this.provider === 'none') return;
      this.inAd = true;
      try { window.Sound && Sound.setMuted(true); } catch (e) {}
      // TODO(publish): await PokiSDK.commercialBreak()
      try { window.Sound && Sound.setMuted(!!(window.Meta && Meta.data.muted)); } catch (e) {}
      this.inAd = false;
    },

    // Rewarded break. Resolves true if the player earned the reward (watched fully).
    // With no provider wired we grant the reward so the dev build is playable; a real
    // build returns the SDK's actual completion result.
    async rewarded(tag) {
      if (this.provider === 'none') return true;
      this.inAd = true;
      let ok = false;
      try {
        window.Sound && Sound.setMuted(true);
        // TODO(publish): ok = await PokiSDK.rewardedBreak()
        ok = true;
      } catch (e) { ok = false; }
      try { window.Sound && Sound.setMuted(!!(window.Meta && Meta.data.muted)); } catch (e) {}
      this.inAd = false;
      return ok;
    },
  };

  window.Ads = Ads;
})();
