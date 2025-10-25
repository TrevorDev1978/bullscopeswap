// components/LimitTab.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import TokenSelector, { DEFAULT_TOKENS, Token } from './TokenSelector'
import { AiOutlineDown } from 'react-icons/ai'
import { ethers } from 'ethers'

/* ====== Chain & Routers ====== */
const RPC_URL = 'https://rpc.pulsechain.com'
const PULSE_CHAIN_HEX = '0x171'
const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'
const LIMIT_ADDRESS = '0xFEa1023F5d52536beFc71c3404E356ae81C82F4B'
const QUOTE_ROUTER = '0xDA9aBA4eACF54E0273f56dfFee6B8F1e20B23Bba'
const ROUTER02     = '0x165C3410fC91EF562C50559f7d2289fEbed552d9'

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
const SELECTOR = {
  decimals: '0x313ce567',
  getAmountsOut: '0xd06ca61f',
}
const hexToBigInt = (hex: string) => (!hex || hex === '0x' ? 0n : BigInt(hex))
const parseUnitsBI = (s: string, decimals = 18) => {
  const [i, f = ''] = s.replace(/,/g, '').replace(',', '.').split('.')
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(i || '0') * (10n ** BigInt(decimals)) + BigInt(frac || '0')
}
const formatUnitsBI = (v: bigint, decimals = 18, maxFrac = 12) => {
  const neg = v < 0n
  const av = neg ? -v : v
  const base = 10n ** BigInt(decimals)
  const ip = av / base
  let fp = (av % base).toString().padStart(decimals, '0')
  if (maxFrac >= 0) fp = fp.slice(0, maxFrac)
  fp = fp.replace(/0+$/, '')
  return (neg ? '-' : '') + ip.toString() + (fp ? '.' + fp : '')
}
const addrParam = (addr: string) => ('0'.repeat(24) + addr.toLowerCase().replace(/^0x/, ''))

function encodeGetAmountsOut(amountIn: bigint, path: string[]) {
  const amountHex = amountIn.toString(16).padStart(64, '0')
  const head = SELECTOR.getAmountsOut + amountHex + (64).toString(16).padStart(64, '0')
  const len = path.length.toString(16).padStart(64, '0')
  const addrs = path.map(a => a.replace(/^0x/, '').padStart(64, '0')).join('')
  return head + len + addrs
}
function decodeUintArray(hex: string): bigint[] {
  hex = hex.replace(/^0x/, '')
  const off = parseInt(hex.slice(0, 64), 16) * 2
  const len = parseInt(hex.slice(off, off + 64), 16)
  const out: bigint[] = []
  let p = off + 64
  for (let i = 0; i < len; i++) {
    out.push(BigInt('0x' + hex.slice(p, p + 64)))
    p += 64
  }
  return out
}

/* ====== eth_call ====== */
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

/* ====== Prezzi di referenza: DEXTools (se KEY) -> Dexscreener ====== */
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
  } catch { return null }
}
async function dexscreenerUsd(addr: string): Promise<number> {
  const a = addr.toLowerCase()
  const now = Date.now()
  const c = _dsCache[a]
  if (c && now - c.ts < DS_TTL) return c.usd
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${a}`, { cache: 'no-cache' })
    const j: any = await r.json()
    const pairs: any[] = Array.isArray(j?.pairs) ? j.pairs : []
    const best = pairs.find((p: any) => String(p?.chainId || '').toLowerCase().includes('pulse')) || pairs[0]
    const usd = parseFloat(best?.priceUsd || '0') || 0
    _dsCache[a] = { ts: now, usd }
    return usd
  } catch { return 0 }
}
/** Rapporto (buy per 1 sell) basato su USD-ref */
async function refRatioBuyPerSellUSD(tokenIn: string, tokenOut: string) {
  const inDXT = await dextoolsUsd(tokenIn)
  const outDXT = await dextoolsUsd(tokenOut)
  if (inDXT && outDXT && inDXT > 0 && outDXT > 0) return outDXT / inDXT
  const [inDS, outDS] = await Promise.all([dexscreenerUsd(tokenIn), dexscreenerUsd(tokenOut)])
  if (inDS > 0 && outDS > 0) return outDS / inDS
  return 0
}

/* ====== Quote come nello Swap ====== */
function wrapAddr(t: Token) { return (t.address === 'native' ? WPLS : t.address) }
function candidatePaths(aIn: string, aOut: string) {
  if (aIn.toLowerCase() === aOut.toLowerCase()) return [] as string[][]
  const p1 = [aIn, aOut]
  const p2 = (aIn !== WPLS && aOut !== WPLS) ? [aIn, WPLS, aOut] : p1
  const uniq: string[][] = []
  const seen = new Set<string>()
  for (const p of [p1, p2]) {
    const k = p.join('>')
    if (!seen.has(k)) { seen.add(k); uniq.push(p) }
  }
  return uniq
}
async function tryGetAmountsOut(routerAddr: string, amountInRaw: bigint, path: string[]) {
  const data = encodeGetAmountsOut(amountInRaw, path)
  try {
    const res = await ethCall(routerAddr, data)
    const arr = decodeUintArray(res)
    return arr[arr.length - 1]
  } catch { return 0n }
}
async function bestAmountsOut(amountInRaw: bigint, path: string[]) {
  let out = await tryGetAmountsOut(QUOTE_ROUTER, amountInRaw, path)
  if (out === 0n) out = await tryGetAmountsOut(ROUTER02, amountInRaw, path)
  return out
}

/* ====== Prefill ====== */
type Prefill = {
  sell: Token
  buy: Token
  amountIn: string
  useCurrentOnOpen?: boolean
}
type Props = { prefill?: Prefill; onPlaced?: (id?: number) => void }

/* ====== UI styles (schiariti) ====== */
const style = {
  box: `relative my-3 rounded-2xl p-4 text-xl flex justify-between items-center border`,
  input: `bg-white/70 placeholder:text-[#4B5565] outline-none w-full text-3xl text-[#0f1622] text-right rounded-xl px-3 py-2 border border-[rgba(100,150,220,.55)]`,
}

const LimitTab: React.FC<Props> = ({ prefill, onPlaced }) => {
  // === stato iniziale (prefill o default)
  const [sell, setSell] = useState<Token>(prefill?.sell || DEFAULT_TOKENS.find(t => t.symbol === 'PLS')!)
  const [buy,  setBuy]  = useState<Token>(prefill?.buy  || DEFAULT_TOKENS.find(t => t.symbol === 'BLSEYE')!)
  const [amountIn, setAmountIn] = useState<string>(prefill?.amountIn || '')

  // target & out (view)
  const [targetPrice, setTargetPrice] = useState<string>('') // buy per 1 sell
  const [outAtTarget, setOutAtTarget] = useState<string>('') // amountIn * targetPrice

  // quote corrente (uguale allo Swap)
  const [routeOut, setRouteOut] = useState<string>('')        // calcolato via router
  const [routePrice, setRoutePrice] = useState<number>(0)     // out/in numerico

  // reference price (DEXTools/Dexscreener) — SOLO DISPLAY
  const [refPrice, setRefPrice] = useState<number>(0)
  const [refSrc, setRefSrc] = useState<string>('—')

  // selector
  const [selOpen, setSelOpen] = useState(false)
  const [selSide, setSelSide] = useState<'sell' | 'buy'>('sell')
  const openSel = (s: 'sell' | 'buy') => { setSelSide(s); setSelOpen(true) }
  const onSelect = (t: Token) => { (selSide === 'sell' ? setSell : setBuy)(t) }

  // se cambia il prefill (riapertura), riallinea
  useEffect(() => {
    if (!prefill) return
    setSell(prefill.sell)
    setBuy(prefill.buy)
    setAmountIn(prefill.amountIn || '')
    setTargetPrice('')
    setOutAtTarget('')
    setRouteOut('')
    setRoutePrice(0)
    didAutofill.current = false
  }, [prefill?.sell?.address, prefill?.buy?.address, prefill?.amountIn])

  // ====== FETCH: prezzo di referenza (come volevi) ======
  useEffect(() => {
    let alive = true, timer: any
    const upd = async () => {
      const aIn  = wrapAddr(sell)
      const aOut = wrapAddr(buy)
      const r = await refRatioBuyPerSellUSD(aIn, aOut)
      if (!alive) return
      setRefPrice(r)
      setRefSrc(DEXT_KEY ? 'DEXTools/Dexscreener' : 'Dexscreener')
    }
    const loop = () => { timer = setTimeout(async () => { await upd(); loop() }, 30_000) }
    upd(); loop()
    return () => { alive = false; clearTimeout(timer) }
  }, [sell.address, buy.address])

  // ====== QUOTE CORRENTE (uguale allo Swap) ======
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current)
    quoteTimer.current = setTimeout(async () => {
      try {
        const ai = parseFloat(String(amountIn || '').replace(',', '.'))
        if (!(ai > 0)) { setRouteOut(''); setRoutePrice(0); return }
        const inDec  = await getTokenDecimals(sell.address)
        const outDec = await getTokenDecimals(buy.address)
        const aInRaw = parseUnitsBI(amountIn, inDec)
        const paths = candidatePaths(wrapAddr(sell), wrapAddr(buy))
        if (!paths.length) { setRouteOut(''); setRoutePrice(0); return }
        let bestOut = 0n, best: string[] | null = null
        for (const p of paths) {
          const out = await bestAmountsOut(aInRaw, p)
          if (out > bestOut) { bestOut = out; best = p }
        }
        if (best && bestOut > 0n) {
          const outFmt = formatUnitsBI(bestOut, outDec, 12)
          setRouteOut(outFmt)
          // prezzo di rotta = (out / in)
          const inNum  = Number(formatUnitsBI(aInRaw, inDec, 18))
          const outNum = Number(formatUnitsBI(bestOut, outDec, 18))
          const price  = (inNum > 0 && Number.isFinite(outNum / inNum)) ? (outNum / inNum) : 0
          setRoutePrice(price)
        } else {
          setRouteOut('')
          setRoutePrice(0)
        }
      } catch {
        setRouteOut('')
        setRoutePrice(0)
      }
    }, 180)

    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current) }
  }, [amountIn, sell.address, buy.address])

  // ====== Autofill target all'apertura: usa PREZZO DI ROTTA per coincidere con Swap ======
  const didAutofill = useRef(false)
  useEffect(() => {
    if (didAutofill.current) return
    // salvo esplicito false, auto-imposta il target al prezzo DI ROTTA (coerente con Swap)
    if (prefill && prefill.useCurrentOnOpen === false) return
    if (routePrice > 0) {
      didAutofill.current = true
      setTargetPrice(routePrice.toLocaleString('en-US', { maximumFractionDigits: 12 }))
    }
  }, [routePrice, prefill])

  // ====== Calcolo "You buy" mostrato ======
  // - Se c'è targetPrice valido -> amountIn * targetPrice (minOut)
  // - Altrimenti (target vuoto) -> mostra quote corrente (routeOut), come nello Swap
  useEffect(() => {
    const q = parseFloat((amountIn || '0').replace(',', '.'))
    const p = parseFloat((targetPrice || '0').replace(',', '.'))
    if (q > 0 && p > 0) {
      setOutAtTarget((q * p).toLocaleString('en-US', { maximumFractionDigits: 12 }))
    } else {
      setOutAtTarget('')
    }
  }, [amountIn, targetPrice])

  const youReceiveDisplay = outAtTarget || routeOut || '—'

  // quick buttons sulle percentuali — base = target corrente se presente altrimenti refPrice
  const setFromPct = (mult: number) => {
    const base = parseFloat((targetPrice || String(refPrice) || '0').replace(',', '.'))
    if (!(base > 0)) return
    const p = base * mult
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

    const mult = BigInt(Math.floor(px * 1e12))
    const _minOut = (_amountIn * mult) / BigInt(1e12)

    const limit = new E.Contract(LIMIT_ADDRESS, ABI_LIMIT, signer)

    if (sell.address === 'native') {
      const tx = await limit.placeOrderPLS(
        buy.address === 'native' ? WPLS : buy.address,
        _minOut,
        Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
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

    setAmountIn(''); setTargetPrice(''); setOutAtTarget(''); setRouteOut(''); setRoutePrice(0)
    onPlaced?.()
  }

  const placeDisabled = !(parseFloat((amountIn || '0').replace(',', '.')) > 0) ||
                        !(parseFloat((targetPrice || '0').replace(',', '.')) > 0)

  const priceHint = refPrice > 0
    ? `${refPrice.toLocaleString('en-US', { maximumFractionDigits: 10 })} ${buy.symbol} / ${sell.symbol}`
    : '—'

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header barra */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-[42px] rounded-xl border border-[rgba(100,150,220,.65)] bg-[rgba(255,255,255,.85)] text-[#0f1622] backdrop-blur-[6px] flex items-center justify-center font-semibold">
          Limit Order Swap
        </div>
      </div>

      {/* You sell */}
      <div className={`${style.box} bg-[rgba(255,255,255,.85)] border-[rgba(100,150,220,.65)] hover:border-[rgba(80,130,210,.85)]`}>
        <div className="row-title">You sell</div>
        <button className="token-select token-select--clean" onClick={() => openSel('sell')}>
          <img className="token-icon" src={sell.icon || '/images/no-token.png'} alt={sell.symbol} />
          <span className="token-ticker">{sell.symbol}</span>
          <AiOutlineDown className="token-chevron" style={{ opacity: .9, fontSize: 14, marginLeft: 6 }} />
        </button>
        <input className={style.input} inputMode="decimal" placeholder="0.0" value={amountIn} onChange={e => setAmountIn(e.target.value)} />
      </div>

      {/* You buy (display) */}
      <div className={`${style.box} bg-[rgba(255,255,255,.85)] border-[rgba(100,150,220,.65)] hover:border-[rgba(80,130,210,.85)]`}>
        <div className="row-title">You buy</div>
        <button className="token-select token-select--clean" onClick={() => openSel('buy')}>
          <img className="token-icon" src={buy.icon || '/images/no-token.png'} alt={buy.symbol} />
          <span className="token-ticker">{buy.symbol}</span>
          <AiOutlineDown className="token-chevron" style={{ opacity: .9, fontSize: 14, marginLeft: 6 }} />
        </button>
        <div className="text-right text-[#0f1622] font-bold pr-1">{youReceiveDisplay}</div>
      </div>

      {/* Target Price */}
      <div className="rounded-2xl border border-[rgba(100,150,220,.65)] p-4 bg-[rgba(255,255,255,.9)] text-[#0f1622]">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Target price</div>
          <div className="text-sm opacity-90">
            Current price: {priceHint} <span className="opacity-60">({refSrc})</span>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-white border border-[rgba(100,150,220,.65)] rounded-xl px-3 py-2 outline-none text-[#0f1622] font-semibold"
            placeholder={`${buy.symbol} per ${sell.symbol}`}
            value={targetPrice}
            onChange={e => setTargetPrice(e.target.value)}
          />
        </div>

        <div className="flex gap-2 mt-3 flex-wrap">
          {[
            { label: 'Use current', m: 1.00 },
            { label: '-2%', m: 0.98 },
            { label: '-5%', m: 0.95 },
            { label: '-10%', m: 0.90 },
            { label: '-20%', m: 0.80 },
            { label: '+2%', m: 1.02 },
            { label: '+5%', m: 1.05 },
            { label: '+10%', m: 1.10 },
            { label: '+20%', m: 1.20 },
          ].map(b => (
            <button
              key={b.label}
              className="px-3 py-2 rounded-lg border border-[rgba(100,150,220,.75)] bg-[rgba(255,255,255,.95)] hover:bg-white font-semibold"
              onClick={() => setFromPct(b.m)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-4">
        <button
          className="w-full h-[48px] rounded-xl bg-[rgba(59,130,246,0.92)] text-white font-extrabold border border-[rgba(100,150,220,.85)] shadow-[0_12px_32px_rgba(59,130,246,0.35)] hover:brightness-110 disabled:opacity-60"
          disabled={placeDisabled}
          onClick={place}
        >
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
        .row-title{ position:absolute; top:10px; left:14px; font-size:12px; opacity:.8; color:#0f1622 }
        .token-select{
          display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:12px;
          border:1px solid rgba(100,150,220,.65); background:rgba(255,255,255,.95); color:#0f1622; font-weight:800;
        }
        .token-icon{ width:22px; height:22px; border-radius:999px; object-fit:cover }
      `}</style>
    </div>
  )
}

export default LimitTab
