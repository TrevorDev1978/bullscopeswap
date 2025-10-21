// components/LimitOrdersModal.tsx
import React from 'react'
import Modal from 'react-modal'
import dynamic from 'next/dynamic'

// Lazy per evitare SSR mismatch & window undefined
const LimitTab = dynamic(() => import('./LimitTab'), { ssr: false })

type Props = {
  open: boolean
  onClose: () => void
}

const modalStyles: Modal.Styles = {
  overlay: {
    backgroundColor: 'rgba(0,0,0,.55)',
    zIndex: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    inset: 'unset',
    background: 'linear-gradient(180deg,#ECF3FF 0%, #EAF2FF 100%)',
    border: '1px solid rgba(90,140,210,0.45)',
    borderRadius: 16,
    padding: 18,
    width: 'min(560px, 96vw)',
    color: '#0f1622',
    boxShadow: '0 30px 70px rgba(0,0,0,.45)',
    overflow: 'visible'
  }
}

const LimitOrdersModal: React.FC<Props> = ({ open, onClose }) => {
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
          <h3 className="text-lg font-semibold">Limit Orders</h3>
          <button
            onClick={onClose}
            className="rounded-xl px-2.5 py-1 border border-black/10 hover:bg-black/5"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Contenuto: la tua UI esistente per i limit */}
        <LimitTab />
      </div>

      {/* Keyframes nel caso non fossero già globali */}
      <style jsx global>{`
        @keyframes blsPop {
          0% { transform: scale(.96); opacity: .0 }
          100% { transform: scale(1); opacity: 1 }
        }
      `}</style>
    </Modal>
  )
}

export default LimitOrdersModal
