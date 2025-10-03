// components/SwapPreviewModal.tsx
import React from 'react'
import { Token } from './TokenSelector'

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  payToken: Token
  rcvToken: Token
  amountIn: string
  amountOutEst: string
  priceLabel: string
  slippagePct: string
  minReceivedLabel: string
  priceImpactLabel: string
}

const tokIcon = (src?: string) => src || '/images/tokens/metamask.png'

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 10000,
  background: 'rgba(10, 12, 16, 0.78)',
  backdropFilter: 'blur(2px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const box: React.CSSProperties = {
  width: 'min(440px, 92vw)',
  borderRadius: 18,
  // NOTE: molto più chiaro del precedente
  background: 'var(--bubblegum)',
  // background: 'linear-gradient(180deg, #F7FBFF 0%, #E9F5FF 100%)',
  border: '1px solid rgba(140,175,235,.65)',
  boxShadow: '0 18px 55px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.30)',
  padding: '20px 16px 18px',
  color: '#0f1622',
  transformOrigin: '50% 50%',
  position: 'relative', // per il glow ::before
}

const head: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '2px 2px 12px',
  marginBottom: 6,
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: '0.2px',
}

const bar: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto auto',
  alignItems: 'center',
  gap: 10,
  background: '#FDFEFF',
  border: '1px solid rgba(160,190,245,.55)',
  borderRadius: 14,
  padding: '12px 12px',
}

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
  marginTop: 14,
}

const cell: React.CSSProperties = {
  background: 'rgba(255,255,255,.88)',
  border: '1px solid rgba(140,175,235,.35)',
  borderRadius: 12,
  padding: '10px 12px',
}

const cellLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  opacity: .8,
  marginBottom: 4,
}

const cellValue: React.CSSProperties = {
  fontSize: 14.5,
  fontWeight: 600,
  letterSpacing: '0.2px',
}

const iconCss: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 999, objectFit: 'cover'
}

const symCss: React.CSSProperties = {
  fontWeight: 600,
  letterSpacing: '0.2px'
}

const labelCss: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 500, opacity: .8
}

const amtCss: React.CSSProperties = {
  justifySelf: 'end',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 600,
}

const btn: React.CSSProperties = {
  width: '100%',
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid rgba(255,215,0,.45)',
  background: 'linear-gradient(180deg, #FFE38A 0%, #E6C24D 100%)',
  color: '#1a1508',
  fontWeight: 700,
  letterSpacing: '0.2px',
  cursor: 'pointer',
  boxShadow: '0 6px 16px rgba(190,140,0,.25), inset 0 0 0 1px rgba(255,255,255,.35)',
}

const cancelBtn: React.CSSProperties = {
  width: '100%',
  marginTop: 8,
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(120,140,170,.45)',
  background: 'rgba(255,255,255,.55)',
  color: '#0f1622',
  fontWeight: 600,
  letterSpacing: '0.2px',
  cursor: 'pointer',
}

const SwapPreviewModal: React.FC<Props> = ({
  open, onClose, onConfirm,
  payToken, rcvToken,
  amountIn, amountOutEst,
  priceLabel, slippagePct, minReceivedLabel, priceImpactLabel
}) => {
  if (!open) return null
  return (
    <div style={overlay} onClick={(e)=>{ if (e.target===e.currentTarget) onClose() }}>
      {/* classi: entrata + glow + sheen */}
      <div style={box} className="bls-preview-in bls-ice-glow bls-ice-sheen" role="dialog" aria-modal="true" aria-label="Confirm Swap">
        {/* Header (sheen oro single-pass) */}
        <div style={head} className="bls-gold-sheen">
          <div>Confirm Swap</div>
          <button
            aria-label="Close"
            onClick={onClose}
            style={{background:'transparent', border:0, fontSize:22, cursor:'pointer', color:'#0f1622', opacity:.75}}
          >×</button>
        </div>

        {/* FROM */}
        <div style={{ ...bar, marginBottom: 8 }}>
          <span style={{display:'flex', alignItems:'center', gap:8}}>
            <img src={tokIcon(payToken.icon)} alt={payToken.symbol} style={iconCss}/>
            <span style={symCss}>{payToken.symbol}</span>
          </span>
          <span style={{ ...labelCss, justifySelf:'start' }}>From</span>
          <span style={amtCss}>{amountIn || '—'}</span>
        </div>

        {/* TO */}
        <div style={bar}>
          <span style={{display:'flex', alignItems:'center', gap:8}}>
            <img src={tokIcon(rcvToken.icon)} alt={rcvToken.symbol} style={iconCss}/>
            <span style={symCss}>{rcvToken.symbol}</span>
          </span>
          <span style={{ ...labelCss, justifySelf:'start' }}>To (estimated)</span>
          <span style={amtCss}>{amountOutEst ? `≈ ${amountOutEst}` : '—'}</span>
        </div>

        {/* DETAILS */}
        <div style={grid}>
          <div style={cell}>
            <div style={cellLabel}>Price</div>
            <div style={cellValue}>{priceLabel || '—'}</div>
          </div>
          <div style={cell}>
            <div style={cellLabel}>Slippage tolerance</div>
            <div style={cellValue}>{slippagePct}</div>
          </div>
          <div style={cell}>
            <div style={cellLabel}>Minimum received</div>
            <div style={cellValue}>{minReceivedLabel || '—'}</div>
          </div>
          <div style={cell}>
            <div style={cellLabel}>Price impact</div>
            <div style={cellValue}>{priceImpactLabel || '—'}</div>
          </div>
        </div>

        <button style={btn} onClick={onConfirm}>Confirm Swap</button>
        <button style={cancelBtn} onClick={onClose}>Cancel</button>

        {/* CSS locale: animazione, glow, sheen */}
        <style jsx>{`
          /* Entrata 0.8s (speculare all’uscita del pannello swap) */
          .bls-preview-in {
            animation: blsSpinGrowIn 0.8s linear forwards;
          }
          @keyframes blsSpinGrowIn {
            0%   { transform: translateZ(-2400px) rotateY(-720deg) scale(0.02); opacity: 0; }
            100% { transform: translateZ(0)       rotateY(0deg)    scale(1);    opacity: 1; }
          }

          /* Glow azzurrino "che respira" (pseudo-elemento) */
          .bls-ice-glow::before {
            content: '';
            position: absolute;
            inset: -10px;
            border-radius: 22px;
            pointer-events: none;
            background:
              radial-gradient(70% 60% at 50% 0%, rgba(190,220,255,.45), rgba(190,220,255,0) 60%),
              radial-gradient(80% 70% at 50% 100%, rgba(170,210,255,.35), rgba(170,210,255,0) 60%);
            filter: blur(14px);
            opacity: .45;
            animation: blsOuterGlow 2.8s ease-in-out infinite alternate;
          }
          @keyframes blsOuterGlow {
            0% { opacity: .30; }
            100% { opacity: .70; }
          }

          /* Sheen diagonale soft e ripetuto */
          .bls-ice-sheen { position: relative; overflow: hidden; }
          .bls-ice-sheen::after {
            content: '';
            position: absolute;
            top: -20%;
            left: -40%;
            width: 60%;
            height: 140%;
            pointer-events: none;
            background: linear-gradient(
              120deg,
              rgba(255,255,255,0) 0%,
              rgba(210,235,255,.35) 45%,
              rgba(255,255,255,0) 90%
            );
            transform: skewX(-25deg) translateX(-120%);
            animation: blsIceSweep 4s ease-in-out 0.6s infinite;
          }
          @keyframes blsIceSweep {
            0%   { transform: skewX(-25deg) translateX(-120%); opacity: 0; }
            25%  { opacity: .35; }
            55%  { opacity: .18; }
            100% { transform: skewX(-25deg) translateX(220%);  opacity: 0; }
          }

          /* sheen oro una sola volta sul titolo */
          .bls-gold-sheen { position: relative; overflow: hidden; }
          .bls-gold-sheen::after {
            content: '';
            position: absolute;
            top: 0; left: -30%;
            width: 30%; height: 100%;
            pointer-events: none;
            background: linear-gradient(120deg, rgba(255,255,255,0) 0%, rgba(255,223,128,.45) 45%, rgba(255,255,255,0) 90%);
            transform: skewX(-25deg);
            animation: blsSheen 1.2s ease-out 0.25s 1 both;
          }
          @keyframes blsSheen {
            0%   { left: -30%; opacity: 0; }
            20%  { opacity: .85; }
            100% { left: 120%; opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  )
}

export default SwapPreviewModal
