// Trade Approval Popup — auto-executes after 3s countdown
function TradeApproval({pending, onApprove, onReject}) {
  const [countdown, setCountdown] = React.useState(3);
  React.useEffect(()=>{
    if (!pending) return;
    setCountdown(3);
    const t = setInterval(()=>setCountdown(c=>{
      if(c<=1){ clearInterval(t); onApprove(pending); return 0; }
      return c-1;
    }), 1000);
    return ()=>clearInterval(t);
  }, [pending]);
  if (!pending) return null;
  const {symbol, side, size, price, rating, reason, agent} = pending;
  const isBuy = side === 'BUY';
  return (
    <div className="approval-overlay">
      <div className="approval-box frame">
        <div className="approval-header">
          <span className="approval-icon">{isBuy ? '📈' : '📉'}</span>
          <span className="approval-title">{side} {symbol}</span>
          <span className={'approval-badge '+(isBuy?'up':'down')}>{rating}</span>
        </div>
        <div className="approval-body">
          <div className="approval-row"><span>Agent</span><span>{agent}</span></div>
          <div className="approval-row"><span>Size</span><span>{size} {symbol}</span></div>
          <div className="approval-row"><span>Price</span><span>${(price||0).toLocaleString()}</span></div>
          <div className="approval-row"><span>Notional</span><span>${((size||0)*(price||0)).toFixed(2)}</span></div>
          <div className="approval-reason">{reason}</div>
        </div>
        <div className="approval-actions">
          <button className="approval-reject" onClick={onReject}>✕ Cancel</button>
          <button className="approval-approve" onClick={()=>onApprove(pending)}>✓ Execute ({countdown}s)</button>
        </div>
      </div>
    </div>
  );
}
