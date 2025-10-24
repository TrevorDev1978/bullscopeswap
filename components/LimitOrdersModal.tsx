// components/LimitOrdersModal.tsx
import React, { useMemo, useState } from 'react'
import Modal from 'react-modal'
import dynamic from 'next/dynamic'

const LimitTab = dynamic(() => import('./LimitTab'), { ssr: false })
const OrdersPanel = dynamic(() => import('./OrdersPanel'), { ssr: false })

const LIMIT_ADDRESS = '0xFEa1023F5d52536beFc71c3404E356ae81C82F4B'

type Props = { open: boolean; onClose: () => void }

type Tab = 'create' | 'orders'

const modalStyles: Modal.Styles = {
  overlay: {
    backgroundColor: 'rgba(0,0,0,.55)',
    zIndex: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    inset: 'unset',
    background: 'linear-gradient(180deg,#ECF3FF 0%, #EAF2FF 100%)',
    border: '1px solid rgba(90,140,210,0.45)',
    borderRadius: 18,
    padding: 14,
    width: 'min(640px, 96vw)',
    color: '#0f1622',
    boxShadow: '0 30px 70px rgba(0,0,0,.45)',
    overflow: 'visible',
  },
}

const tabBtn: React.CSSProperties = {
  flex: 1,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid rgba(120,170,240,.55)',
  background: 'rgba(255,255,255,.55)',
  fontWeight: 700,
}

const LimitOrdersModal: React.FC<Props> = ({ open, onClose }) => {
  const [tab, setTab] = useState<Tab>('create')
  const headTitle = useMemo(() => (tab === 'create' ? 'Limit Order Swap' : 'My Limit Orders'), [tab])

  return (
    <Modal
      isOpen={open}
      onRequestClose={onClose}
      style={modalStyles}
      closeTimeoutMS={250}
      ariaHideApp={false}
    >
      <div style={{ animation: 'blsPop .35s cubic-bezier(.16,.84,.44,1)' }}>
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
            style={{ ...tabBtn, background: tab === 'create' ? 'linear-gradient(180deg,#FDFEFF,#E9F5FF)' : tabBtn.background as string }}
            onClick={() => setTab('create')}
          >Create</button>
          <button
            style={{ ...tabBtn, background: tab === 'orders' ? 'linear-gradient(180deg,#FDFEFF,#E9F5FF)' : tabBtn.background as string }}
            onClick={() => setTab('orders')}
          >My Orders</button>
        </div>

        {tab === 'create' ? (
          <LimitTab />
        ) : (
          <OrdersPanel limitAddress={LIMIT_ADDRESS} />
        )}
      </div>

      <style jsx global>{`
        @keyframes blsPop { 0% { transform: scale(.96); opacity: .0 } 100% { transform: scale(1); opacity: 1 } }
      `}</style>
    </Modal>
  )
}

export default LimitOrdersModal