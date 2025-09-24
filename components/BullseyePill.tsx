import React, { useEffect, useState } from 'react'

const BLSEYE = '0xeAb7c22B8F5111559A2c2B1A3402d3FC713CAc27'

const BullseyePill: React.FC = () => {
  const [price, setPrice] = useState<string>('…')

  useEffect(() => {
    let alive = true
    let t: any

    const fetchPrice = async () => {
      try {
        const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${BLSEYE}`, { cache: 'no-cache' })
        const j = await r.json()
        const pairs = Array.isArray(j.pairs) ? j.pairs : []
        pairs.sort((a: any, b: any) => {
          const ap = (a.chainId === 'pulsechain') ? 0 : 1
          const bp = (b.chainId === 'pulsechain') ? 0 : 1
          if (ap !== bp) return ap - bp
          return Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0)
        })
        const best = pairs[0]
        const usd = best?.priceUsd ? Number(best.priceUsd) : NaN
        let txt = 'N/A'
        if (isFinite(usd)) {
          if (usd >= 1) txt = `$${usd.toFixed(3)}`
          else if (usd >= 0.01) txt = `$${usd.toFixed(4)}`
          else txt = `$${usd.toPrecision(3)}`
        }
        if (alive) setPrice(txt)
      } catch {
        if (alive) setPrice('N/A')
      } finally {
        t = setTimeout(fetchPrice, 45000)
      }
    }

    fetchPrice()
    return () => { alive = false; if (t) clearTimeout(t) }
  }, [])

  return (
    <div id="bullseye-price" title="BLSEYE price (DexScreener)">
      {/* Sinistra: icona + (🎯 via CSS ::after) + ticker */}
      <div className="be-left">
        <span className="be-icon" aria-hidden />
        <span className="be-ticker">BLSEYE</span>
      </div>

      {/* Destra: prezzo */}
      <span className="be-price">{price}</span>
    </div>
  )
}

export default BullseyePill
