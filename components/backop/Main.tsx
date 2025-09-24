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
// Aggregatore per quote
const QUOTE_ROUTER = '0xDA9aBA4eACF54E0273f56dfFee6B8F1e20B23Bba' // PulseXswap aggregator (quote first)
// Fallback Router02 PulseX (per getAmountsOut se l’agg. non risponde)
const ROUTER02 = '0x165C3410fC91EF562C50559f7d2289fEbed552d9'
// Tuo Bullscope Router per lo SWAP reale
const BULLSCOPE_ROUTER = '0x6CE485B02Cf97a69D8bAbfe18AF83D6a0c829Dde'
// WPLS
const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'

// ====== Slippage/fee ======
// Extra nascosto **totale 0.7%** (include 0.5% router + 0.2% margine).
// Questo si somma SEMPRE allo slippage utente per calcolare `amountOutMin`,
// ma NON influisce sul "valore slippage" mostrato all'utente.
const HIDDEN_BPS = 70      // 0.70%
const DEFAULT_USER_SLIPPAGE = '0.5' // valore iniziale pannello

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
  const [int, frac = ''] = s.replace(',', '.').split('.')
  const f = (frac + '0'.repeat(decimals)).slice(0, decimals)
  const n = BigInt(int || '0') * (10n ** BigInt(decimals)) + BigInt(f || '0')
  return n
}
const addrParam = (addr: string) => ('0'.repeat(24) + addr.toLowerCase().replace(/^0x/, ''))
function encodeGetAmountsOut(amountIn: bigint, path: string[]) {
  const amountHex = amountIn.toString(16).padStart(64, '0')
  const head = SELECTOR.getAmountsOut + amountHex + (64).toString(16).padStart(64, '0') // offset
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
  return window.ethereum.request({ method: 'eth_call', params: [{ to, data }, 'latest'] }) as Promise<string>
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
  const res = await ethCall(tokenAddr, SELECTOR.decimals)
  const n = parseInt(res, 16)
  const d = Number.isFinite(n) ? n : 18
  decimalsCache.set(tokenAddr, d)
  return d
}
async function erc20BalanceOf(tokenAddr: string, account: string): Promise<bigint> {
  const data = SELECTOR.balanceOf + addrParam(account)
  const res = await ethCall(tokenAddr, data)
  return hexToBigInt(res)
}

// ====== Explorer link (Otter PulseChain) ======
const otterscanTx = (hash?: string|null) => hash ? `https://otter.pulsechain.com/tx/${hash}` : '#'
const short = (h?: string|null) => h ? (h.slice(0,6)+'…'+h.slice(-4)) : ''

// ====== Overlay (Approve + Swap) ======
type FlowMode = 'approve' | 'swap'
type FlowStep = 'prompt' | 'pending' | 'confirmed' | 'error'
type FlowState = {
  open: boolean
  mode: FlowMode
  step: FlowStep
  message?: string
  txHash?: string
}
const initialFlow: FlowState = { open: false, mode: 'swap', step: 'prompt', message: '' }

const overlayWrap: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(2px)'
}

/* Overlay card: più stretta e leggermente più alta, centrata.
   Sfondo azzurrino chiarissimo. */
const card: React.CSSProperties = {
  width: 'min(420px, 92vw)',         // ← più stretto
  background: 'linear-gradient(180deg, #f7fbff 0%, #e9f4ff 100%)',
  color:'#0f1622',
  border: '1px solid rgba(150,190,255,.65)',
  borderRadius: 16,
  boxShadow: '0 16px 44px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.45) inset',
  padding: '26px 18px',              // ← un filo più alto (padding verticale)
}

/* Monetina che gira */
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
const titleCss: React.CSSProperties = { fontSize:18, fontWeight:800 }
const subCss: React.CSSProperties = { opacity:.85, fontWeight:600 }
const linkCss: React.CSSProperties = { color:'#0b5bd7', textDecoration:'underline', fontWeight:700 }

/* Riga dettagli swap (icona+quantità+symbol → icona+quantità+symbol) */
const pairRow: React.CSSProperties = {
  display:'flex', alignItems:'center', justifyContent:'center', gap:10,
  fontWeight:700, color:'#0f1622', marginTop:2, marginBottom:10, flexWrap:'wrap'
}
const amtCss: React.CSSProperties = { fontVariantNumeric:'tabular-nums' }
const tokenIconCss: React.CSSProperties = { width:18, height:18, borderRadius:999 }

function friendlyError(e: any): string {
  const code = e?.code ?? e?.error?.code ?? e?.info?.error?.code
  const msg = (e?.message || e?.shortMessage || e?.reason || '').toString().toLowerCase()
  const dataMsg = (e?.data?.message || '').toString().toLowerCase()
  const full = `${msg} ${dataMsg}`

  if (code === 4001 || /user rejected|rejected the request|transaction rejected/.test(full))
    return 'Request rejected in wallet.'
  if (/insufficient_output_amount|pulsexrouter: insufficient_output_amount/.test(full))
    return 'Please increase slippage or reduce input amount.'
  if (/unpredictable gas limit|cannot estimate gas/.test(full))
    return 'Transaction cannot be estimated. Try higher slippage or smaller amount.'
  if (/transfer_from_failed|transferhelper: transfer_from_failed/.test(full))
    return 'Token transfer failed. Check allowance and balance.'
  if (/insufficient funds|exceeds balance|not enough/i.test(full))
    return 'Insufficient balance for this transaction.'
  return 'Transaction failed. Please try again with higher slippage.'
}

// ====== Main ======
const Main: React.FC = () => {
  const router = useRouter()
  const { formData, handleChange, isLoading } = useContext(TransactionContext)

  useEffect(() => { if (typeof window !== 'undefined') Modal.setAppElement('#__next') }, [])

  // 🔒 intercetta errori globali per NON uscire dalla pagina (dev overlay di Next)
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

  // selector overlay
  const [selOpen, setSelOpen] = useState(false)
  const [selSide, setSelSide] = useState<'pay' | 'receive'>('pay')
  const openSelector = (side: 'pay' | 'receive') => { setSelSide(side); setSelOpen(true) }
  const onSelect = (t: Token) => (selSide === 'pay' ? setPayToken(t) : setRcvToken(t))

  // flip
  const flip = () => {
    const pt = payToken, rt = rcvToken, ai = amountIn, ao = amountOut
    setPayToken(rt); setRcvToken(pt); setAmountIn(ao); setAmountOut(ai)
    setBestPath(null)
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
  async function refreshBalance(token: Token, setter: (v: RB|null)=>void) {
    try {
      if (!window.ethereum) { setter(null); return }
      const ok = await ensurePulseChain(); if (!ok) { setter(null); return }
      const accs: string[] = await window.ethereum.request({ method: 'eth_accounts' })
      const acc = accs?.[0]; if (!acc) { setter(null); return }
      if (token.address === 'native') {
        const wei = await window.ethereum.request({ method: 'eth_getBalance', params: [acc, 'latest'] })
        const raw = hexToBigInt(wei); const formatted = formatUnitsBI(raw, 18)
        setter({ raw, decimals: 18, formatted })
      } else {
        const [dec, raw] = await Promise.all([getTokenDecimals(token.address), erc20BalanceOf(token.address, acc)])
        const formatted = formatUnitsBI(raw, dec)
        setter({ raw, decimals: dec, formatted })
      }
    } catch { setter(null) }
  }
  useEffect(() => { refreshBalance(payToken, setPayRB) }, [payToken, account])
  useEffect(() => { refreshBalance(rcvToken, setRcvRB) }, [rcvToken, account])

  // ====== QUOTE (aggregatore con fallback) ======
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const wrapAddr = (tok: Token) => (tok.address === 'native' ? WPLS : tok.address)
  const candidatePaths = useMemo(() => {
    const a = wrapAddr(payToken), b = wrapAddr(rcvToken)
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

  useEffect(() => {
    if (!window.ethereum) return
    if (!amountIn || Number(amountIn) <= 0) { setAmountOut(''); setBestPath(null); return }
    if (!payToken || !rcvToken) { setAmountOut(''); setBestPath(null); return }

    if (quoteTimer.current) clearTimeout(quoteTimer.current)
    quoteTimer.current = setTimeout(async () => {
      try {
        const ok = await ensurePulseChain(); if (!ok) return
        const inDec = await getTokenDecimals(payToken.address)
        const outDec = await getTokenDecimals(rcvToken.address)
        const amountRaw = parseUnitsBI(amountIn, inDec)

        let bestOut = 0n
        let best: string[] | null = null

        for (const path of candidatePaths) {
          // 1) prova aggregatore
          let out = await tryGetAmountsOut(QUOTE_ROUTER, amountRaw, path)
          // 2) fallback su Router02 se 0
          if (out === 0n) out = await tryGetAmountsOut(ROUTER02, amountRaw, path)
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
    }, 300)

    return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current) }
  }, [amountIn, candidatePaths, payToken, rcvToken])

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
    resetSlippageToDefault()              // ⟵ reset slippage quando finisce con errore
    if (hideLater.current) clearTimeout(hideLater.current)
    hideLater.current = setTimeout(() => setFlow(initialFlow), 4200)
  }
  const markConfirmed = (hash?: string) => {
    setFlow(f => ({ ...f, step:'confirmed', txHash: hash }))
    resetSlippageToDefault()              // ⟵ reset slippage quando finisce con successo
    if (hideLater.current) clearTimeout(hideLater.current)
    hideLater.current = setTimeout(() => setFlow(initialFlow), 4200)
  }
  useEffect(() => () => { if (hideLater.current) clearTimeout(hideLater.current) }, [])

  // ====== SWAP REALE (Bullscope Router) ======
  const onSwapClick = async () => {
    try {
      if (!window.ethereum) return
      const ok = await ensurePulseChain(); if (!ok) return

      // connect se serve
      openFlow('swap', 'prompt', 'Please confirm in your wallet…')
      const accs = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const user = accs?.[0]; if (!user) return

      // provider/signer (compat v5/v6)
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

      // path: usa il migliore trovato dal quote; se manca, usa la più semplice
      const basePath = bestPath || candidatePaths[0]

      // calcola outRaw per minOut:
      const outRawAgg = await tryGetAmountsOut(QUOTE_ROUTER, amtIn, basePath)
      const outRaw = outRawAgg > 0n ? outRawAgg : await tryGetAmountsOut(ROUTER02, amtIn, basePath)

      // calcolo minOut: slippage utente + extra nascosto (0.7%)
      const slipUserBps = Math.max(0, Math.round((Number(slippage || '0') || 0) * 100))
      const totalCut = BigInt(Math.min(9999, slipUserBps + HIDDEN_BPS))
      const minOut = outRaw > 0n ? (outRaw * (10000n - totalCut)) / 10000n : 0n

      const path = basePath
      const deadlineTs = Math.floor(Date.now() / 1000) + Math.max(60, (Number(deadline || '20') || 20) * 60)

      const isNativeIn  = (payToken.address === 'native')
      const isNativeOut = (rcvToken.address === 'native')

      // ====== APPROVE (se necessario) — overlay: Enable spending ======
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

      // ====== SWAP — overlay: Confirm swap ======
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

      // refresh balances
      refreshBalance(payToken, setPayRB)
      refreshBalance(rcvToken, setRcvRB)
    } catch (e: any) {
      console.error('[BLS swap error]', e)
      // Mostra errore amichevole SENZA far uscire dalla pagina
      markError(friendlyError(e))
    }
  }

  const formValid = Boolean(amountIn && Number(amountIn) > 0)

  const iconSrc = (path?: string) => path || '/images/tokens/metamask.png'

  return (
    <>
      {/* Overlay animazione Approve/Swap */}
      {flow.open && (
        <div style={overlayWrap}>
          <div style={card}>
            <div style={{...row, justifyContent:'space-between', marginBottom:8}}>
              <div style={titleCss}>
                {flow.mode === 'approve' ? 'Enable Spending' : 'Confirm Swap'}
              </div>
              <button
                onClick={()=>setFlow(initialFlow)}
                className="text-sm opacity-75 hover:opacity-100"
                aria-label="Close"
              >✕</button>
            </div>

            {/* Dettagli swap: icon+amount+symbol → icon+amount+symbol */}
            <div style={pairRow}>
              <img src={iconSrc(payToken.icon)} alt={payToken.symbol} style={tokenIconCss}/>
              <span style={amtCss}>{amountIn || '—'}</span>
              <span style={{opacity:.75, fontWeight:800}}> {payToken.symbol} </span>
              <span style={{opacity:.6, padding:'0 6px'}}>→</span>
              <img src={iconSrc(rcvToken.icon)} alt={rcvToken.symbol} style={tokenIconCss}/>
              <span style={amtCss}>{amountOut ? `≈ ${amountOut}` : '—'}</span>
              <span style={{opacity:.75, fontWeight:800}}> {rcvToken.symbol} </span>
            </div>

            <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:12, padding:'10px 6px 4px'}}>
              {flow.step === 'pending' || flow.step === 'prompt' ? (
                <div style={coinWrap}>
                  <div style={coin} aria-label="Bullseye coin spinning" />
                </div>
              ) : flow.step === 'confirmed' ? (
                <div style={checkDot}>✓</div>
              ) : (
                <div style={errDot}>!</div>
              )}

              <div style={subCss}>
                {flow.step === 'prompt'   && (flow.message || 'Please confirm in your wallet…')}
                {flow.step === 'pending'  && (flow.message || 'Transaction pending…')}
                {flow.step === 'confirmed'&& 'Transaction confirmed'}
                {flow.step === 'error'    && (flow.message || 'Transaction failed')}
              </div>

              {flow.txHash && (
                <a href={otterscanTx(flow.txHash)} target="_blank" rel="noreferrer" style={linkCss}>
                  View on Otter ({short(flow.txHash)})
                </a>
              )}
            </div>
          </div>

          {/* keyframes coin 3D */}
          <style jsx>{`
            @keyframes blsSpinY { 
              0% { transform: rotateY(0deg); } 
              100% { transform: rotateY(360deg); } 
            }
          `}</style>
        </div>
      )}

      <div className={style.wrapper}>
        <div id="swap-page" className="rounded-2xl p-6 shadow-lg">
          {/* Header del pannello */}
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
              <span>Balance: {payRB ? `${payRB.formatted} ${payToken.symbol}` : '-'}</span>
              {payRB && payRB.raw > 0n && (
                <button
                  className="max-btn"
                  onClick={()=>{
                    let raw = payRB.raw
                    if (payToken.address === 'native' && raw > 2000000000000000n) raw -= 2000000000000000n // ~0.002 PLS gas
                    const v = formatUnitsBI(raw, payRB.decimals, 18)
                    setAmountIn(v); handleChange({ target: { value: v } } as any, 'amount')
                  }}
                >MAX</button>
              )}
            </div>

            <div className={style.currencySelector}>
              <button className="token-select token-select--clean" onClick={() => openSelector('pay')}>
                <img className="token-icon" src={iconSrc(payToken.icon)} alt={payToken.symbol} />
                <span className="token-ticker">{payToken.symbol}</span>
                <AiOutlineDown className="token-chevron" />
              </button>
            </div>

            <div className="amount-input flex-1 text-right">
              <input
                type="text"
                className={style.transferPropInput + ' text-right amount--lower'}
                placeholder="0.0"
                pattern="^[0-9]*[.,]?[0-9]*$"
                value={amountIn}
                onChange={(e) => { setAmountIn(e.target.value); handleChange(e, 'amount') }}
              />
            </div>
          </div>

          {/* Flip */}
          <div style={centerArrowWrap}>
            <button style={centerArrowBtn} onClick={flip} aria-label="Switch tokens">↓</button>
          </div>

          {/* You receive */}
          <div className={`${style.transferPropContainer} bls-row bls-row--thick justify-between`}>
            <div className="row-title">You receive</div>

            <div className="balance-pill">
              <span>Balance: {rcvRB ? `${rcvRB.formatted} ${rcvToken.symbol}` : '-'}</span>
              {rcvRB && rcvRB.raw > 0n && (
                <button className="max-btn" onClick={()=>{
                  const v = formatUnitsBI(rcvRB.raw, rcvRB.decimals, 18)
                  setAmountOut(v)
                }}>MAX</button>
              )}
            </div>

            <div className={style.currencySelector}>
              <button className="token-select token-select--clean" onClick={() => openSelector('receive')}>
                <img className="token-icon" src={iconSrc(rcvToken.icon)} alt={rcvToken.symbol} />
                <span className="token-ticker">{rcvToken.symbol}</span>
                <AiOutlineDown className="token-chevron" />
              </button>
            </div>

            <div className="amount-input flex-1 text-right">
              <input
                type="text"
                className={style.transferPropInput + ' text-right amount--lower'}
                placeholder="0.0"
                value={amountOut}
                onChange={(e) => setAmountOut(e.target.value)}
                readOnly={false}
              />
            </div>
          </div>

          {/* Azione */}
          <div className="actions">
            <SwapActionButton onSwap={onSwapClick} disabled={isLoading || !formValid} />
          </div>
        </div>

        {/* Loader TX legacy (resta invariato) */}
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
        />
      </div>
    </>
  )
}

export default Main
