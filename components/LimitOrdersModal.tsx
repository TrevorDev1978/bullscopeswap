import React, { useState } from 'react'
import Modal from 'react-modal'
import LimitTab from './LimitTab'
import OrdersPanel from './OrdersPanel'
import { Token } from './TokenSelector'

type Prefill = {
  sell: Token
  buy: Token
  amountIn: string
  useCurrentOnOpen?: boolean
}
type Props = { open: boolean; onClose: () => void; prefill?: Prefill }

const LIMIT_ADDRESS = '0xFEa1023F5d52536beFc71c3404E356ae81C82F4B'

const modalStyles: Modal.Styles = {
  overlay: {
    backgroundColor: 'rgba(10, 11, 13, 0.75)',
    zIndex: 60,
    // ⬇️ centra sempre
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    inset: 'unset',
    width: 'min(760px, 96vw)',
    padding: 16,
    borderRadius: 18,
    background: '#0f131b',
    border: '1px solid rgba(120,170,240,.35)',
    color: '#eaf6ff',
    boxShadow: '0 30px 70px rgba(0,0,0,.55)',
    overflow: 'visible',
  },
}

const LimitOrdersModal: React.FC<Props> = ({ open, onClose, prefill }) => {
  const [showOrders, setShowOrders] = useState(false)

  return (
    <Modal isOpen={open} onRequestClose={onClose} style={modalStyles} ariaHideApp={false}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-extrabold tracking-wide"
            style={{ color:'#bfe5ff', textShadow:'0 0 10px rgba(124,200,255,.25)' }}>
          Limit Order Swap
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOrders(s => !s)}
            className="px-3 py-1.5 rounded-xl border border-[rgba(120,170,240,.45)]
                       bg-[rgba(255,255,255,.06)] hover:bg-[rgba(255,255,255,.12)]
                       font-semibold" title="View your orders">
            My Orders
          </button>
          <button onClick={onClose}
                  className="px-2 py-1 rounded-xl border border-white/10 hover:bg-white/10">✕</button>
        </div>
      </div>

      {!showOrders ? (
        <LimitTab prefill={prefill} />
      ) : (
        <div className="mt-1">
          <OrdersPanel limitAddress={LIMIT_ADDRESS} />
        </div>
      )}
    </Modal>
  )
}

export default LimitOrdersModal
