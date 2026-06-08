/* ===== Crypto Room — second trading floor for Hyperliquid paper trading ===== */

function CryptoAgent({a, scale, showName, z}) {
  return (
    <div className={'agent' + (a.walking ? ' walking' : '')}
      style={{left: a.pos.x + '%', top: a.pos.y + '%', zIndex: z}}>
      {a.bubble && <div className="bubble">{a.bubble}</div>}
      <div className="shadow" />
      <div className="bobber">
        <PixelSprite map={a.map || TRADER_MAP} scale={scale} flip={a.flip} palette={a.palette || SPRITE_PALETTE} />
      </div>
      {showName && <div className="name-tag" style={{borderColor: a.tint}}>{a.name}</div>}
    </div>
  );
}

function CryptoStation({st, busyAgent, onClick, showLabels, price}) {
  const busy = !!busyAgent;
  const priceText = price != null ? '$' + price.toLocaleString('en-US', {maximumFractionDigits: 2}) : '—';
  return (
    <div className={'station crypto-station' + (st.zone ? ' work' : '') + (busy ? ' busy' : '')}
      style={{left: st.x + '%', top: st.y + '%'}} onClick={() => onClick(st)} title={st.name}>
      <div className="ring"></div>
      <div className="crypto-icon">{st.icon}</div>
      {st.zone && showLabels && <div className="zone-tag">{st.tag}</div>}
      {st.sym && <div className="crypto-price">{st.sym} {priceText}</div>}
      <div className="tip">{st.icon} {st.name}{busy ? ' · busy' : ''}</div>
      {busy && <div className="spark">✦</div>}
    </div>
  );
}

function CryptoRoom({agents, busySet, onStationClick, prices, cryptoMode}) {
  return (
    <div className="stage">
      <div className="room crypto-room" style={{backgroundImage: 'url(assets/room.png)'}}>
        <div className="crypto-mode-banner">
          <span className="mode-pill">🪙 {cryptoMode === 'paper' ? 'PAPER' : 'LIVE'}</span>
          <span className="mode-hint">{cryptoMode === 'paper' ? 'Testnet · simulated orders · $0 risk' : 'Mainnet · real money ⚠️'}</span>
        </div>
        {CRYPTO_STATIONS.map(st => (
          <CryptoStation key={st.id} st={st} busyAgent={busySet[st.id]} onClick={onStationClick}
            showLabels={true} price={st.sym ? prices[st.sym] : null} />
        ))}
        {agents.map(a => (
          <CryptoAgent key={a.id} a={a} scale={3} showName={true} z={100 + Math.round(a.pos.y)} />
        ))}
      </div>
      <div className="room-hint mono">🪙 Click any work zone to send the nearest crypto agent there</div>
    </div>
  );
}

Object.assign(window, { CryptoRoom, CryptoAgent, CryptoStation });
