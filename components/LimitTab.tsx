// components/LimitTab.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import TokenSelector, { DEFAULT_TOKENS, Token } from './TokenSelector'
import { AiOutlineDown } from 'react-icons/ai'
import { ethers } from 'ethers'

/* ====== Chain & Router ====== */
const RPC_URL = 'https://rpc.pulsechain.com'
const PULSE_CHAIN_HEX = '0x171'
const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'
const LIMIT_ADDRESS = '0xFEa1023F5d52536beFc71c3404E356ae81C82F4B'

/* ====== ABIs minimi ====== */
const ABI_LIMIT = [
  'function placeOrderERC20(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 expiry) payable returns (uint256)',
  'function placeOrderPLS(address tokenOut,uint256 minOut,uint256 expiry) payable returns (uint256)',
]
const ABI_ERC20 = [
  'function decimals() view returns (uint8)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
]

/* ====== Helpers ====== */
const SELECTOR = { decimals: '0x313ce567' }
const hexToBigInt = (hex: string) => (!hex || hex === '0x' ? 0n : BigInt(hex))
const parseUnitsBI = (s: string, decimals = 18) => {
  const [i, f = ''] = s.replace(/,/g, '').replace(',', '.').split('.')
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(i || '0') * (10n ** BigInt(decimals)) + BigInt(frac || '0')
}
const formatUnitsBI = (v: bigint, decimals = 18, maxFrac = 6) => {
  const neg = v < 0n
  const av = neg ? -v : v
  const base = 10n ** BigInt(decimals)
  const ip = av / base
  let fp = (av % base).toString().padStart(decimals, '0')
  if (maxFrac >= 0) fp = fp.slice(0, maxFrac)
  fp = fp.replace(/0+$/, '')
  return (neg ? '-' : '') + ip.toString() + (fp ? '.' + fp : '')
}

async function ethCall(to: string, data: string) {
  try {
    if ((window as any)?.ethereum) {
      const cid = await (window as any).ethereum.request({ method: 'eth_chainId' })
      if (cid === PULSE_CHAIN_HEX) {
        return (await (window as any).ethereum.request({
          method: 'eth_call',
          params: [{ to, data }, 'latest'],
        })) as string
      }
    }
  } catch {}
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  })
  const j = await r.json()
  if (j?.error) throw new Error(j.error.message || 'eth_call failed')
  return j.result as string
}
async function getTokenDecimals(addr: string) {
  if (addr === 'native') return 18
  const res = await ethCall(addr, SELECTOR.decimals)
  const n = parseInt(res, 16)
  return Number.isFinite(n) ? n : 18
}

/* ====== Prezzi: DEXTools (se KEY) -> Dexscreener (fallback) ====== */
const DEXT_KEY = process.env.NEXT_PUBLIC_DEXTOOLS_KEY || ''
const _dxtCache: Record<string, { ts: number; usd: number }> = {}
const _dsCache: Record<string, { ts: number; usd: number }> = {}
const DXT_TTL = 30_000
const DS_TTL = 60_000

async function dextoolsUsd(addr: string): Promise<number | null> {
  if (!DEXT_KEY) return null
  const a = addr.toLowerCase()
  const now = Date.now()
  const c = _dxtCache[a]
  if (c && now - c.ts < DXT_TTL) return c.usd
  try {
    const r = await fetch(`https://api.dextools.io/v2/token/pulsechain/${a}`, {
      headers: { 'X-API-Key': DEXT_KEY },
      cache: 'no-cache',
    })
    if (!r.ok) return null
    const j: any = await r.json()
    const usd = parseFloat(j?.data?.priceUsd ?? j?.data?.price ?? '0') || 0
    if (!(usd > 0)) return null
    _dxtCache[a] = { ts: now, usd }
    return usd
  } catch {
    return null
  }
}

async function dexscreenerUsd(addr: string): Promise<number> {
  const a = addr.toLowerCase()
  const now = Date.now()
  const c = _dsCache[a]
  if (c && now - c.ts < DS_TTL) return c.usd
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${a}`, {
      cache: 'no-cache',
    })
    const j: any = await r.json()
    const pairs: any[] = Array.isArray(j?.pairs) ? j.pairs : []
    const best =
      pairs.find((p: any) => String(p?.chainId || '').toLowerCase().includes('pulse')) ||
      pairs[0]
    const usd = parseFloat(best?.priceUsd || '0') || 0
    _dsCache[a] = { ts: now, usd }
    return usd
  } catch {
    return 0
  }
}

/** rapporto (buy per 1 sell) in termini di USD */
async function ratioBuyPerSellUSD(tokenIn: string, tokenOut: string) {
  // preferisci DEXTools se entrambi disponibili
  const inDXT = await dextoolsUsd(tokenIn)
  const outDXT = await dextoolsUsd(tokenOut)
  if (inDXT && outDXT && inDXT > 0 && outDXT > 0) return outDXT / inDXT
  // fallback dexscreener
  const [inDS, outDS] = await Promise.all([dexscreenerUsd(tokenIn), dexscreenerUsd(tokenOut)])
  if (inDS > 0 && outDS > 0) return outDS / inDS
  return 0
}

/* ====== Prefill type ====== */
type Prefill = {
  sell: Token
  buy: Token
  amountIn: string
  useCurrentOnOpen?: boolean
}

type Props = {
  prefill?: Prefill
  onPlaced?: (id?: number) => void
}

/* ====== UI styles ====== */
const style = {
  box: `relative my-3 rounded-2xl p-4 text-xl flex justify-between items-center border`,
  input: `bg-transparent placeholder:text-[#B2B9D2] outline-none w-full text-3xl text-white text-right`,
}

const LimitTab: React.FC<Props> = ({ prefill, onPlaced }) => {
  // === stato iniziale (prefill o default)
  const [sell, setSell] = useState<Token>(
    prefill?.sell || DEFAULT_TOKENS.find((t) => t.symbol === 'PLS')!
  )
  const [buy, setBuy] = useState<Token>(
    prefill?.buy || DEFAULT_TOKENS.find((t) => t.symbol === 'BLSEYE')!
  )
  const [amountIn, setAmountIn] = useState<string>(prefill?.amountIn || '')

  // target & out
  const [targetPrice, setTargetPrice] = useState<string>('') // buy per 1 sell
  const [amountOutView, setAmountOutView] = useState<string>('')

  // selector
  const [selOpen, setSelOpen] = useState(false)
  const [selSide, setSelSide] = useState<'sell' | 'buy'>('sell')
  const openSel = (s: 'sell' | 'buy') => {
    setSelSide(s)
    setSelOpen(true)
  }
  const onSelect = (t: Token) => {
    ;(selSide === 'sell' ? setSell : setBuy)(t)
  }

  // se cambia il prefill (ri-apertura dal Main), riallinea
  useEffect(() => {
    if (!prefill) return
    setSell(prefill.sell)
    setBuy(prefill.buy)
    setAmountIn(prefill.amountIn || '')
    setTargetPrice('')
    setAmountOutView('')
    didAutofill.current = false
  }, [prefill?.sell?.address, prefill?.buy?.address, prefill?.amountIn])

  // ====== Current price (aggiorna ogni 30s) ======
  const [refPrice, setRefPrice] = useState<number>(0)
  const [refSrc, setRefSrc] = useState<string>('—')
  useEffect(() => {
    let alive = true
    let timer: any
    const update = async () => {
      const aIn = sell.address === 'native' ? WPLS : sell.address
      const aOut = buy.address === 'native' ? WPLS : buy.address
      const r = await ratioBuyPerSellUSD(aIn, aOut)
      if (!alive) return
      setRefPrice(r)
      setRefSrc(DEXT_KEY ? 'DEXTools/Dexscreener' : 'Dexscreener')
    }
    const loop = () => {
      timer = setTimeout(async () => {
        await update()
        loop()
      }, 30_000)
    }
    update()
    loop()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [sell.address, buy.address])

  // Autofill: alla prima volta che refPrice > 0, se richiesto, imposta target = current
  const didAutofill = useRef(false)
  useEffect(() => {
    if (didAutofill.current) return
    // vogliamo auto-impostare solo se veniamo da Main con campi compilati
    if (prefill && prefill.useCurrentOnOpen === false) return
    if (refPrice > 0) {
      didAutofill.current = true
      setTargetPrice(refPrice.toLocaleString('en-US', { maximumFractionDigits: 12 }))
    }
  }, [refPrice, prefill])

  // calcolo live amountOut = amountIn * targetPrice
  useEffect(() => {
    const q = parseFloat((amountIn || '0').replace(',', '.'))
    const p = parseFloat((targetPrice || '0').replace(',', '.'))
    if (q > 0 && p > 0) {
      setAmountOutView((q * p).toLocaleString('en-US', { maximumFractionDigits: 12 }))
    } else setAmountOutView('')
  }, [amountIn, targetPrice])

  // quick buttons: usa current * moltiplicatore
  const setFromRef = (mult: number) => {
    if (!refPrice || refPrice <= 0) return
    const p = refPrice * mult
    setTargetPrice(p.toLocaleString('en-US', { maximumFractionDigits: 12 }))
  }

  // ====== PLACE ORDER ======
  async function place() {
    if (!(window as any).ethereum) return
    // chain
    try {
      const cid = await (window as any).ethereum.request({ method: 'eth_chainId' })
      if (cid !== PULSE_CHAIN_HEX) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: PULSE_CHAIN_HEX }],
          })
        } catch {}
      }
    } catch {}

    const E: any = ethers as any
    const provider = E.BrowserProvider
      ? new E.BrowserProvider((window as any).ethereum)
      : new E.providers.Web3Provider((window as any).ethereum)
    const signer = provider.getSigner ? await provider.getSigner() : await provider.getSigner(0)
    const user = await (signer.getAddress ? signer.getAddress() : signer._address)

    const [inDec, outDec] = await Promise.all([
      getTokenDecimals(sell.address === 'native' ? WPLS : sell.address),
      getTokenDecimals(buy.address === 'native' ? WPLS : buy.address),
    ])

    const _amountIn = parseUnitsBI(amountIn || '0', sell.address === 'native' ? 18 : inDec)
    const px = parseFloat((targetPrice || '0').replace(',', '.'))
    if (_amountIn <= 0n || !(px > 0)) return

    // minOut = amountIn * targetPrice, in outDec
    // evito float: uso 12 decimali temporanei
    const mult = BigInt(Math.floor(px * 1e12))
    const _minOut = (_amountIn * mult) / BigInt(1e12)

    const limit = new E.Contract(LIMIT_ADDRESS, ABI_LIMIT, signer)

    if (sell.address === 'native') {
      const tx = await limit.placeOrderPLS(
        buy.address === 'native' ? WPLS : buy.address,
        _minOut,
        Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 giorni
        { value: _amountIn }
      )
      await tx.wait()
    } else {
      const erc20 = new E.Contract(sell.address, ABI_ERC20, signer)
      const allowance = await erc20.allowance(user, LIMIT_ADDRESS)
      const allowanceBI =
        allowance?._isBigNumber || allowance?._hex
          ? BigInt(allowance._hex || '0x0')
          : BigInt(allowance ?? 0)
      if (allowanceBI < _amountIn) {
        const txA = await erc20.approve(LIMIT_ADDRESS, _amountIn)
        await txA.wait()
      }
      const tx = await limit.placeOrderERC20(
        sell.address,
        buy.address === 'native' ? WPLS : buy.address,
        _amountIn,
        _minOut,
        Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
      )
      await tx.wait()
    }
    setAmountIn('')
    setTargetPrice('')
    setAmountOutView('')
    onPlaced?.()
  }

  const priceHint =
    refPrice > 0
      ? `${refPrice.toLocaleString('en-US', { maximumFractionDigits: 10 })} ${buy.symbol} / ${sell.symbol}`
      : '—'

  const placeDisabled = !amountIn || !targetPrice || !(parseFloat(amountOutView || '0') > 0)

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Header barra */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-[40px] rounded-xl border border-[rgba(120,170,240,.55)] bg-[rgba(255,255,255,.06)] backdrop-blur-[6px] flex items-center justify-center font-semibold">
          Limit Order Swap
        </div>
      </div>

      {/* You sell */}
      <div className={`${style.box} bg-[#20242A] border-[#2A2F36] hover:border-[#41444F]`}>
        <div className="row-title">You sell</div>
        <button className="token-select token-select--clean" onClick={() => openSel('sell')}>
          <img className="token-icon" src={sell.icon || '/images/no-token.png'} alt={sell.symbol} />
          <span className="token-ticker">{sell.symbol}</span>
          <AiOutlineDown className="token-chevron" style={{ opacity: 0.9, fontSize: 14, marginLeft: 6 }} />
        </button>
        <input
          className={style.input}
          inputMode="decimal"
          placeholder="0.0"
          value={amountIn}
          onChange={(e) => setAmountIn(e.target.value)}
        />
      </div>

      {/* You buy (solo display, si aggiorna in tempo reale) */}
      <div className={`${style.box} bg-[#20242A] border-[#2A2F36] hover:border-[#41444F]`}>
        <div className="row-title">You buy</div>
        <button className="token-select token-select--clean" onClick={() => openSel('buy')}>
          <img className="token-icon" src={buy.icon || '/images/no-token.png'} alt={buy.symbol} />
          <span className="token-ticker">{buy.symbol}</span>
          <AiOutlineDown className="token-chevron" style={{ opacity: 0.9, fontSize: 14, marginLeft: 6 }} />
        </button>
        <div className="text-right opacity-90 pr-1">{amountOutView || '—'}</div>
      </div>

      {/* Target Price */}
      <div className="rounded-2xl border border-[rgba(120,170,240,.55)] p-4 bg-[rgba(255,255,255,.06)] backdrop-blur-[6px]">
        <div className="flex items-center justify-between mb-2">
          <div className="dim">Target price</div>
          <div className="text-sm opacity-90">
            Current price: {priceHint} <span className="opacity-60">({refSrc})</span>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 outline-none"
            placeholder={`${buy.symbol} per ${sell.symbol}`}
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
          />
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">
          <button className="pill" onClick={() => setFromRef(1)}>Use current</button>
          <button className="pill" onClick={() => setFromRef(0.98)}>-2%</button>
          <button className="pill" onClick={() => setFromRef(0.95)}>-5%</button>
          <button className="pill" onClick={() => setFromRef(0.90)}>-10%</button>
          <button className="pill" onClick={() => setFromRef(0.80)}>-20%</button>
          <button className="pill" onClick={() => setFromRef(1.02)}>+2%</button>
          <button className="pill" onClick={() => setFromRef(1.05)}>+5%</button>
          <button className="pill" onClick={() => setFromRef(1.10)}>+10%</button>
          <button className="pill" onClick={() => setFromRef(1.20)}>+20%</button>
        </div>
      </div>

      {/* CTA */}
      <div className="actions mt-4">
        <button className="confirm-btn w-full disabled:opacity-50" disabled={placeDisabled} onClick={place}>
          Place Limit Order
        </button>
      </div>

      {/* Selector */}
      <TokenSelector
        open={selOpen}
        side={selSide === 'sell' ? 'pay' : 'receive'}
        onClose={() => setSelOpen(false)}
        onSelect={onSelect}
        excludeAddress={selSide === 'sell' ? (buy.address || '') : (sell.address || '')}
      />

      <style jsx>{`
        .row-title {
          position: absolute;
          top: 10px;
          left: 14px;
          font-size: 12px;
          opacity: 0.8;
        }
        .token-select {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid rgba(120, 170, 240, 0.55);
          background: rgba(255, 255, 255, 0.06);
        }
        .token-icon {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          object-fit: cover;
        }
        .pill {
          padding: 6px 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.06);
        }
      `}</style>
    </div>
  )
}

export default LimitTab
