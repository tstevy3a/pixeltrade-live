/* ===== LiveData: client-side fetcher for indicators.json =====
   Polls live-data/indicators.json every 15s, exposes window.LiveData API.
   Tries multiple sources in order: same-origin → jsDelivr CDN → local fallback.
   Falls back gracefully to empty cache if all sources missing/malformed. */
(function(){
  const POLL_MS = 15000;
  let cache = { tickers: {}, refreshed_at: null, scan_meta: {} };
  const subscribers = new Set();
  let timer = null;

  // Build list of candidate URLs to try, in priority order
  function candidateUrls(){
    const out = ['live-data/indicators.json'];   // same-origin (works for local server & some deploys)
    // jsDelivr CDN (GitHub repo)
    if (typeof location !== 'undefined' && location.hostname && location.hostname.endsWith('github.io')) {
      // user.github.io/repo/ — derive repo name
      const m = location.pathname.match(/^\/([^\/]+)/);
      if (m) out.push('https://cdn.jsdelivr.net/gh/tstevy3a/pixeltrade-live@main/live-data/indicators.json');
    }
    out.push('https://cdn.jsdelivr.net/gh/tstevy3a/pixeltrade-live@main/live-data/indicators.json');
    return out;
  }

  async function tryFetch(url){
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch(e){ return null; }
  }

  async function poll(){
    const urls = candidateUrls();
    for (const url of urls) {
      const next = await tryFetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
      if (next && typeof next === 'object' && next.tickers) {
        cache = next;
        subscribers.forEach(cb => { try { cb(cache); } catch(e){ console.warn('subscriber err', e); } });
        return; // first success wins
      }
    }
    // all failed → keep last cache
  }

  function start(){
    if (timer) return;
    poll();                       // immediate
    timer = setInterval(poll, POLL_MS);
  }

  function ageMs(){
    if (!cache.refreshed_at) return Infinity;
    const t = Date.parse(cache.refreshed_at);
    return isNaN(t) ? Infinity : (Date.now() - t);
  }

  function freshness(){
    const a = ageMs();
    if (!isFinite(a)) return 'stale';
    if (a < 5*60*1000)   return 'fresh';   // < 5 min
    if (a < 30*60*1000)  return 'aging';   // 5-30 min
    return 'stale';                        // > 30 min
  }

  // Public API
  window.LiveData = {
    get:      (t)   => cache.tickers[t] || null,
    getAll:   ()    => ({ ...cache.tickers }),
    getMeta:  ()    => ({
      refreshed_at: cache.refreshed_at,
      scan_meta:    cache.scan_meta || {},
      version:      cache.version,
      source:       cache.source,
    }),
    ageMs,
    freshness,
    onUpdate: (cb)  => { subscribers.add(cb); try { cb(cache); } catch(_){} return () => subscribers.delete(cb); },
    refresh:  ()    => poll(),
    start,
  };

  // Auto-start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
