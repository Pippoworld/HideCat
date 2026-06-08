// NEON SWARM — analytics / telemetry seam.
//
// Single integration point for product analytics. The game calls Analytics.track();
// wire your provider here for a real launch. No PII is ever sent — only gameplay events.
//
//   GA4:        load gtag.js, then in track(): gtag('event', event, props)
//   Plausible:  window.plausible(event, { props })
//   Portal:     many portals expose their own analytics; forward here.
//
(function () {
  'use strict';

  const Analytics = {
    provider: 'none', // 'ga4' | 'plausible' | 'portal' | 'none'
    queue: [],        // dev-mode in-memory ring buffer (inspect via Analytics.queue)
    enabled: true,

    init() {
      // TODO(publish): initialise your analytics SDK here.
    },

    track(event, props) {
      if (!this.enabled) return;
      const payload = props || {};
      this.queue.push({ event, props: payload, t: Date.now() });
      if (this.queue.length > 250) this.queue.shift();
      try {
        if (this.provider === 'ga4' && typeof window.gtag === 'function') window.gtag('event', event, payload);
        else if (this.provider === 'plausible' && typeof window.plausible === 'function') window.plausible(event, { props: payload });
      } catch (e) { /* never let analytics break the game */ }
    },
  };

  window.Analytics = Analytics;
})();
