/* Read-only bridge to the private gateway. Browser code has no execution token. */
(function(){
  const BASE = 'http://127.0.0.1:3456';
  let status = {
    online:false, mode:'OFFLINE', liveArmed:false, engineBusy:false,
    riskStateReady:false, dailyPnl:null, tradesToday:null, portfolio:null, models:[], lastEvent:null,
  };
  const listeners = new Set();
  async function poll(){
    try {
      const response = await fetch(BASE + '/api/status', {cache:'no-store'});
      if(!response.ok) throw new Error('gateway ' + response.status);
      status = {...await response.json(), online:true};
    }catch(_error){
      status = {...status, online:false, mode:'OFFLINE'};
    }
    listeners.forEach(listener=>{ try{ listener({...status}); }catch(_error){} });
  }
  window.PixelGateway = {
    getStatus:()=>({...status}),
    subscribe(listener){ listeners.add(listener); listener({...status}); return()=>listeners.delete(listener); },
  };
  poll();
  setInterval(poll, 5000);
})();
