import React, { useEffect, useState } from 'react'

const BLSEYE = '0xeAb7c22B8F5111559A2c2B1A3402d3FC713CAc27'

const BullseyePill: React.FC = () => {
  const [price, setPrice] = useState<string>('…')

  useEffect(() => {
    let alive = true
    let timer: any
    const TTL = 60_000

    const readCache = () => {
      try {
        const raw = sessionStorage.getItem('bls_blseye_price')
        if (!raw) return
        const c = JSON.parse(raw)
        if (c?.ts && Date.now() - c.ts < TTL) setPrice(c.val)
      } catch {}
    }
    const writeCache = (val: string) => {
      try { sessionStorage.setItem('bls_blseye_price', JSON.stringify({ val, ts: Date.now() })) } catch {}
    }

    const fmt = (usd: number) => {
      if (!isFinite(usd)) return 'N/A'
      if (usd >= 1) return `$${usd.toFixed(3)}`
      if (usd >= 0.01) return `$${usd.toFixed(4)}`
      return `$${usd.toPrecision(3)}`
    }

    const fetchOnce = async () => {
      try {
        const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${BLSEYE}`, { cache: 'no-cache' })
        const j = await r.json()
        const pairs = Array.isArray(j.pairs) ? j.pairs : []
        // scegli la migliore senza sort
        let best: any | null = null
        for (const p of pairs) {
          const prio = (p?.chainId === 'pulsechain') ? 0 : 1
          const vol  = Number(p?.volume?.h24 || 0)
          if (!best) best = { prio, vol, row: p }
          else if (prio < best.prio || (prio === best.prio && vol > best.vol)) best = { prio, vol, row: p }
        }
        const usd = Number(best?.row?.priceUsd)
        const txt = fmt(usd)
        if (alive) setPrice(txt)
        writeCache(txt)
      } catch {
        if (alive) setPrice('N/A')
      }
    }

    const schedule = () => {
      if (!alive) return
      if (document.hidden) { timer = setTimeout(schedule, 2000); return } // pausa quando tab nascosta
      timer = setTimeout(async () => { await fetchOnce(); schedule() }, TTL)
    }

    readCache()
    fetchOnce()
    schedule()

    const onVis = () => {
      if (!document.hidden) {
        clearTimeout(timer)
        fetchOnce().finally(schedule)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
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
