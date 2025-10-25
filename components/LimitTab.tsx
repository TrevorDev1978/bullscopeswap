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
const addrParam = (addr: string) => ('0'.repeat(24) + addr.toLowerCase().replace(/^0x/, ''))
const hexToBigInt = (hex: string) => (!hex || hex === '0x' ? 0n : BigInt(hex))
const parseUnitsBI = (s: string, decimals = 18) => {
  const [i, f = ''] = s.replace(/,/g, '').replace(',', '.').split('.')
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(i || '0') * (10n ** BigInt(decimals)) + BigInt(frac || '0')
}
const formatUnitsBI = (v: bigint, decimals = 18, maxFrac = 6) => {
  const neg = v < 0n; const av = neg ? -v : v
  const base = 10n ** BigInt(decimals)
  const ip = av / base
  let fp = (av % base).toString().padStart(decimals, '0')
  if (maxFrac >= 0) fp = fp.slice(0, maxFrac)
  fp = fp.replace(/0+$/, '')
  return (neg ? '-' : '') + ip.toString() + (fp ? '.' + fp : '')
}

/* ====== eth_call safe ====== */
async function ethCall(to: string, data: string) {
  try {
    if ((window as any).ethereum) {
      const cid = await (window as any).ethereum.request({ method: 'eth_chainId' })
      if (cid === PULSE_CHAIN_HEX) {
        return await (window as any).ethereum.request({
          method: 'eth_call', params: [{ to, data }, 'latest'],
        }) as string
      }
    }
  } catch {}
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_call', params:[{to, data}, 'latest'] }),
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

/* ====== Current price (Dexscreener USD) ======
   Ritorna SEMPRE: 1 sell = X buy  (X = outUsd / inUsd) */
const DS_TTL = 60_000
const _usdCache: Record<string, { ts: number; v: number }> = {}
async function usdPrice(addr: string): Promise<number> {
  const key = addr.toLowerCase()
  const now = Date.now()
  const c = _usdCache[key]
  if (c && now - c.ts < DS_TTL) return c.v
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${key}`)
  const j = await r.json()
  const pairs: any[] = Array.isArray(j?.pairs) ? j.pairs : []
  const best = pairs.find(p => String(p?.chainId || '').toLowerCase().includes('pulse')) || pairs[0]
  const v = Number.parseFloat(best?.priceUsd ?? '0') || 0
  _usdCache[key] = { ts: now, v }
  return v
}
async function refRatioBuyPerSellUSD(tokenIn: string, tokenOut: string): Promise<number> {
  // 1 sell (tokenIn) => ? buy (tokenOut)
  const [inUsd, outUsd] = await Promise.all([
    usdPrice(tokenIn), usdPrice(tokenOut),
  ])
  if (inUsd > 0 && outUsd > 0) return outUsd / inUsd
  return 0
}

/* ====== Props ====== */
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

/* ====== Component ====== */
const LimitTab: React.FC<Props> = ({ prefill, onPlaced }) => {
  // Stato base (con prefill)
  const [sell, setSell] = useState<Token>(prefill?.sell || DEFAULT_TOKENS.find(t=>t.symbol==='PLS')!)
  const [buy,  setBuy ] = useState<Token>(prefill?.buy  || DEFAULT_TOKENS.find(t=>t.symbol==='BLSEYE')!)
  const [amountIn, setAmountIn] = useState<string>(prefill?.amountIn || '')

  // Target price (buy per 1 sell) e amountOut derivato
  const [targetPrice, setTargetPrice] = useState<string>('') // stringa input
  const [amountOut,  setAmountOut ] = useState<string>('')   // view-only

  // Se il prefill cambia (riapertura), riallinea tutto (target sarà impostato su "Use current" appena arriva la ref)
  useEffect(() => {
    if (!prefill) return
    setSell(prefill.sell)
    setBuy(prefill.buy)
    setAmountIn(prefill.amountIn || '')
    setTargetPrice('')
    setAmountOut('')
    didAutofillRef.current = false
  }, [prefill?.sell?.address, prefill?.buy?.address, prefill?.amountIn])

  // Selector
  const [selOpen, setSelOpen] = useState(false)
  const [selSide, setSelSide] = useState<'sell'|'buy'>('sell')
  const openSel = (s:'sell'|'buy') => { setSelSide(s); setSelOpen(true) }
  const onSelect = (t: Token) => { (selSide==='sell'?setSell:setBuy)(t) }

  // ====== Current price (coerente con definizione "buy per sell") ======
  const [ref, setRef] = useState<{v:number, src:string}>({ v:0, src:'Dexscreener' })
  useEffect(() => {
    let alive = true, timer:any
    const aIn  = (sell.address === 'native' ? WPLS : sell.address)
    const aOut = (buy.address  === 'native' ? WPLS : buy.address)
    const update = async () => {
      const r = await refRatioBuyPerSellUSD(aIn, aOut) // <- outUsd / inUsd
      if (alive) setRef({ v: r, src: 'Dexscreener' })
    }
    update()
    const loop = () => { timer = setTimeout(async () => { await update(); loop() }, DS_TTL) }
    loop()
    const onVis = () => { if (!document.hidden) { clearTimeout(timer); update().finally(loop) } }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [sell.address, buy.address])

  // ====== All'apertura: Target = Current ======
  const didAutofillRef = useRef(false)
  useEffect(() => {
    if (didAutofillRef.current) return
    if (prefill && prefill.useCurrentOnOpen === false) return
    if (ref.v > 0) {
      didAutofillRef.current = true
      setTargetPrice(ref.v.toLocaleString('en-US', { maximumFractionDigits: 12 }))
    }
  }, [ref.v, prefill])

  // ====== Deriva sempre You receive = amountIn × targetPrice ======
  useEffect(() => {
    const q = Number.parseFloat((amountIn || '0').replace(',', '.'))
    const p = Number.parseFloat((targetPrice || '0').replace(',', '.'))
    if (q > 0 && p > 0) setAmountOut((q * p).toLocaleString('en-US', { maximumFractionDigits: 12 }))
    else setAmountOut('')
  }, [amountIn, targetPrice])

  // Quick set: percentuali sul current
  const setFromRef = (mult: number) => {
    if (!(ref.v > 0)) return
    const v = ref.v * mult
    setTargetPrice(v.toLocaleString('en-US', { maximumFractionDigits: 12 }))
  }

  // ====== PLACE ORDER ======
  async function place() {
    if (!(window as any).ethereum) return
    try {
      const cid = await (window as any).ethereum.request({ method: 'eth_chainId' })
      if (cid !== PULSE_CHAIN_HEX) {
        try {
          await (window as any).ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: PULSE_CHAIN_HEX }] })
        } catch {}
      }
    } catch {}

    const E: any = ethers as any
    const provider = E.BrowserProvider ? new E.BrowserProvider((window as any).ethereum) : new E.providers.Web3Provider((window as any).ethereum)
    const signer = provider.getSigner ? await provider.getSigner() : await provider.getSigner(0)
    const user = await signer.getAddress()

    const [inDec, outDec] = await Promise.all([
      getTokenDecimals(sell.address === 'native' ? WPLS : sell.address),
      getTokenDecimals(buy.address  === 'native' ? WPLS : buy.address),
    ])

    const _amountIn = parseUnitsBI(amountIn || '0', sell.address === 'native' ? 18 : inDec)
    const px = Number.parseFloat((targetPrice || '0').replace(',', '.'))
    if (_amountIn <= 0n || !(px > 0)) return

    // minOut = amountIn × targetPrice
    // attenzione ai decimali di out
    // calcoliamo in fixed 1e12 per evitare float
    const mult = BigInt(Math.floor(px * 1e12))
    const _minOut = (_amountIn * mult) / BigInt(1e12)

    const limit = new E.Contract(LIMIT_ADDRESS, ABI_LIMIT, signer)
    const expiry = Math.floor(Date.now()/1000) + 60*60*24*30 // 30 giorni

    if (sell.address === 'native') {
      const tx = await limit.placeOrderPLS(buy.address === 'native' ? WPLS : buy.address, _minOut, expiry, { value: _amountIn })
      await tx.wait()
    } else {
      // approve se necessario
      const erc20 = new E.Contract(sell.address, ABI_ERC20, signer)
      const allowance = await erc20.allowance(user, LIMIT_ADDRESS)
      const allowanceBI = (allowance?._hex ? BigInt(allowance._hex) : BigInt(allowance || 0))
      if (allowanceBI < _amountIn) {
        const txA = await erc20.approve(LIMIT_ADDRESS, _amountIn)
        await txA.wait()
      }
      const tx = await limit.placeOrderERC20(sell.address, buy.address === 'native' ? WPLS : buy.address, _amountIn, _minOut, expiry)
      await tx.wait()
    }
    onPlaced?.()
  }

  // ====== UI ======
  const priceHint = useMemo(() => {
    if (!(ref.v > 0)) return '—'
    return `${ref.v.toLocaleString('en-US', { maximumFractionDigits: 12 })} ${buy.symbol} / ${sell.symbol}`
  }, [ref.v, buy.symbol, sell.symbol])

  return (
    <div className="limit-wrap">
      {/* header sottile come barra/titolo */}
      <div className="section-title">Limit Order Swap</div>

      {/* You sell */}
      <div className="box">
        <div className="row-title">You sell</div>
        <button className="token-select" onClick={() => openSel('sell')}>
          <img className="token-icon" src={sell.icon || '/images/no-token.png'} alt={sell.symbol} />
          <span className="token-ticker">{sell.symbol}</span>
          <AiOutlineDown className="token-chevron" />
        </button>
        <input
          className="amount-input"
          placeholder="0.0"
          inputMode="decimal"
          value={amountIn}
          onChange={e => setAmountIn(e.target.value)}
        />
      </div>

      {/* You buy (derivato) */}
      <div className="box">
        <div className="row-title">You buy</div>
        <button className="token-select" onClick={() => openSel('buy')}>
          <img className="token-icon" src={buy.icon || '/images/no-token.png'} alt={buy.symbol} />
          <span className="token-ticker">{buy.symbol}</span>
          <AiOutlineDown className="token-chevron" />
        </button>
        <div className="amount-out">{amountOut || '—'}</div>
      </div>

      {/* Target price */}
      <div className="box box--light">
        <div className="box-head">
          <div className="dim">Target price</div>
          <div className="dim small">Current price: {priceHint} <span className="opacity-70">(Dexscreener)</span></div>
        </div>
        <input
          className="price-input"
          placeholder={`${buy.symbol} per ${sell.symbol}`}
          value={targetPrice}
          onChange={e => setTargetPrice(e.target.value)}
        />
        <div className="pills">
          <button className="pill" onClick={() => setFromRef(1.00)}>Use current</button>
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
      <button className="place-btn" onClick={place}>Place Limit Order</button>

      {/* Selector */}
      <TokenSelector
        open={selOpen}
        side={selSide === 'sell' ? 'pay' : 'receive'}
        onClose={() => setSelOpen(false)}
        onSelect={onSelect}
        excludeAddress={selSide === 'sell' ? (buy.address || '') : (sell.address || '')}
      />

      <style jsx>{`
        .limit-wrap{ display:flex; flex-direction:column; gap:12px; }
        .section-title{
          font-weight:800; font-size:14px; letter-spacing:.2px;
          border:1px solid rgba(120,170,240,.32);
          background: rgba(255,255,255,.50);
          color:#0f1622;
          padding:8px 12px; border-radius:12px; text-align:center;
        }
        .box{
          position:relative;
          border:1px solid rgba(120,170,240,.40);
          background: rgba(255,255,255,.80); /* più chiaro per leggibilità */
          backdrop-filter: blur(4px);
          border-radius:16px;
          padding: 14px 12px 10px;
          display:grid; grid-template-columns: 1fr auto; gap:10px; align-items:center;
          color:#0f1622;
        }
        .box--light{
          background: rgba(255,255,255,.88);
        }
        .row-title{ position:absolute; top:8px; left:12px; font-size:12px; opacity:.8; font-weight:700 }
        .token-select{
          display:flex; align-items:center; gap:8px;
          border:1px solid rgba(120,170,240,.55);
          background: #f6f9ff;
          padding:8px 10px; border-radius:12px; font-weight:800; color:#0f1622;
        }
        .token-icon{ width:22px; height:22px; border-radius:999px; object-fit:cover }
        .token-ticker{ font-weight:900; }
        .token-chevron{ opacity:.8; font-size:14px; margin-left:6px }
        .amount-input{
          background: #f6f9ff;
          border:1px solid rgba(120,170,240,.55);
          border-radius:12px;
          padding:10px 12px;
          font-size:20px; font-weight:900; text-align:right; width:100%;
          outline:none; color:#0f1622;
        }
        .amount-out{
          padding:10px 12px; text-align:right; width:100%;
          font-size:18px; font-weight:800; color:#0f1622;
        }
        .box-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:8px }
        .dim{ opacity:.9; font-weight:700 }
        .small{ font-size:12px }
        .price-input{
          width:100%;
          background: #f6f9ff;
          border:1px solid rgba(120,170,240,.50);
          border-radius:12px;
          padding:10px 12px; outline:none; font-weight:800; color:#0f1622;
        }
        .pills{ display:flex; flex-wrap:wrap; gap:8px; margin-top:10px }
        .pill{
          padding:6px 10px; border-radius:10px;
          border:1px solid rgba(120,170,240,.55);
          background:#eef6ff;
          transition: background .15s ease, transform .06s ease;
          font-weight:800; font-size:13px; color:#0f1622;
        }
        .pill:hover{ background:#e3f0ff }
        .pill:active{ transform: translateY(1px) }
        .place-btn{
          height:46px; border-radius:14px;
          width:100%; font-weight:900; color:#fff;
          border:1px solid rgba(120,170,240,.65);
          background: linear-gradient(180deg, #7cc8ff, #3b82f6);
          box-shadow: inset 0 0 0 1px rgba(124,200,255,.18);
        }
      `}</style>
    </div>
  )
}

export default LimitTab
