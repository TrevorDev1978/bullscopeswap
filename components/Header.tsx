import React, { useMemo, useState } from 'react'
import Image from 'next/image'
import { useAccount } from 'wagmi'
import BullseyePill from './BullseyePill'
import PulseXConnectPanel from './PulseXConnectPanel'

const style = {
  wrapper: `bls-header px-6 py-4 w-full flex justify-between items-center bg-[#191B1F]/70 shadow-md`,
  headerLeft: `flex items-center gap-3`,
  brand: `bls-brand-title bls-brand-title--header bls-brand-3d`,
  center: `flex-1 flex flex-col items-center justify-center`,
  right: `flex items-center gap-3`,
}

const Header: React.FC = () => {
  const { isConnected, address } = useAccount()
  const [open, setOpen] = useState(false)

  const short = useMemo(
    () =>
      address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect Wallet',
    [address]
  )

  return (
    <header className={style.wrapper}>
      {/* Sinistra: logo + brand */}
      <div className={style.headerLeft}>
        <Image
          src="/images/bullscope-logo.png"
          alt="Bullscope"
          width={76}
          height={76}
          priority
        />
        <span className={style.brand}>Bullscope Swap</span>
      </div>

      {/* Centro: solo la Pill brand */}
      <div className={style.center}>
        <BullseyePill />
      </div>

      {/* Destra: Connect/Account */}
      <div className={style.right}>
        {isConnected ? (
          <div className="btn-wallet px-4">{short}</div>
        ) : (
          <button onClick={() => setOpen(true)} className="btn-wallet px-4">
            Connect Wallet
          </button>
        )}
      </div>

      {/* 🔹 Pannello identico a PulseX */}
      <PulseXConnectPanel open={open} onClose={() => setOpen(false)} />
    </header>
  )
}

export default Header
