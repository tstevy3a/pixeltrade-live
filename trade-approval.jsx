// Trade Approval Popup — shown before any live order is sent
function TradeApproval({pending, onApprove, onReject}) {
  if (!pending) return null;
  const {symbol, side, size, price, rating, reason, agent} = pending;
  const notional = (size * price).toFixed(2);
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
          <div className="approval-row"><span>Price</span><span>${price.toLocaleString()}</span></div>
          <div className="approval-row"><span>Notional</span><span>${notional}</span></div>
          <div className="approval-reason">{reason}</div>
        </div>
        <div className="approval-actions">
          <button className="approval-reject" onClick={onReject}>✕ Reject</button>
          <button className="approval-approve" onClick={()=>onApprove(pending)}>✓ Approve</button>
        </div>
      </div>
    </div>
  );
}
