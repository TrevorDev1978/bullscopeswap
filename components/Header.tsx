import React, { useMemo, useState } from 'react'
import Image from 'next/image'
import { useAccount, useDisconnect } from 'wagmi'
import BullseyePill from './BullseyePill'
import PulseXConnectPanel from './PulseXConnectPanel'

const style = {
  wrapper: `bls-header px-6 py-4 w-full flex justify-between items-center bg-[#191B1F]/70 shadow-md`,
  headerLeft: `flex items-center gap-3`,
  brand: `bls-brand-title bls-brand-title--header bls-brand-3d`,
  center: `flex-1 flex flex-col items-center justify-center`,
  right: `relative flex items-center gap-3`,
  badge: `btn-wallet px-4`,
  menu: `absolute right-0 top-full mt-2 w-52 rounded-xl border border-white/10 bg-[#0e1117] shadow-xl overflow-hidden`,
  item: `w-full text-left px-3 py-2 hover:bg-white/5 text-sm`,
}

const Header: React.FC = () => {
  const { isConnected, address } = useAccount()
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)

  const short = useMemo(
    () => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect Wallet'),
    [address]
  )

  function hardReset() {
    try {
      const keys = Object.keys(localStorage)
      for (const k of keys) {
        const lk = k.toLowerCase()
        if (lk.includes('wagmi') || lk.includes('wallet') || lk.includes('web3') || lk.includes('walletconnect')) {
          localStorage.removeItem(k)
        }
      }
    } catch {}
    location.reload()
  }

  return (
    <header className={style.wrapper}>
      {/* Left: logo + brand */}
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

      {/* Center: pill */}
      <div className={style.center}>
        <BullseyePill />
      </div>

      {/* Right: connect / account */}
      <div className={style.right}>
        {isConnected ? (
          <>
            <button
              onClick={() => setMenu((m) => !m)}
              className={style.badge}
              aria-expanded={menu}
              aria-haspopup="menu"
            >
              {short}
            </button>
            {menu && (
              <div className={style.menu} role="menu">
                <button className={style.item} onClick={() => setMenu(false)}>Account: {short}</button>
                <button
                  className={style.item}
                  onClick={() => { setMenu(false); disconnect() }}
                >
                  Disconnect
                </button>
                <button
                  className={style.item}
                  onClick={() => { setMenu(false); hardReset() }}
                >
                  Hard Reset (clear cache)
                </button>
              </div>
            )}
          </>
        ) : (
          <button onClick={() => setOpen(true)} className="btn-wallet px-4">
            Connect Wallet
          </button>
        )}
      </div>

      {/* PulseX-like connect panel */}
      <PulseXConnectPanel open={open} onClose={() => setOpen(false)} />
    </header>
  )
}

export default Header
