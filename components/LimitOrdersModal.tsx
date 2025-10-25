// components/LimitOrdersModal.tsx
import React, { useMemo, useState } from 'react'
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
    padding: 14,
    border: 'none',
    background: 'transparent',
    overflow: 'visible',
  },
}

const cardCss: React.CSSProperties = {
  width: 'min(680px, 96vw)',
  background: 'linear-gradient(180deg,#ECF3FF 0%, #EAF2FF 100%)',
  border: '1px solid rgba(90,140,210,0.45)',
  color: '#0f1622',
  borderRadius: 18,
  padding: 14,
  boxShadow: '0 30px 70px rgba(0,0,0,.45)',
}

const tabBtn: React.CSSProperties = {
  flex: 1,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid rgba(120,170,240,.55)',
  background: 'rgba(255,255,255,.55)',
  fontWeight: 700,
}

const LIMIT_ADDRESS = '0xFEa1023F5d52536beFc71c3404E356ae81C82F4B'

const LimitOrdersModal: React.FC<Props> = ({ open, onClose, prefill }) => {
  const [tab, setTab] = useState<Tab>('create')
  const headTitle = useMemo(
    () => (tab === 'create' ? 'Limit Order Swap' : 'My Limit Orders'),
    [tab]
  )

  return (
    <Modal
      isOpen={open}
      onRequestClose={onClose}
      style={modalStyles}
      closeTimeoutMS={200}
      ariaHideApp={false}
    >
      <div style={{ ...cardCss, animation: 'blsPop .25s cubic-bezier(.16,.84,.44,1)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">{headTitle}</h3>
          <button
            onClick={onClose}
            className="rounded-xl px-2.5 py-1 border border-black/10 hover:bg-black/5"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          <button
            style={{
              ...tabBtn,
              background:
                tab === 'create'
                  ? 'linear-gradient(180deg,#FDFEFF,#E9F5FF)'
                  : (tabBtn.background as string),
            }}
            onClick={() => setTab('create')}
          >
            Create
          </button>
          <button
            style={{
              ...tabBtn,
              background:
                tab === 'orders'
                  ? 'linear-gradient(180deg,#FDFEFF,#E9F5FF)'
                  : (tabBtn.background as string),
            }}
            onClick={() => setTab('orders')}
          >
            My Orders
          </button>
        </div>

        {tab === 'create' ? (
          <LimitTab prefill={prefill} />
        ) : (
          <OrdersPanel limitAddress={LIMIT_ADDRESS} />
        )}
      </div>

      <style jsx global>{`
        @keyframes blsPop {
          0% {
            transform: scale(0.96);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </Modal>
  )
}

export default LimitOrdersModal
