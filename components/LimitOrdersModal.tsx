// components/LimitOrdersModal.tsx
import React, { useState } from 'react'
import Modal from 'react-modal'
import dynamic from 'next/dynamic'
import { useAccount } from 'wagmi'
import { ethers } from 'ethers'

// Lazy per evitare SSR mismatch & window undefined
const LimitTab = dynamic(() => import('./LimitTab'), { ssr: false })
const OrdersPanel = dynamic(() => import('./OrdersPanel'), { ssr: false })

type Props = {
  open: boolean
  onClose: () => void
}

// Indirizzi (uguali a quelli già usati nel progetto)
const LIMIT_ADDRESS = '0xFEa1023F5d52536beFc71c3404E356ae81C82F4B'

const modalStyles: Modal.Styles = {
  overlay: {
    backgroundColor: 'rgba(10,11,13,.70)',
    zIndex: 60,
  },
  content: {
    top: '50%', left: '50%', right: 'auto', bottom: 'auto',
    transform: 'translate(-50%, -50%)',
    background: 'transparent',
    border: 'none',
    padding: 0,
  }
}

const LimitOrdersModal: React.FC<Props> = ({ open, onClose }) => {
  const { address } = useAccount()
  const [showOrders, setShowOrders] = useState(false)

  return (
    <Modal isOpen={open} onRequestClose={onClose} style={modalStyles} ariaHideApp={false}>
      <div className="bls-modal">
        {/* HEADER */}
        <div className="bls-head">
          <div className="bls-title">Limit Order Swap</div>

          <div className="bls-head-actions">
            <button
              className="bls-head-link"
              onClick={() => setShowOrders(v => !v)}
            >
              {showOrders ? '← Create' : 'My Orders'}
            </button>
            <button className="bls-close" aria-label="Close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* BODY */}
        <div className="bls-body">
          {!showOrders ? (
            <LimitTab onPlaced={() => setShowOrders(true)} />
          ) : (
            <OrdersPanel limitAddress={LIMIT_ADDRESS} />
          )}
        </div>
      </div>

      <style jsx>{`
        .bls-modal{
          width: min(560px, 94vw);
          border-radius: 20px;
          overflow: hidden;
          color: #eaf6ff;
          background:
            linear-gradient(180deg, rgba(28,41,58,.78) 0%, rgba(16,25,39,.82) 100%),
            radial-gradient(120% 80% at 0% 0%, rgba(124,200,255,.18) 0%, rgba(124,200,255,0) 60%);
          box-shadow:
            0 24px 60px rgba(0,0,0,.55),
            inset 0 0 0 1px rgba(120,170,240,.22);
          border: 1px solid rgba(100,160,255,.28);
          backdrop-filter: blur(10px);
          animation: blsPop .18s ease-out;
        }
        .bls-head{
          display:flex; align-items:center; justify-content:space-between;
          padding: 14px 14px 8px 18px;
        }
        .bls-title{
          font-weight: 800; letter-spacing: .3px; font-size: 18px;
          background: linear-gradient(90deg, #b6e2ff, #22d3ee);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .bls-head-actions{ display:flex; align-items:center; gap: 10px; }
        .bls-head-link{
          font-weight: 700; font-size: 13px;
          border: 1px solid rgba(255,255,255,.22);
          background: rgba(255,255,255,.06);
          padding: 6px 10px; border-radius: 10px;
          transition: background .15s ease, transform .06s ease;
        }
        .bls-head-link:hover{ background: rgba(255,255,255,.12); }
        .bls-head-link:active{ transform: translateY(1px); }
        .bls-close{
          background: transparent; border: 0; cursor: pointer;
          font-size: 18px; padding: 4px 8px; border-radius: 10px;
          color: rgba(226,242,255,.88);
        }
        .bls-close:hover{ background: rgba(255,255,255,.10); color: #fff; }
        .bls-body{ padding: 10px 14px 16px; }
        @keyframes blsPop{
          0%{ transform: scale(.98); opacity: .0 }
          100%{ transform: scale(1); opacity: 1 }
        }
      `}</style>
    </Modal>
  )
}

export default LimitOrdersModal
