// components/LimitOrdersModal.tsx
import React, { useMemo, useState, useEffect } from 'react'
import Modal from 'react-modal'
import dynamic from 'next/dynamic'
import { Token } from './TokenSelector'

const LimitTab = dynamic(() => import('./LimitTab'), { ssr: false })
const OrdersPanel = dynamic(() => import('./OrdersPanel'), { ssr: false })

type Prefill = {
  sell: Token
  buy: Token
  amountIn: string
  useCurrentOnOpen?: boolean
}

type Props = {
  open: boolean
  onClose: () => void
  prefill?: Prefill
}

type Tab = 'create' | 'orders'

const modalStyles: Modal.Styles = {
  overlay: {
    backgroundColor: 'rgba(0,0,0,.70)',
    zIndex: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    inset: 'unset',
    padding: 0,
    border: 'none',
    background: 'transparent',
    overflow: 'visible',
  },
}

const cardCss: React.CSSProperties = {
  width: 'min(720px, 96vw)',
  background: 'linear-gradient(180deg,#F3F8FF 0%, #ECF4FF 100%)',
  border: '1px solid rgba(100,150,220,0.55)',
  color: '#0f1622',
  borderRadius: 18,
  padding: 16,
  boxShadow: '0 30px 70px rgba(0,0,0,.45)',
}

const LIMIT_ADDRESS = '0xFEa1023F5d52536beFc71c3404E356ae81C82F4B'

const LimitOrdersModal: React.FC<Props> = ({ open, onClose, prefill }) => {
  const [tab, setTab] = useState<Tab>('create')
  useEffect(() => {
    // Se non c'è prefill apri direttamente My Orders
    if (open && !prefill) setTab('orders')
  }, [open, prefill])
  const headTitle = useMemo(() => 'Limit Order Swap', [])

  return (
    <Modal
      isOpen={open}
      onRequestClose={onClose}
      style={modalStyles}
      closeTimeoutMS={200}
      ariaHideApp={false}
    >
      <div style={{ ...cardCss, animation: 'blsPop .25s cubic-bezier(.16,.84,.44,1)' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{headTitle}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab(tab === 'orders' ? 'create' : 'orders')}
              className="rounded-xl px-3 py-1.5 border border-[rgba(100,150,220,0.65)] bg-[rgba(255,255,255,0.75)] hover:bg-white font-semibold text-[13px]"
              title="View your limit orders"
            >
              {tab === 'orders' ? 'Back' : 'My Orders'}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl px-2.5 py-1 border border-black/10 hover:bg-black/5"
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {tab === 'create' ? (
          <LimitTab prefill={prefill} />
        ) : (
          <OrdersPanel limitAddress={LIMIT_ADDRESS} />
        )}
      </div>

      <style jsx global>{`
        @keyframes blsPop {
          0% { transform: scale(.96); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </Modal>
  )
}

export default LimitOrdersModal
