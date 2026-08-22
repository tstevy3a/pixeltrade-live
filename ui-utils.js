/* ===== Shared display-only helpers ===== */
function rnd(min,max){ return min+Math.random()*(max-min); }
function pick(items){ return items[Math.floor(Math.random()*items.length)]; }
function fmtMoney(value){
  return Number(value).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtSigned(value){
  const number=Number(value);
  const sign=number>=0?'+':'-';
  return sign+Math.abs(number).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtClock(){
  return new Date().toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hour12:false});
}
function out(icon,text,station,taskInc,bubble){
  return {bubble:bubble+'…',balanceDelta:0,pnlDelta:0,taskInc,notif:{ic:icon,text,kind:'plain'}};
}

Object.assign(window,{rnd,pick,fmtMoney,fmtSigned,fmtClock,out});
