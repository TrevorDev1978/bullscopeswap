// components/Main.tsx
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import Modal from 'react-modal'
import { RiSettings3Fill } from 'react-icons/ri'
import { AiOutlineDown } from 'react-icons/ai'
import { useRouter } from 'next/router'
import { TransactionContext } from '../context/TransactionContext'
import TransactionLoader from './TransactionLoader'
import TokenSelector, { DEFAULT_TOKENS, Token } from './TokenSelector'
import SwapActionButton from './SwapActionButton'
import { ethers } from 'ethers'
import SwapPreviewModal from './SwapPreviewModal'

declare global {
  interface Window { ethereum?: any }
}

// ====== Chain & Routers ======
const PULSE_CHAIN_HEX = '0x171' // 369
const RPC_INFO = {
  chainId: PULSE_CHAIN_HEX,
  chainName: 'PulseChain',
  nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 },
  rpcUrls: ['https://rpc.pulsechain.com'],
  blockExplorerUrls: ['https://scan.pulsechain.com'],
}
const QUOTE_ROUTER = '0xDA9aBA4eACF54E0273f56dfFee6B8F1e20B23Bba'
const ROUTER02     = '0x165C3410fC91EF562C50559f7d2289fEbed552d9'
const BULLSCOPE_ROUTER = '0x6CE485B02Cf97a69D8bAbfe18AF83D6a0c829Dde'
const WPLS         = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'

// ====== Slippage/fee ======
const HIDDEN_BPS = 70 // sicurezza invisibile (buffer + fee interne router non mostrate)
const DEFAULT_USER_SLIPPAGE = '0.5'
const GAS_BUFFER_WEI = 2_000_000_000_000_000n // ~0.002 PLS di buffer gas

// ====== UI styles ======
const style = {
  wrapper: `w-screen flex items-center justify-center mt-12`,
  formHeader: `px-2 flex items-center justify-between`,
  transferPropContainer: `relative bg-[#20242A] my-3 rounded-2xl p-4 text-xl border border-[#2A2F36] hover:border-[#41444F] flex justify-between items-center`,
  transferPropInput: `bg-transparent placeholder:text-[#B2B9D2] outline-none w-full text-3xl text-white`,
  currencySelector: `flex w-[45%] sm:w-[38%]`,
  currencySelectorContent: `w-full flex items-center gap-2 rounded-2xl text-lg sm:text-xl font-medium cursor-pointer`,
  currencySelectorTicker: `mx-1 text-base sm:text-lg font-semibold`,
}

const modalStyles = {
  content: {
    top: '50%', left: '50%', right: 'auto', bottom: 'auto',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'transparent', padding: 0, border: 'none',
  } as React.CSSProperties,
  overlay: { backgroundColor: 'rgba(10, 11, 13, 0.75)', zIndex: 60 } as React.CSSProperties,
}

const centerArrowWrap: React.CSSProperties = { display: 'flex', justifyContent: 'center', margin: '10px 0' }
const centerArrowBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 999, cursor: 'pointer',
  border: '1px solid rgba(120,170,240,0.55)',
  background: 'rgba(255,255,255,0.06)',
  boxShadow: 'inset 0 0 10px rgba(160,200,255,0.10)',
  color: '#fff', fontWeight: 700, lineHeight: '34px', textAlign: 'center'
}

// ====== Low-level helpers (eth_call encode) ======
const SELECTOR = {
  balanceOf: '0x70a08231',
  decimals:  '0x313ce567',
  getAmountsOut: '0xd06ca61f',
  getAmountsIn:  '0x1f00ca74',
}
const hexToBigInt = (hex: string) => (!hex || hex === '0x' ? 0n : BigInt(hex))
const formatUnitsBI = (value: bigint, decimals = 18, maxFrac = 6) => {
  const neg = value < 0n
  const v = neg ? -value : value
  const base = 10n ** BigInt(decimals)
  const i = v / base
  const f = v % base
  let fStr = f.toString().padStart(decimals, '0')
  if (maxFrac >= 0) fStr = fStr.slice(0, maxFrac)
  fStr = fStr.replace(/0+$/, '')
  return (neg ? '-' : '') + i.toString() + (fStr ? '.' + fStr : '')
}
const parseUnitsBI = (s: string, decimals = 18) => {
  const [int, frac = ''] = s.replace(/,/g, '').replace(',', '.').split('.')
  const f = (frac + '0'.repeat(decimals)).slice(0, decimals)
  const n = BigInt(int || '0') * (10n ** BigInt(decimals)) + BigInt(f || '0')
  return n
}
const addrParam = (addr: string) => ('0'.repeat(24) + addr.toLowerCase().replace(/^0x/, ''))

function encodeGetAmountsOut(amountIn: bigint, path: string[]) {
  const amountHex = amountIn.toString(16).padStart(64, '0')
  const head = SELECTOR.getAmountsOut + amountHex + (64).toString(16).padStart(64, '0')
  const len = path.length.toString(16).padStart(64, '0')
  const addrs = path.map(a => a.replace(/^0x/, '').padStart(64, '0')).join('')
  return head + len + addrs
}
function encodeGetAmountsIn(amountOut: bigint, path: string[]) {
  const amountHex = amountOut.toString(16).padStart(64, '0')
  const head = SELECTOR.getAmountsIn + amountHex + (64).toString(16).padStart(64, '0')
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
async function ethCall(to: string, data: string) {
  return ethCallSafe(to, data)
}

// --- AGGIUNGI in alto, vicino ad ethCall:
const RPC_URL = 'https://rpc.pulsechain.com'

async function ethCallSafe(to: string, data: string) {
  // 1) prova via wallet SOLO se già su Pulse
  try {
    if (window.ethereum) {
      const cid = await window.ethereum.request({ method: 'eth_chainId' })
      if (cid === PULSE_CHAIN_HEX) {
        return await window.ethereum.request({
          method: 'eth_call',
          params: [{ to, data }, 'latest'],
        }) as string
      }
    }
  } catch {}
  // 2) fallback via public RPC
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
async function getBalanceSafe(account: string) {
  // wallet se già su Pulse…
  try {
    if (window.ethereum) {
      const cid = await window.ethereum.request({ method: 'eth_chainId' })
      if (cid === PULSE_CHAIN_HEX) {
        return await window.ethereum.request({
          method: 'eth_getBalance',
          params: [account, 'latest'],
        }) as string
      }
    }
  } catch {}
  // …altrimenti public RPC
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_getBalance',
      params: [account, 'latest'],
    }),
  })
  const j = await r.json()
  if (j?.error) throw new Error(j.error.message || 'eth_getBalance failed')
  return j.result as string
}



async function ensurePulseChain(): Promise<boolean> {
  if (!window.ethereum) return false
  try {
    const cid = await window.ethereum.request({ method: 'eth_chainId' })
    if (cid === PULSE_CHAIN_HEX) return true
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: PULSE_CHAIN_HEX }] })
      return true
    } catch (e: any) {
      if (e?.code === 4902) {
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [RPC_INFO] })
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: PULSE_CHAIN_HEX }] })
        return true
      }
      return false
    }
  } catch { return false }
}
const decimalsCache = new Map<string, number>()
async function getTokenDecimals(tokenAddr: string): Promise<number> {
  if (tokenAddr === 'native') return 18
  if (decimalsCache.has(tokenAddr)) return decimalsCache.get(tokenAddr)!
  const res = await ethCallSafe(tokenAddr, SELECTOR.decimals)
  const n = parseInt(res, 16)
  const d = Number.isFinite(n) ? n : 18
  decimalsCache.set(tokenAddr, d)
  return d
}

async function erc20BalanceOf(tokenAddr: string, account: string): Promise<bigint> {
  const data = SELECTOR.balanceOf + addrParam(account)
  const res = await ethCallSafe(tokenAddr, data)
  return hexToBigInt(res)
}


// ====== Explorer link ======
const otterscanTx = (hash?: string|null) => hash ? `https://otter.pulsechain.com/tx/${hash}` : '#'
const short = (h?: string|null) => h ? (h.slice(0,6)+'…'+h.slice(-4)) : ''

// ====== Overlay (Approve + Swap) ======
type FlowMode = 'approve' | 'swap'
type FlowStep = 'prompt' | 'pending' | 'confirmed' | 'error'
type FlowState = { open: boolean; mode: FlowMode; step: FlowStep; message?: string; txHash?: string }
const initialFlow: FlowState = { open: false, mode: 'swap', step: 'prompt', message: '' }

const overlayWrap: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(2px)'
}

/* === CARD OVERLAY — rettangolo semplice, azzurrino chiarissimo, titolo centrato === */
const card: React.CSSProperties = {
  width: 'min(380px, 94vw)',
  minHeight: 340,
  background: 'linear-gradient(180deg, #E6F3FF 0%, #F2FAFF 100%)',
  color: '#0f1622',
  border: '1px solid rgba(120,160,220,.60)',
  borderRadius: 16,
  boxShadow: '0 25px 60px rgba(0,0,0,.45)',
  padding: '26px 20px 30px',
  overflow: 'hidden',
  backgroundClip: 'padding-box',
}


const coinWrap: React.CSSProperties = { width: 64, height: 64, perspective: 800 }
const coin: React.CSSProperties = {
  width: 64, height: 64, borderRadius: '50%',
  background: 'url("/images/gold_coin_bullseye.webp") center/cover no-repeat, radial-gradient(circle at 30% 30%, #f7e197, #b9932d 65%)',
  boxShadow: 'inset 0 0 18px rgba(0,0,0,.35), 0 0 18px rgba(255,215,0,.25)',
  animation: 'blsSpinY 1.1s linear infinite',
  backfaceVisibility: 'hidden',
}
const checkDot: React.CSSProperties = {
  width: 54, height: 54, borderRadius: '50%', background: '#22c55e',
  display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:28, color:'#fff'
}
const errDot: React.CSSProperties = {
  width: 54, height: 54, borderRadius: '50%', background: '#ef4444',
  display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:28, color:'#fff'
}
const row: React.CSSProperties = { display:'flex', alignItems:'center', gap:12 }
const titleCss: React.CSSProperties = { 
  fontSize: 20, 
  fontWeight: 700, 
  fontFamily: 'serif', 
  letterSpacing: '0.3px',
  background: 'linear-gradient(90deg,#caa945,#f7e37b)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent'
}
const subCss: React.CSSProperties = { 
  opacity: .9, 
  fontWeight: 500, 
  fontFamily: 'sans-serif', 
  fontSize: 14 
}

const linkCss: React.CSSProperties = { color:'#0b5bd7', textDecoration:'underline', fontWeight:700 }

/* Riga dettagli swap */
const pairRow: React.CSSProperties = {
  display:'flex', alignItems:'center', justifyContent:'center', gap:10,
  fontWeight:700, color:'#0f1622', marginTop:2, marginBottom:10, flexWrap:'wrap'
}
const amtCss: React.CSSProperties = { fontVariantNumeric:'tabular-nums' }
const tokenIconCss: React.CSSProperties = { width:18, height:18, borderRadius:999 }

/* =========================
   PREZZI USD (hook leggero)
   ========================= */
function useUsdPrice(token: Token) {
  const [price, setPrice] = useState<number>(0)
  const addr = token.address === 'native' ? WPLS : token.address

  useEffect(() => {
    let alive = true
    const fetchPrice = async () => {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`)
        const json: any = await res.json()
        const pairs: any[] = Array.isArray(json?.pairs) ? json.pairs : []
        const best =
          pairs.find(p => String(p?.chainId || '').toLowerCase().includes('pulse')) ||
          pairs[0]
        const p = parseFloat(best?.priceUsd ?? '0')
        if (alive) setPrice(Number.isFinite(p) ? p : 0)
      } catch {
        if (alive) setPrice(0)
      }
    }
    fetchPrice()
    const id = setInterval(fetchPrice, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [addr])

  return price
}
const toNum = (s: string) => {
  const n = parseFloat(String(s || '').replace(/,/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const fmtUsdPulseStyle = (v: number) => {
  if (!Number.isFinite(v) || v <= 0) return '≈ $0.00'
  if (v >= 0.01) return `≈ $${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (v >= 0.0001) return `≈ $${v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
  return `≈ $${v.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`
}

function friendlyError(e: any): string {
  const code = e?.code ?? e?.error?.code ?? e?.info?.error?.code
  const msg = (e?.message || e?.shortMessage || e?.reason || '').toString().toLowerCase()
  const dataMsg = (e?.data?.message || '').toString().toLowerCase()
  const full = `${msg} ${dataMsg}`
  if (code === 4001 || /user rejected|rejected the request|transaction rejected/.test(full)) return 'Request rejected in wallet.'
  if (/insufficient_output_amount|pulsexrouter: insufficient_output_amount/.test(full)) return 'Please increase slippage or reduce input amount.'
  if (/(transferhelper.*transferfrom.*failed|transfer_from_failed)/.test(full)) return 'Token transfer failed. Check allowance and balance (try re-approve).'
  if (/unpredictable gas limit|cannot estimate gas/.test(full)) return 'Transaction cannot be estimated. Try higher slippage or smaller amount.'
  if (/insufficient funds|exceeds balance|not enough/i.test(full)) return 'Insufficient balance for this transaction.'
  return 'Transaction failed. Please try again with higher slippage.'
}

// ====== Main ======
const Main: React.FC = () => {
  const router = useRouter()
  const { formData, handleChange, isLoading } = useContext(TransactionContext)

  const ctxHandleChange = (e: any, name: string) => (handleChange as any)(e, name)

  useEffect(() => { if (typeof window !== 'undefined') Modal.setAppElement('#__next') }, [])

  useEffect(() => {
    const onRej = (ev: PromiseRejectionEvent) => {
      const txt = (ev?.reason?.message || ev?.reason || '').toString().toLowerCase()
      if (/unpredictable gas limit|insufficient_output_amount/.test(txt)) {
        ev.preventDefault?.()
        markError(friendlyError(ev.reason))
      }
    }
    const onErr = (ev: ErrorEvent) => {
      const txt = (ev?.message || '').toLowerCase()
      if (/unpredictable gas limit|insufficient_output_amount/.test(txt)) {
        ev.preventDefault?.()
        markError('Please increase slippage or reduce input amount.')
      }
    }
    window.addEventListener('unhandledrejection', onRej)
    window.addEventListener('error', onErr)
    return () => {
      window.removeEventListener('unhandledrejection', onRej)
      window.removeEventListener('error', onErr)
    }
  }, [])

  // account
  const [account, setAccount] = useState<string | null>(null)
  useEffect(() => {
    if (!window.ethereum) return
    window.ethereum.request({ method: 'eth_accounts' })
      .then((accs: string[]) => setAccount(accs?.[0] ?? null))
      .catch(()=>{})
    const onAcc = (accs: string[]) => setAccount(accs?.[0] ?? null)
    window.ethereum.on?.('accountsChanged', onAcc)
    return () => { window.ethereum?.removeListener?.('accountsChanged', onAcc) }
  }, [])

  // tokens & amounts
  const [payToken, setPayToken]   = useState<Token>(DEFAULT_TOKENS.find(t => t.symbol === 'PLS')!)
  const [rcvToken, setRcvToken]   = useState<Token>(DEFAULT_TOKENS.find(t => t.symbol === 'PLSX')!)
  const [amountIn, setAmountIn]   = useState(formData.amount || '')
  const [amountOut, setAmountOut] = useState('')
  const [bestPath, setBestPath]   = useState<string[] | null>(null)

  const [lastEdited, setLastEdited] = useState<'in' | 'out'>('in')
  const [editing, setEditing] = useState(false)


  // PREZZI USD
  const payPriceUsd = useUsdPrice(payToken)
  const rcvPriceUsd = useUsdPrice(rcvToken)
  const usdUnderPay = useMemo(() => fmtUsdPulseStyle(toNum(amountIn) * payPriceUsd), [amountIn, payPriceUsd])
  const usdUnderRcv = useMemo(() => fmtUsdPulseStyle(toNum(amountOut) * rcvPriceUsd), [amountOut, rcvPriceUsd])

  // selector overlay
  const [selOpen, setSelOpen] = useState(false)
  const [selSide, setSelSide] = useState<'pay' | 'receive'>('pay')
  const openSelector = (side: 'pay' | 'receive') => { setSelSide(side); setSelOpen(true) }
  const onSelect = (t: Token) => {
    // non permettere token identico
    const wrap = (x: Token) => (x.address === 'native' ? WPLS : x.address)
    if ((selSide === 'pay'  && wrap(t) === wrap(rcvToken)) ||
        (selSide === 'receive' && wrap(t) === wrap(payToken))) {
      return
    }
    if (selSide === 'pay') setPayToken(t)
    else setRcvToken(t)
    setBestPath(null)
  }

  // flip
  const flip = () => {
    const pt = payToken, rt = rcvToken, ai = amountIn, ao = amountOut
    setPayToken(rt); setRcvToken(pt); setAmountIn(ao); setAmountOut(ai)
    setBestPath(null)
    setLastEdited('in')
  }

  // slippage
  const [slippageOpen, setSlippageOpen] = useState(false)
  const [slippage, setSlippage] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_USER_SLIPPAGE
    return localStorage.getItem('bls_slippage') || DEFAULT_USER_SLIPPAGE
  })
  const [deadline, setDeadline] = useState<string>(() => {
    if (typeof window === 'undefined') return '20'
    return localStorage.getItem('bls_deadline') || '20'
  })
  const saveSlippage = () => {
    localStorage.setItem('bls_slippage', slippage);
    localStorage.setItem('bls_deadline', deadline);
    setSlippageOpen(false);
  }
  const resetSlippageToDefault = () => {
    setSlippage(DEFAULT_USER_SLIPPAGE)
    localStorage.setItem('bls_slippage', DEFAULT_USER_SLIPPAGE)
  }

  // balances
  type RB = { raw: bigint; decimals: number; formatted: string }
  const [payRB, setPayRB] = useState<RB | null>(null)
  const [rcvRB, setRcvRB] = useState<RB | null>(null)

  async function refreshBalance(token: Token, setter: (v: RB | null) => void) {
    try {
      if (!window.ethereum) { setter(null); return }
      const accs: string[] = await window.ethereum.request({ method: 'eth_accounts' })
      const acc = accs?.[0]
      if (!acc) { setter(null); return }

      if (token.address === 'native') {
        const wei = await getBalanceSafe(acc) // <-- usa la versione “safe”
        const raw = hexToBigInt(wei)
        const formatted = formatUnitsBI(raw, 18)
        setter({ raw, decimals: 18, formatted })
      } else {
        const [dec, raw] = await Promise.all([
          getTokenDecimals(token.address),
          erc20BalanceOf(token.address, acc),
        ])
        const formatted = formatUnitsBI(raw, dec)
        setter({ raw, decimals: dec, formatted })
      }
    } catch {
      setter(null)
    }
  }

  useEffect(() => { refreshBalance(payToken, setPayRB) }, [payToken, account])
  useEffect(() => { refreshBalance(rcvToken, setRcvRB) }, [rcvToken, account])

  // QUOTE utils
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapAddr = (tok: Token) => (tok.address === 'native' ? WPLS : tok.address)
  const candidatePaths = useMemo(() => {
    const a = wrapAddr(payToken), b = wrapAddr(rcvToken)
    if (a === b) return [] as string[][] // blocca stesso token
    const p1 = [a, b]
    const p2 = (a !== WPLS && b !== WPLS) ? [a, WPLS, b] : p1
    const uniq: string[][] = []
    const key = (p: string[]) => p.join('>')
    {
      const seen = new Set<string>()
      for (const p of [p1, p2]) { const k = key(p); if (!seen.has(k)) { seen.add(k); uniq.push(p) } }
    }
    return uniq
  }, [payToken, rcvToken])

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

  async function tryGetAmountsIn(routerAddr: string, amountOutRaw: bigint, path: string[]) {
    const data = encodeGetAmountsIn(amountOutRaw, path)
    try {
      const res = await ethCall(routerAddr, data)
      const arr = decodeUintArray(res)
      return arr[0] // amountIn richiesto
    } catch { return 0n }
  }
  async function bestAmountsIn(amountOutRaw: bigint, path: string[]) {
    let input = await tryGetAmountsIn(QUOTE_ROUTER, amountOutRaw, path)
    if (input === 0n) input = await tryGetAmountsIn(ROUTER02, amountOutRaw, path)
    return input
  }

  // ====== FORWARD QUOTE (You pay -> You receive) ======
  useEffect(() => {
    if (lastEdited !== 'in') return
    if (!amountIn || Number(toNum(amountIn)) <= 0) { setAmountOut(''); setBestPath(null); return }
    if (!payToken || !rcvToken) { setAmountOut(''); setBestPath(null); return }
    if (!candidatePaths.length) { setAmountOut(''); setBestPath(null); return }

    if (quoteTimer.current) clearTimeout(quoteTimer.current)
        quoteTimer.current = setTimeout(async () => {
      try {
        const inDec = await getTokenDecimals(payToken.address)
        const outDec = await getTokenDecimals(rcvToken.address)
        const amountRaw = parseUnitsBI(amountIn, inDec)

        let bestOut = 0n
        let best: string[] | null = null
        for (const path of candidatePaths) {
          const out = await bestAmountsOut(amountRaw, path)
          if (out > bestOut) { bestOut = out; best = path }
        }

        if (best && bestOut > 0n) {
          setBestPath(best)
          setAmountOut(formatUnitsBI(bestOut, outDec, 12))
        } else {
          setBestPath(null)
          setAmountOut('')
        }
      } catch { setBestPath(null); setAmountOut('') }
    }, 220)


    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current) }
  }, [amountIn, candidatePaths, payToken, rcvToken, lastEdited])

  // ====== REVERSE QUOTE (You receive -> You pay) — veloce via getAmountsIn ======
  useEffect(() => {
    if (lastEdited !== 'out') return
    const wantOut = Number(toNum(amountOut))
    if (!amountOut || wantOut <= 0) { setAmountIn(''); setBestPath(null); return }
    if (!candidatePaths.length) { return } // stesso token o nessun path

    if (quoteTimer.current) clearTimeout(quoteTimer.current)
        quoteTimer.current = setTimeout(async () => {
      try {
        const inDec  = await getTokenDecimals(payToken.address)
        const outDec = await getTokenDecimals(rcvToken.address)
        const targetOutRaw = parseUnitsBI(amountOut, outDec)

        let bestIn: bigint | null = null
        let best: string[] | null = null
        for (const path of candidatePaths) {
          const needIn = await bestAmountsIn(targetOutRaw, path)
          if (needIn > 0n && (bestIn === null || needIn < bestIn)) {
            bestIn = needIn
            best = path
          }
        }

        if (best && bestIn && bestIn > 0n) {
          setBestPath(best)
          const formatted = formatUnitsBI(bestIn, inDec, 12)
          setAmountIn(formatted)
          ctxHandleChange({ target: { value: formatted } } as any, 'amount')
        } else {
          setBestPath(null)
        }
      } catch {
        // silence
      }
    }, 220)


    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current) }
  }, [amountOut, candidatePaths, payToken, rcvToken, lastEdited])

  // ========== FLOW OVERLAY ==========
  const [flow, setFlow] = useState<FlowState>(initialFlow)
  const hideLater = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openFlow = (mode: FlowMode, step: FlowStep, msg?: string) => {
    if (hideLater.current) { clearTimeout(hideLater.current); hideLater.current = null }
    setFlow({ open: true, mode, step, message: msg })
  }
  const markPending = (msg?: string) => setFlow(f => ({ ...f, step:'pending', message: msg }))
  const markPrompt  = (msg?: string) => setFlow(f => ({ ...f, step:'prompt',  message: msg }))
  const markError   = (msg?: string) => {
    setFlow(f => ({ ...f, step:'error', message: msg }))
    resetSlippageToDefault()
    if (hideLater.current) clearTimeout(hideLater.current)
    hideLater.current = setTimeout(() => setFlow(initialFlow), 4200)
  }
  const markConfirmed = (hash?: string) => {
    setFlow(f => ({ ...f, step:'confirmed', txHash: hash }))
    resetSlippageToDefault()
    if (hideLater.current) clearTimeout(hideLater.current)
    hideLater.current = setTimeout(() => setFlow(initialFlow), 4200)
  }
  useEffect(() => () => { if (hideLater.current) clearTimeout(hideLater.current) }, [])

  // ====== VALIDAZIONI UI ======
  const sameTokenSelected = useMemo(() => wrapAddr(payToken) === wrapAddr(rcvToken), [payToken, rcvToken])
  const insufficientBalance = useMemo(() => {
    if (!payRB) return false
    const dec = payRB.decimals ?? 18
    let bal = payRB.raw
    if (payToken.address === 'native') {
      bal = bal > GAS_BUFFER_WEI ? (bal - GAS_BUFFER_WEI) : 0n
    }
    const amt = parseUnitsBI(amountIn || '0', dec)
    return amt > bal
  }, [payRB, amountIn, payToken.address])

  const formValid = Boolean(amountIn && Number(toNum(amountIn)) > 0 && !sameTokenSelected && !insufficientBalance)

  // ====== PREVIEW STATE ======
  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState({
    amountOutEst: '',
    priceLabel: '',
    minReceivedLabel: '',
    priceImpactLabel: '',
  })

  // Icon & fallback
  function iconFallback(e: React.SyntheticEvent<HTMLImageElement>) {
    const el = e.currentTarget
    el.onerror = null
    el.src = '/images/no-token.png'
  }

  const iconSrc = (t: Token) => t.icon || (t.address === 'native'
    ? '/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png'
    : '/images/no-token.png')

  // ====== WARP (flip-away 3D) ======
const [warp, setWarp] = useState(false)
const warpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
// timer per ritardare l'apertura del modal di preview
const openPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

useEffect(() => () => {
  if (warpTimer.current) clearTimeout(warpTimer.current)
  if (openPreviewTimer.current) clearTimeout(openPreviewTimer.current)
}, [])

const openPreview = async () => {
  try {
    if (!window.ethereum) return
    const ok = await ensurePulseChain(); if (!ok) return
    if (!amountIn || Number(toNum(amountIn)) <= 0) return
    if (!candidatePaths.length) return
    if (insufficientBalance) return

    // --- Avvia subito l'animazione e prepara i timer
    if (warpTimer.current) clearTimeout(warpTimer.current)
    if (openPreviewTimer.current) clearTimeout(openPreviewTimer.current)

    const t0 = Date.now()
    setWarp(true)
    // manteniamo lo stato "warp" per 3s, poi lo spegniamo
    warpTimer.current = setTimeout(() => setWarp(false), 800)

    // --- Calcolo quote/preview in parallelo all'animazione
    const inDec  = await getTokenDecimals(payToken.address)
    const outDec = await getTokenDecimals(rcvToken.address)
    const amountInRaw = parseUnitsBI(amountIn, inDec)
    const path = (bestPath && bestPath.length >= 2) ? bestPath : candidatePaths[0]
    if (!path) return

    // Quote corrente
    const outRaw = await bestAmountsOut(amountInRaw, path)
    const amountOutEst = outRaw > 0n ? formatUnitsBI(outRaw, outDec, 12) : ''

    // Prezzo (rcv / pay)
    const inNum  = Number(formatUnitsBI(amountInRaw, inDec, 18))
    const outNum = Number(formatUnitsBI(outRaw, outDec, 18))
    const price  = (inNum > 0 && Number.isFinite(outNum/inNum)) ? outNum / inNum : 0
    const priceLabel = price
      ? `${price.toLocaleString('en-US', { maximumFractionDigits: 8 })} ${rcvToken.symbol} / ${payToken.symbol}`
      : '—'

    // Slippage & min received (utente + hidden buffer)
    const slipUserBps = Math.max(0, Math.round((Number(slippage || '0') || 0) * 100))
    const totalCut = BigInt(Math.min(9999, slipUserBps + HIDDEN_BPS))
    const minOutRaw = outRaw > 0n ? (outRaw * (10000n - totalCut)) / 10000n : 0n
    const minReceivedLabel = minOutRaw > 0n
      ? `${formatUnitsBI(minOutRaw, outDec, 12)} ${rcvToken.symbol}`
      : '—'

    // Price impact (stima veloce)
    let priceImpactLabel = '—'
    try {
      const unit = 10n ** BigInt(inDec)
      const smallIn = unit / 10000n > 0n ? unit / 10000n : 1n
      const smallOut = await bestAmountsOut(smallIn, path)
      if (smallOut > 0n && outRaw > 0n && amountInRaw > 0n) {
        const baseRate = Number(formatUnitsBI(smallOut, outDec, 18)) / Number(formatUnitsBI(smallIn, inDec, 18))
        const actRate  = outNum / inNum
        if (baseRate > 0 && Number.isFinite(actRate)) {
          const impact = Math.max(0, (1 - (actRate / baseRate)) * 100)
          priceImpactLabel = `${impact.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
        }
      }
    } catch { /* safe fallback */ }

    setPreview({
      amountOutEst,
      priceLabel,
      minReceivedLabel,
      priceImpactLabel
    })

    // --- Apri il modal esattamente al termine dei 3s dell'animazione
    const elapsed = Date.now() - t0
    const left = Math.max(0, 800 - elapsed)
    openPreviewTimer.current = setTimeout(() => {
      setPreviewOpen(true)
    }, left)
  } catch {
    // niente
  }
}


  // ====== SWAP REALE ======
  const onSwapClick = async () => {
    try {
      if (!window.ethereum) return
      const ok = await ensurePulseChain(); if (!ok) return
      if (sameTokenSelected) { markError('Select different tokens.'); return }
      if (insufficientBalance) { markError('Insufficient balance.'); return }

      openFlow('swap', 'prompt', 'Please confirm in your wallet…')
      const accs = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const user = accs?.[0]; if (!user) return

      const provider = (ethers as any).BrowserProvider
        ? new (ethers as any).BrowserProvider(window.ethereum)
        : new (ethers as any).providers.Web3Provider(window.ethereum)
      const signer = (provider as any).getSigner ? await (provider as any).getSigner() : await (provider as any).getSigner(0)

      const router = new (ethers as any).Contract(
        BULLSCOPE_ROUTER,
        [
          'function swapExactETHForTokensWithFee(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable',
          'function swapExactTokensForETHWithFee(uint256 amountInGross, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
          'function swapExactTokensForTokensWithFee(uint256 amountInGross, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
        ],
        signer
      )

      const inDec  = await getTokenDecimals(payToken.address)
      const amtIn  = parseUnitsBI(amountIn || '0', inDec)
      if (amtIn <= 0n) return

      const basePath = bestPath || candidatePaths[0]
      let outRaw = await bestAmountsOut(amtIn, basePath)

      const slipUserBps = Math.max(0, Math.round((Number(slippage || '0') || 0) * 100))
      const totalCut = BigInt(Math.min(9999, slipUserBps + HIDDEN_BPS))
      const minOut = outRaw > 0n ? (outRaw * (10000n - totalCut)) / 10000n : 0n

      const path = basePath
      const deadlineTs = Math.floor(Date.now() / 1000) + Math.max(60, (Number(deadline || '20') || 20) * 60)

      const isNativeIn  = (payToken.address === 'native')
      const isNativeOut = (rcvToken.address === 'native')

      if (!isNativeIn) {
        openFlow('approve', 'prompt', 'Please confirm “Enable spending” in your wallet…')
        const erc20 = new (ethers as any).Contract(
          payToken.address,
          ['function allowance(address owner, address spender) view returns (uint256)',
           'function approve(address spender, uint256 value) returns (bool)'],
          signer
        )
        const allowance: any = await erc20.allowance(user, BULLSCOPE_ROUTER)
        const allowanceBI = (allowance?._isBigNumber || allowance?._hex) ? BigInt(allowance._hex || '0x0') : BigInt(allowance ?? 0)
        if (allowanceBI < amtIn) {
          markPending('Enable spending pending…')
          const txA = await erc20.approve(BULLSCOPE_ROUTER, amtIn)
          await txA.wait()
        }
      }

      openFlow('swap', 'pending', 'Confirm swap pending…')

      let tx: any
      if (isNativeIn) {
        tx = await router.swapExactETHForTokensWithFee(minOut, path, user, deadlineTs, { value: amtIn })
      } else if (isNativeOut) {
        tx = await router.swapExactTokensForETHWithFee(amtIn, minOut, path, user, deadlineTs)
      } else {
        tx = await router.swapExactTokensForTokensWithFee(amtIn, minOut, path, user, deadlineTs)
      }
      await tx.wait()
      markConfirmed(tx?.hash)

      refreshBalance(payToken, setPayRB)
      refreshBalance(rcvToken, setRcvRB)
    } catch (e: any) {
      console.error('[BLS swap error]', e)
      markError(friendlyError(e))
    }
  }


  return (

    <>
       {/* Overlay Approve/Swap — ELEGANT AZURE AURORA */}
      {flow.open && (
        <div style={overlayWrap}>
          {/* Aurora / mist sullo sfondo */}
          <div className="bls-aurora bls-aurora--1" aria-hidden />
          <div className="bls-aurora bls-aurora--2" aria-hidden />

          {/* Card principale con bordo glow e glassy azzurro */}
          <div className="bls-genie-card">
            {/* bagliore interno morbido */}
            <div className="bls-card-glow" aria-hidden />

            {/* Header overlay */}
            <div className="bls-card-head">
              <div className="bls-head-title">
                {flow.mode === 'approve' ? 'Enable Spending' : 'Confirm Swap'}
              </div>
              <button
                onClick={()=>setFlow(initialFlow)}
                className="bls-close"
                aria-label="Close"
              >✕</button>
            </div>

            {/* Dettagli swap */}
            <div className="bls-pair">
              <img src={iconSrc(payToken)} alt={payToken.symbol} style={tokenIconCss} onError={iconFallback}/>
              <span style={amtCss}>{amountIn || '—'}</span>
              <span className="bls-sym"> {payToken.symbol} </span>
              <span className="bls-arrow">→</span>
              <img src={iconSrc(rcvToken)} alt={rcvToken.symbol} style={tokenIconCss} onError={iconFallback}/>
              <span style={amtCss}>{amountOut ? `≈ ${amountOut}` : '—'}</span>
              <span className="bls-sym"> {rcvToken.symbol} </span>
            </div>

            {/* Sezione centrale con mist + halo dietro allo stato */}
            <div className="bls-center">
              <div className="bls-mist bls-mist--a" aria-hidden />
              <div className="bls-mist bls-mist--b" aria-hidden />
              <div className="bls-halo" aria-hidden />

              {flow.step === 'pending' || flow.step === 'prompt' ? (
                <div style={coinWrap}>
                  <div style={coin} aria-label="Bullseye coin spinning" />
                </div>
              ) : flow.step === 'confirmed' ? (
                <div className="bls-dot bls-dot--ok">✓</div>
              ) : (
                <div className="bls-dot bls-dot--err">!</div>
              )}
            </div>

            <div className="bls-sub">
              {flow.step === 'prompt'   && (flow.message || 'Please confirm in your wallet…')}
              {flow.step === 'pending'  && (flow.message || 'Transaction pending…')}
              {flow.step === 'confirmed'&& 'Transaction confirmed'}
              {flow.step === 'error'    && (flow.message || 'Transaction failed')}
            </div>

            {flow.txHash && (
              <a href={otterscanTx(flow.txHash)} target="_blank" rel="noreferrer" className="bls-link">
                View on Otter ({short(flow.txHash)})
              </a>
            )}

            {/* sparkles eleganti */}
            <div className="bls-sparkles" aria-hidden>
              <span/><span/><span/><span/><span/><span/><span/><span/>
            </div>
          </div>

          {/* CSS locale del nuovo overlay */}
          <style jsx>{`
            /* Aurora morbida sul backdrop */
            .bls-aurora {
              position: absolute;
              width: 60vmax;
              height: 60vmax;
              filter: blur(60px);
              opacity: .35;
              z-index: 0;
            }
            .bls-aurora--1 {
              top: -10vmax; left: -8vmax;
              background: radial-gradient(45% 45% at 50% 50%, rgba(124,200,255,.70) 0%, rgba(63,131,248,.55) 35%, rgba(34,211,238,.35) 65%, rgba(0,0,0,0) 75%);
              animation: blsAuroraShift 12s ease-in-out infinite alternate;
            }
            .bls-aurora--2 {
              bottom: -12vmax; right: -10vmax;
              background: radial-gradient(40% 40% at 50% 50%, rgba(56,189,248,.65) 0%, rgba(99,102,241,.45) 40%, rgba(14,165,233,.35) 70%, rgba(0,0,0,0) 80%);
              animation: blsAuroraShift 14s ease-in-out infinite alternate-reverse;
            }
            @keyframes blsAuroraShift {
              0%   { transform: translate3d(0,0,0) scale(1); }
              100% { transform: translate3d(2%, -2%, 0) scale(1.06); }
            }

            /* CARD principale: vetro azzurro + bordo glow */
            .bls-genie-card {
              position: relative;
              z-index: 1;
              width: min(420px, 94vw);
              min-height: 340px;
              padding: 26px 20px 26px;
              border-radius: 18px;
              color: #eaf6ff;
              background:
                linear-gradient(180deg, rgba(28,41,58,.72) 0%, rgba(16,25,39,.78) 100%),
                radial-gradient(120% 80% at 0% 0%, rgba(124,200,255,.20) 0%, rgba(124,200,255,0) 60%);
              box-shadow:
                0 18px 55px rgba(0,0,0,.55),
                inset 0 0 0 1px rgba(120,170,240,.25);
              border: 1px solid rgba(100,160,255,.28);
              overflow: hidden;
              backdrop-filter: blur(10px);
            }
            /* bordo esterno con gradiente brillante */
            .bls-genie-card::before {
              content:'';
              position:absolute; inset:-1px;
              border-radius: inherit;
              background: conic-gradient(from 120deg,
                rgba(124,200,255,.85),
                rgba(34,211,238,.85),
                rgba(59,130,246,.9),
                rgba(124,200,255,.85));
              mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
              -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
              -webkit-mask-composite: xor;
              mask-composite: exclude;
              padding: 1px;
              opacity: .22;
              pointer-events:none;
              filter: saturate(120%);
            }
            /* glow morbido interno */
            .bls-card-glow {
              position: absolute; inset: 0;
              pointer-events: none;
              background:
                radial-gradient(180px 140px at 50% 15%, rgba(124,200,255,.18), transparent 60%),
                radial-gradient(220px 160px at 20% 80%, rgba(34,211,238,.12), transparent 60%),
                radial-gradient(220px 160px at 80% 80%, rgba(59,130,246,.12), transparent 60%);
              animation: blsGlowPulse 3.8s ease-in-out infinite;
            }
            @keyframes blsGlowPulse {
              0%,100% { opacity: .7; transform: scale(1); }
              50%     { opacity: 1;  transform: scale(1.02); }
            }

            /* Header */
            .bls-card-head {
              position: relative;
              display:flex; align-items:center; justify-content:flex-end;
              margin-bottom: 10px;
            }
            .bls-head-title {
              position:absolute; left:50%; transform:translateX(-50%);
              font-size: 20px; font-weight: 800; letter-spacing: .4px;
              background: linear-gradient(90deg, #b6e2ff 0%, #7cc8ff 40%, #22d3ee 70%, #7cc8ff 100%);
              -webkit-background-clip: text; -webkit-text-fill-color: transparent;
              text-shadow: 0 0 18px rgba(124,200,255,.25);
            }
            .bls-close {
              background: transparent; border: 0; font-size: 20px; cursor: pointer;
              color: rgba(226,242,255,.85);
              padding: 2px 6px; border-radius: 10px;
              transition: transform .15s ease, background .2s ease, color .2s ease;
            }
            .bls-close:hover { transform: scale(1.08); background: rgba(124,200,255,.12); color: #fff; }

            /* Riga dettagli */
            .bls-pair {
              display:flex; align-items:center; justify-content:center; gap:10px;
              font-weight:700; color:#eaf6ff; margin-top: 2px; margin-bottom: 12px; flex-wrap:wrap;
              text-shadow: 0 1px 0 rgba(0,0,0,.35);
            }
            .bls-sym { opacity:.82; font-weight:800; }
            .bls-arrow { opacity:.6; padding: 0 6px; }

            /* Parte centrale con mist */
            .bls-center {
              position: relative;
              display:flex; align-items:center; justify-content:center;
              min-height: 120px;
            }
            .bls-halo {
              position: absolute;
              width: 160px; height: 160px; border-radius: 50%;
              background: radial-gradient(closest-side, rgba(124,200,255,.28), rgba(124,200,255,0));
              filter: blur(10px);
              animation: blsPulseRing 2.6s ease-in-out infinite;
              z-index: 0;
            }
            @keyframes blsPulseRing {
              0%,100% { transform: scale(1); opacity:.9; }
              50%     { transform: scale(1.08); opacity:1; }
            }
            .bls-mist {
              position:absolute; border-radius: 50%;
              filter: blur(24px);
              opacity: .28;
              mix-blend-mode: screen;
            }
            .bls-mist--a {
              width: 220px; height: 120px; top: 10px;
              background: radial-gradient(60% 60% at 50% 50%, rgba(124,200,255,.45), rgba(124,200,255,0) 70%);
              animation: blsMistRise 6s ease-in-out infinite alternate;
            }
            .bls-mist--b {
              width: 180px; height: 100px; bottom: 0;
              background: radial-gradient(60% 60% at 50% 50%, rgba(34,211,238,.40), rgba(34,211,238,0) 70%);
              animation: blsMistRise 7.5s ease-in-out infinite alternate-reverse;
            }
            @keyframes blsMistRise {
              0%   { transform: translateY(6px) scale(1);     opacity: .22; }
              100% { transform: translateY(-6px) scale(1.05); opacity: .35; }
            }

            /* Dot stati (riuso i colori ma con stile) */
            .bls-dot {
              width: 58px; height: 58px; border-radius: 50%;
              display:flex; align-items:center; justify-content:center;
              font-weight:900; font-size:28px; color:#fff; z-index:1;
              box-shadow: 0 10px 24px rgba(0,0,0,.35);
            }
            .bls-dot--ok  { background: linear-gradient(180deg, #34d399, #10b981); }
            .bls-dot--err { background: linear-gradient(180deg, #ef4444, #b91c1c); }

            /* Messaggi */
            .bls-sub {
              margin-top: 10px;
              text-align:center;
              font-weight: 600;
              color: #d9efff;
              text-shadow: 0 1px 0 rgba(0,0,0,.35);
            }
            .bls-link {
              display:inline-block; margin-top: 6px;
              color:#9ad7ff; text-decoration: underline; font-weight:800;
              transition: color .2s ease, text-shadow .2s ease;
            }
            .bls-link:hover { color:#c8ecff; text-shadow: 0 0 10px rgba(124,200,255,.45); }

            /* Sparkles very soft */
            .bls-sparkles { position:absolute; inset:0; pointer-events:none; z-index:0; }
            .bls-sparkles span {
              position:absolute; width:2px; height:2px; background: #fff; border-radius:50%;
              opacity:.0; filter: blur(.2px);
              animation: blsTwinkle 3.5s ease-in-out infinite;
            }
            .bls-sparkles span:nth-child(1){ top:8%;  left:18%; animation-delay:.2s;}
            .bls-sparkles span:nth-child(2){ top:22%; left:74%; animation-delay:.8s;}
            .bls-sparkles span:nth-child(3){ top:40%; left:8%;  animation-delay:1.6s;}
            .bls-sparkles span:nth-child(4){ top:52%; left:48%; animation-delay:.4s;}
            .bls-sparkles span:nth-child(5){ top:66%; left:78%; animation-delay:2.1s;}
            .bls-sparkles span:nth-child(6){ top:72%; left:28%; animation-delay:1.2s;}
            .bls-sparkles span:nth-child(7){ top:86%; left:56%; animation-delay:2.6s;}
            .bls-sparkles span:nth-child(8){ top:30%; left:56%; animation-delay:1.0s;}
            @keyframes blsTwinkle {
              0%,100% { opacity:0; transform: scale(1); }
              40%     { opacity:.8; transform: scale(1.6); }
            }
  /* Animazioni coin spin + flip-away integrate */
  @keyframes blsSpinY {
    0% { transform: rotateY(0deg); }
    100% { transform: rotateY(360deg); }
  }

  #swap-anim-shell.bls-warp {
    animation: blsSpinShrinkAway 0.8s linear forwards;
  }
  @keyframes blsSpinShrinkAway {
    0% {
      transform: translateZ(0) rotateY(0deg) scale(1);
      opacity: 1;
    }
    100% {
      transform: translateZ(-2400px) rotateY(720deg) scale(0.02);
      opacity: 0;
    }
  }

/* ↓↓ Pause animazioni quando si digita o se l’utente preferisce meno motion ↓↓ */
@media (prefers-reduced-motion: reduce) {
  #swap-anim-shell,
  .bls-sparkles,
  .bls-brand-3d {
    animation: none !important;
    transition: none !important;
  }
}
.bls-reduce-motion #swap-anim-shell,
.bls-reduce-motion .bls-sparkles,
.bls-reduce-motion .bls-brand-3d {
  animation: none !important;
  transition: none !important;
}


  .bls-preview-enter {
    animation: blsSpinGrowIn 0.8s linear forwards;
  }
  @keyframes blsSpinGrowIn {
    0% {
      transform: translateZ(-2400px) rotateY(-720deg) scale(0.02);
      opacity: 0;
    }
    100% {
      transform: translateZ(0) rotateY(0deg) scale(1);
      opacity: 1;
    }
  }

          `}</style>
        </div>
      )}


      <div className={style.wrapper + (editing ? ' bls-reduce-motion' : '')}>
        {/* SHELL con animazione flip-away */}
        {/* SHELL con animazione flip-away */}
{!previewOpen && (
  <div
    id="swap-anim-shell"
    className={warp ? 'bls-warp' : ''}
    style={{ transformStyle: 'preserve-3d', perspective: '1200px', willChange: 'transform, opacity', transition: 'transform .2s ease' }}
  >
    <div
      id="swap-page"
      className="rounded-2xl p-6 shadow-lg"
      style={{ transform: 'perspective(800px)', transition: 'transform 0.25s ease-out' }}
    >


 

            {/* Header pannello */}
            <div className={style.formHeader}>
              <div className="flex items-center gap-3">
                <div className="bls-brand-title bls-brand-title--panel bls-brand-3d">Bullscope Swap</div>
              </div>
              <button
                id="bls-slippage-btn"
                aria-label="Open slippage settings"
                onClick={() => setSlippageOpen(true)}
                className="inline-flex items-center justify-center"
                title="Slippage settings"
              >
                <RiSettings3Fill />
              </button>
            </div>

            {/* You pay */}
            <div className={`${style.transferPropContainer} bls-row bls-row--thick justify-between`}>
              <div className="row-title">You pay</div>

              <div className="balance-pill">
                <span>
                  Balance{' '}
                  {payRB
                    ? `${Number(payRB.formatted).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${payToken.symbol}`
                    : '-'}
                </span>
                {payRB && payRB.raw > 0n && (
                  <button
                    className="max-btn"
                    onClick={()=>{
                      let raw = payRB.raw
                      if (payToken.address === 'native' && raw > GAS_BUFFER_WEI) raw -= GAS_BUFFER_WEI
                      const v = formatUnitsBI(raw, payRB.decimals, 18)
                      setAmountIn(v)
                      setLastEdited('in')
                      ctxHandleChange({ target: { value: v } } as any, 'amount')
                    }}
                  >MAX</button>
                )}
              </div>

              <div className={style.currencySelector}>
                <button className="token-select token-select--clean" onClick={() => openSelector('pay')}>
                  <img className="token-icon" src={iconSrc(payToken)} alt={payToken.symbol} onError={iconFallback}/>
                  <span className="token-ticker">{payToken.symbol}</span>
                  <AiOutlineDown className="token-chevron" />
                </button>
              </div>

              <div className="amount-input flex-1 text-right" style={{ position:'relative' }}>
                <input
  inputMode="decimal"
  autoComplete="off"
  type="text"
  className={style.transferPropInput + ' text-right amount--lower'}
  placeholder="0.0"
  pattern="^[0-9]*[.,]?[0-9]*$"
  value={amountIn}
  onFocus={() => setEditing(true)}
  onBlur={() => setEditing(false)}
  onChange={(e) => {
    setAmountIn(e.target.value)
    setLastEdited('in')
    ctxHandleChange(e, 'amount')
  }}
/>

                <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(230,238,250,0.90)', textAlign: 'right' }}>
                  {usdUnderPay}
                </div>
                {(!amountIn || Number(toNum(amountIn)) === 0) ? null : insufficientBalance && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#ef4444', textAlign: 'right', fontWeight: 700 }}>
                    Insufficient balance
                  </div>
                )}
                {sameTokenSelected && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#ef4444', textAlign: 'right', fontWeight: 700 }}>
                    Select a different token
                  </div>
                )}
              </div>
            </div>

            {/* Flip */}
            <div style={centerArrowWrap}>
              <button
                style={centerArrowBtn}
                className="flip-btn"
                onClick={flip}
                aria-label="Switch tokens"
              >
                ↓
              </button>
            </div>

            {/* You receive */}
            <div className={`${style.transferPropContainer} bls-row bls-row--thick justify-between`}>
              <div className="row-title">You receive</div>

              <div className="balance-pill">
                <span>
                  Balance{' '}
                  {rcvRB
                    ? `${Number(rcvRB.formatted).toLocaleString('en-US', { maximumFractionDigits: 6 })} ${rcvToken.symbol}`
                    : '-'}
                </span>
              </div>

              <div className={style.currencySelector}>
                <button className="token-select token-select--clean" onClick={() => openSelector('receive')}>
                  <img className="token-icon" src={iconSrc(rcvToken)} alt={rcvToken.symbol} onError={iconFallback}/>
                  <span className="token-ticker">{rcvToken.symbol}</span>
                  <AiOutlineDown className="token-chevron" />
                </button>
              </div>

              <div className="amount-input flex-1 text-right" style={{ position: 'relative' }}>
                <input
  inputMode="decimal"
  autoComplete="off"
  type="text"
  className={style.transferPropInput + ' text-right amount--lower'}
  placeholder="0.0"
  value={amountOut}
  onFocus={() => setEditing(true)}
  onBlur={() => setEditing(false)}
  onChange={(e) => {
    setAmountOut(e.target.value)
    setLastEdited('out')
  }}
  readOnly={false}
/>

                <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(230,238,250,0.90)', textAlign: 'right' }}>
                  {usdUnderRcv}
                </div>
              </div>
            </div>

            {/* Azione */}
            <div className="actions">
              <SwapActionButton
                onSwap={openPreview}
                disabled={isLoading || !formValid}
                labelSwap="Swap"
              />
            </div>
          </div>
        </div>
)}

        {/* Loader TX legacy */}
        {router.query.loading ? (
          <Modal isOpen style={modalStyles}>
            <TransactionLoader />
          </Modal>
        ) : null}

        {/* Slippage Panel */}
        <Modal isOpen={slippageOpen} onRequestClose={() => setSlippageOpen(false)} style={modalStyles}>
          <div className="bls-slippage-panel">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Slippage &amp; Deadline</div>
              <button className="text-sm opacity-80 hover:opacity-100" onClick={() => setSlippageOpen(false)}>Close</button>
            </div>

            <div className="mb-3">
              <div className="dim mb-2">Auto presets</div>
              <div className="flex gap-2">
                {['0.1','0.5','1','3','5','6'].map(v=>(
                  <button key={v}
                    className={`px-3 py-2 rounded-lg border ${slippage===v?'bg-white/10 border-white/60':'bg-white/5 border-white/30'}`}
                    onClick={()=>setSlippage(v)}>{v}%</button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <div className="dim mb-2">Custom slippage %</div>
              <input type="number" min="0" step="0.1"
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/30"
                value={slippage} onChange={(e)=>setSlippage(e.target.value)} placeholder={DEFAULT_USER_SLIPPAGE}/>
            </div>

            <div className="mb-4">
              <div className="dim mb-2">Tx deadline (minutes)</div>
              <input type="number" min="1" step="1"
                className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/30"
                value={deadline} onChange={(e)=>setDeadline(e.target.value)} placeholder="20"/>
            </div>

            <button className="confirm-btn w-full" onClick={saveSlippage}>Save</button>
          </div>
        </Modal>

        {/* Token Selector Overlay */}
        <TokenSelector
          open={selOpen}
          side={selSide}
          account={account || undefined}
          onClose={() => setSelOpen(false)}
          onSelect={onSelect}
          excludeAddress={selSide === 'pay' ? (rcvToken.address || '') : (payToken.address || '')}
        />

        {/* Preview Modal */}
        <SwapPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          onConfirm={() => { setPreviewOpen(false); onSwapClick() }}
          payToken={payToken}
          rcvToken={rcvToken}
          amountIn={amountIn || '—'}
          amountOutEst={preview.amountOutEst || ''}
          priceLabel={preview.priceLabel || '—'}
          slippagePct={`${slippage || DEFAULT_USER_SLIPPAGE}%`}
          minReceivedLabel={preview.minReceivedLabel || '—'}
          priceImpactLabel={preview.priceImpactLabel || '—'}
        />
      </div>

      
    </>
  )
}

export default Main
