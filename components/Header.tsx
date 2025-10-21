import React, { useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import BullseyePill from './BullseyePill' // 👈 esterno

const style = {
  wrapper: `bls-header px-6 py-4 w-full flex justify-between items-center bg-[#191B1F]/70 shadow-md`,
  headerLeft: `flex items-center gap-3`,
  brand: `bls-brand-title bls-brand-title--header bls-brand-3d`,
  center: `flex-1 flex flex-col items-center justify-center`,
  right: `flex items-center gap-3`,
}

const Header: React.FC = () => {
  const { isConnected, address } = useAccount()
  const { openConnectModal } = useConnectModal()

  const short = useMemo(
    () => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect Wallet'),
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

      {/* Centro: Pill + mini toggle Swap / Limit */}
      <div className={style.center}>
        <BullseyePill />
        <nav className="flex items-center gap-2 mt-1">
          <Link href="/">
            <span className="pill">Swap</span>
          </Link>
          <Link href="/limit">
            <span className="pill">Limit</span>
          </Link>
        </nav>
      </div>

      {/* Destra: Connect/Account */}
      <div className={style.right}>
        {isConnected ? (
          <div className="btn-wallet px-4">{short}</div>
        ) : (
          <button onClick={() => openConnectModal?.()} className="btn-wallet px-4">
            Connect Wallet
          </button>
        )}
      </div>

      <style jsx>{`
        .pill {
          padding: 6px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.06);
          font-size: 12px;
          transition: background 0.15s ease;
        }
        .pill:hover {
          background: rgba(255, 255, 255, 0.12);
        }
      `}</style>
    </header>
  )
}

export default Header
