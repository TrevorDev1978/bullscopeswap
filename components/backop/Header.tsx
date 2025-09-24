import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';

/** Pill centrale con il prezzo BLSEYE (DexScreener) */
const BullseyePill: React.FC = () => {
  const [price, setPrice] = useState<string>('…');
  const [dex, setDex] = useState<string | null>(null);

  useEffect(() => {
    let killed = false;
    const TOKEN = '0xeAb7c22B8F5111559A2c2B1A3402d3FC713CAc27';
    async function run() {
      try {
        const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${TOKEN}`, { cache: 'no-cache' });
        const j = await r.json();
        const pairs = Array.isArray(j.pairs) ? j.pairs : [];
        // preferisci pulsechain + volume
        pairs.sort((a: any, b: any) => {
          const ap = a?.chainId === 'pulsechain' ? 0 : 1;
          const bp = b?.chainId === 'pulsechain' ? 0 : 1;
          if (ap !== bp) return ap - bp;
          return Number(b?.volume?.h24 || 0) - Number(a?.volume?.h24 || 0);
        });
        const best = pairs[0];
        const usd = best?.priceUsd ? Number(best.priceUsd) : NaN;
        let txt = 'N/A';
        if (Number.isFinite(usd)) {
          if (usd >= 1) txt = `$${usd.toFixed(3)}`;
          else if (usd >= 0.01) txt = `$${usd.toFixed(4)}`;
          else txt = `$${usd.toPrecision(3)}`;
        }
        if (!killed) {
          setPrice(txt);
          setDex(best?.dexId || null);
        }
      } catch {
        if (!killed) setPrice('N/A');
      }
    }
    run();
    const id = setInterval(run, 45000);
    return () => { killed = true; clearInterval(id); };
  }, []);

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-2 rounded-full"
      style={{
        background: 'rgba(8,14,28,0.45)',
        border: '1px solid rgba(90,130,210,0.40)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.06)',
      }}
      title={dex ? `BLSEYE via ${dex}` : 'BLSEYE'}
    >
      <span
        aria-hidden
        style={{
          width: 20, height: 20,
          background: 'url("/images/bullseye-icon.png") no-repeat center / contain',
          display: 'inline-block',
          filter: 'drop-shadow(0 1px 0 rgba(0,0,0,.5)) drop-shadow(0 0 3px rgba(120,180,255,.25))',
        }}
      />
      <span style={{ fontWeight: 600, letterSpacing: .3 }}>BLSEYE</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{price}</span>
    </div>
  );
};

const style = {
  wrapper: `bls-header px-6 py-4 w-full flex justify-between items-center bg-[#191B1F]/70 shadow-md`,
  headerLeft: `flex items-center gap-3`,
  brand: `bls-brand-title bls-brand-title--header bls-brand-3d`,
  center: `flex-1 flex items-center justify-center`,
  right: `flex items-center gap-3`,
};

const Header: React.FC = () => {
  const { isConnected, address } = useAccount();
  const { openConnectModal } = useConnectModal();

  const short = useMemo(
    () => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect Wallet'),
    [address]
  );

  return (
    <header className={style.wrapper}>
      {/* Sinistra: logo + brand (logo +20% rispetto a 60px → 72px) */}
      <div className={style.headerLeft}>
        <Image src="/images/bullscope-logo.png" alt="Bullscope" width={72} height={72} priority />
        <span className={style.brand}>Bullscope Swap</span>
      </div>

      {/* Centro: PILL prezzo BLSEYE */}
      <div className={style.center}>
        <BullseyePill />
      </div>

      {/* Destra: solo Connect/Account (bottone verde) */}
      <div className={style.right}>
        {isConnected ? (
          <div className="btn-wallet px-4">{short}</div>
        ) : (
          <button onClick={() => openConnectModal?.()} className="btn-wallet px-4">
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
