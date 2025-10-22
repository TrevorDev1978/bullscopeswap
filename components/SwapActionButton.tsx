import React, { useState } from 'react'
import { useAccount } from 'wagmi'
import PulseXConnectPanel from './PulseXConnectPanel'

type Props = {
  onSwap: () => void
  disabled?: boolean
  labelSwap?: string
}

export default function SwapActionButton({
  onSwap,
  disabled,
  labelSwap = 'Swap',
}: Props) {
  const { isConnected } = useAccount()
  const [open, setOpen] = useState(false)

  if (!isConnected) {
    return (
      <>
        <button
          type="button"
          className="btn-wallet"
          onClick={() => setOpen(true)}
        >
          Connect Wallet
        </button>
        <PulseXConnectPanel open={open} onClose={() => setOpen(false)} />
      </>
    )
  }

  return (
    <button
      type="button"
      className="confirm-btn"
      onClick={onSwap}
      disabled={disabled}
    >
      {labelSwap}
    </button>
  )
}
