/* ===== LiveData: client-side fetcher for indicators.json =====
   Polls live-data/indicators.json every 15s, exposes window.LiveData API.
   Falls back gracefully to empty cache if file missing or malformed. */
(function(){
  const POLL_MS = 15000;
  let cache = { tickers: {}, refreshed_at: null, scan_meta: {} };
  const subscribers = new Set();
  let timer = null;

  async function poll(){
    try {
      const r = await fetch('live-data/indicators.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) {
        // 404 or other: keep last cache, do not overwrite
        return;
      }
      const next = await r.json();
      // shallow validation
      if (next && typeof next === 'object' && next.tickers) {
        cache = next;
        subscribers.forEach(cb => { try { cb(cache); } catch(e){ console.warn('subscriber err', e); } });
      }
    } catch (e) {
      console.warn('[LiveData] poll failed:', e && e.message);
    }
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
