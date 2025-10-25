import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AiOutlineDown } from 'react-icons/ai'
import TokenSelector, { DEFAULT_TOKENS, Token } from './TokenSelector'
import { ethers } from 'ethers'

declare global { interface Window { ethereum?: any } }

// ===== Chain & contracts
const PULSE_CHAIN_HEX = '0x171'
const RPC_URL = 'https://rpc.pulsechain.com'
const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'
const LIMIT_ADDRESS = '0xFEa1023F5d52536beFc71c3404E356ae81C82F4B'

// ===== ABIs minimi
const ABI_LIMIT = [
  'function placeOrderPLS(address tokenOut,uint256 minOut,uint256 expiry) payable returns (uint256)',
  'function placeOrderERC20(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 expiry) payable returns (uint256)',
]
const ABI_ERC20 = [
  'function decimals() view returns (uint8)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
]
const SELECTOR = { decimals: '0x313ce567' }

// ===== helpers numerici
const hexToBigInt = (hex: string) => (!hex || hex === '0x' ? 0n : BigInt(hex))
const addrParam = (a: string) => ('0'.repeat(24) + a.toLowerCase().replace(/^0x/, ''))
const parseUnitsBI = (s: string, decimals = 18) => {
  const [I, F=''] = s.replace(/,/g,'.').split('.')
  const f = (F + '0'.repeat(decimals)).slice(0, decimals)
  return (BigInt(I || '0') * (10n ** BigInt(decimals))) + BigInt(f || '0')
}
const formatUnitsBI = (v: bigint, decimals = 18, maxFrac = 6) => {
  const base = 10n ** BigInt(decimals)
  const i = v / base
  let f = (v % base).toString().padStart(decimals,'0')
  if (maxFrac >= 0) f = f.slice(0, maxFrac)
  f = f.replace(/0+$/,'')
  return i.toString() + (f ? '.'+f : '')
}

// ===== low-level calls + decimals
async function ethCall(to: string, data: string) {
  try {
    if (window.ethereum) {
      const cid = await window.ethereum.request({ method:'eth_chainId' })
      if (cid === PULSE_CHAIN_HEX) {
        return await window.ethereum.request({ method:'eth_call', params:[{ to, data }, 'latest'] }) as string
      }
    }
  } catch {}
  const r = await fetch(RPC_URL, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_call', params:[{ to, data }, 'latest'] })
  })
  const j = await r.json()
  if (j?.error) throw new Error(j.error.message || 'eth_call failed')
  return j.result as string
}
const decimalsCache = new Map<string, number>()
async function getTokenDecimals(addr: string) {
  if (addr === 'native') return 18
  if (decimalsCache.has(addr)) return decimalsCache.get(addr)!
  const res = await ethCall(addr, SELECTOR.decimals)
  const n = parseInt(res, 16)
  const d = Number.isFinite(n) ? n : 18
  decimalsCache.set(addr, d)
  return d
}

// ===== prezzi USD (DEXTools -> Dexscreener)
const DS_TTL = 60_000, DXT_TTL = 30_000
const _dsCache: Record<string, { ts:number; usd:number }> = {}
const _dxtCache: Record<string, { ts:number; usd:number }> = {}
const DEXT_KEY = process.env.NEXT_PUBLIC_DEXTOOLS_KEY || ''

async function dextoolsUsd(addr: string): Promise<number|null> {
  if (!DEXT_KEY) return null
  const k = addr.toLowerCase(), now = Date.now()
  const c = _dxtCache[k]; if (c && now - c.ts < DXT_TTL) return c.usd
  try {
    const r = await fetch(`https://api.dextools.io/v2/token/pulsechain/${k}`, { headers: { 'X-API-Key': DEXT_KEY } })
    if (!r.ok) return null
    const j:any = await r.json()
    const usd = parseFloat(j?.data?.priceUsd ?? j?.data?.price ?? '0') || 0
    if (usd <= 0) return null
    _dxtCache[k] = { ts: now, usd }
    return usd
  } catch { return null }
}
async function dexscreenerUsd(addr: string): Promise<number> {
  const k = addr.toLowerCase(), now = Date.now()
  const c = _dsCache[k]; if (c && now - c.ts < DS_TTL) return c.usd
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${k}`)
    const j:any = await r.json()
    const pairs:any[] = Array.isArray(j?.pairs) ? j.pairs : []
    const best = pairs.find(p => String(p?.chainId||'').toLowerCase().includes('pulse')) || pairs[0]
    const usd = parseFloat(best?.priceUsd ?? '0') || 0
    _dsCache[k] = { ts: now, usd }
    return usd
  } catch { return 0 }
}

// **rapporto corretto**: BUY per 1 SELL  =  USD(sell) / USD(buy)
async function currentRatioBuyPerSell(sellAddr: string, buyAddr: string) {
  const [usdSellDXT, usdBuyDXT] = await Promise.all([
    dextoolsUsd(sellAddr), dextoolsUsd(buyAddr)
  ])
  if (usdSellDXT && usdBuyDXT && usdSellDXT>0 && usdBuyDXT>0) return usdSellDXT / usdBuyDXT

  const [usdSell, usdBuy] = await Promise.all([
    dexscreenerUsd(sellAddr), dexscreenerUsd(buyAddr)
  ])
  if (usdSell>0 && usdBuy>0) return usdSell / usdBuy

  return 0
}

// ===== ensure Pulse
async function ensurePulseChain(): Promise<boolean> {
  if (!window.ethereum) return false
  try {
    const cid = await window.ethereum.request({ method:'eth_chainId' })
    if (cid === PULSE_CHAIN_HEX) return true
    try {
      await window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{ chainId:PULSE_CHAIN_HEX }] })
      return true
    } catch (e:any) {
      if (e?.code === 4902) {
        await window.ethereum.request({ method:'wallet_addEthereumChain', params:[{
          chainId:PULSE_CHAIN_HEX,
          chainName:'PulseChain',
          nativeCurrency:{ name:'Pulse', symbol:'PLS', decimals:18 },
          rpcUrls:[RPC_URL], blockExplorerUrls:['https://scan.pulsechain.com']
        }]} )
        await window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{ chainId:PULSE_CHAIN_HEX }] })
        return true
      }
      return false
    }
  } catch { return false }
}
const friendlyError = (e:any) => {
  const code = e?.code ?? e?.error?.code
  const msg = (e?.message || e?.reason || '').toString().toLowerCase()
  if (code === 4001 || /user rejected|rejected the request/.test(msg)) return 'Request rejected in wallet.'
  if (/insufficient|exceeds balance/.test(msg)) return 'Insufficient balance.'
  return 'Transaction failed. Try again with a smaller amount or higher gas.'
}

// ===== UI
const rowCss = 'relative bg-[#20242A] my-3 rounded-2xl p-4 border border-[#2A2F36] hover:border-[#41444F] flex items-center gap-3'
const pillCss = 'px-3 py-2 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10'

const LimitTab: React.FC = () => {
  // tokens
  const [sell, setSell] = useState<Token>(DEFAULT_TOKENS.find(t => t.symbol === 'PLS')!)
  const [buy,  setBuy]  = useState<Token>(DEFAULT_TOKENS.find(t => t.symbol === 'BLSEYE')!)
  const [selOpen, setSelOpen] = useState(false)
  const [selSide, setSelSide] = useState<'sell'|'buy'>('sell')
  const openSel = (s:'sell'|'buy') => { setSelSide(s); setSelOpen(true) }
  const onSelect = (t:Token) => (selSide==='sell' ? setSell : setBuy)(t)

  // amounts
  const [amountIn, setAmountIn] = useState('')
  const [targetPrice, setTargetPrice] = useState('') // buy per 1 sell
  const [amountOutView, setAmountOutView] = useState('')

  // ref price
  const [ref, setRef] = useState<{v:number, src:string}>({ v:0, src:'—' })
  useEffect(() => {
    let alive = true, timer:any
    const upd = async () => {
      const inA  = (sell.address === 'native' ? WPLS : sell.address)
      const outA = (buy.address  === 'native' ? WPLS : buy.address)
      const r = await currentRatioBuyPerSell(inA, outA)
      if (alive) setRef({ v: r, src: r>0 ? (DEXT_KEY ? 'DEXTools/Dexscreener' : 'Dexscreener') : '—' })
    }
    const loop = () => { timer = setTimeout(async () => { await upd(); loop() }, 30_000) }
    upd(); loop()
    const onVis = () => { if (!document.hidden) { clearTimeout(timer); upd().finally(loop) } }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [sell.address, buy.address])

  // derive amountOutView live
  useEffect(() => {
    const q = parseFloat((amountIn || '0').replace(',','.'))
    const p = parseFloat((targetPrice || '0').replace(',','.'))
    if (q>0 && p>0) setAmountOutView((q*p).toLocaleString('en-US', { maximumFractionDigits: 12 }))
    else setAmountOutView('')
  }, [amountIn, targetPrice])

  // quick set from ref
  const setFromRef = (mult: number) => {
    if (ref.v>0) setTargetPrice((ref.v * mult).toLocaleString('en-US', { maximumFractionDigits: 12 }))
  }

  // place order
  const [placing, setPlacing] = useState(false)
  const place = async () => {
    try {
      if (!window.ethereum) throw new Error('No wallet')
      if (!(await ensurePulseChain())) return
      const accs: string[] = await window.ethereum.request({ method:'eth_requestAccounts' })
      if (!accs?.[0]) return

      setPlacing(true)

      const E:any = ethers as any
      const provider = E.BrowserProvider ? new E.BrowserProvider(window.ethereum) : new E.providers.Web3Provider(window.ethereum)
      const signer   = provider.getSigner ? await provider.getSigner() : await provider.getSigner(0)
      const limit    = new E.Contract(LIMIT_ADDRESS, ABI_LIMIT, signer)

      const inDec  = await getTokenDecimals(sell.address === 'native' ? WPLS : sell.address)
      const outDec = await getTokenDecimals(buy.address  === 'native' ? WPLS : buy.address)

      const amtIn  = parseUnitsBI(amountIn || '0', sell.address === 'native' ? 18 : inDec)
      const tPrice = parseFloat((targetPrice || '0').replace(',','.'))
      if (amtIn <= 0n || !(tPrice>0)) throw new Error('Invalid amount or price')

      const minOut = parseUnitsBI(((Number(formatUnitsBI(amtIn, sell.address==='native'?18:inDec, 18)) * tPrice)).toString(), buy.address==='native'?18:outDec)

      if (sell.address === 'native') {
        const tx = await limit.placeOrderPLS(
          buy.address === 'native' ? WPLS : buy.address,
          minOut,
          0,
          { value: amtIn }
        )
        await tx.wait()
      } else {
        const erc20 = new E.Contract(sell.address, ABI_ERC20, signer)
        const owner = await signer.getAddress()
        const allowance = await erc20.allowance(owner, LIMIT_ADDRESS)
        const allowBI = allowance?._hex ? BigInt(allowance._hex) : BigInt(allowance)
        if (allowBI < amtIn) {
          const txA = await erc20.approve(LIMIT_ADDRESS, amtIn)
          await txA.wait()
        }
        // piccola tip per il keeper se richiesto dallo SC (0.02 PLS); se non serve verrà ignorata
        const tip = 20_000_000_000_000_000n
        const tx = await limit.placeOrderERC20(
          sell.address,
          buy.address === 'native' ? WPLS : buy.address,
          amtIn,
          minOut,
          0,
          { value: tip }
        )
        await tx.wait()
      }

      // reset campi
      setAmountIn(''); setTargetPrice(''); setAmountOutView('')
      alert('Limit order placed ✅')
    } catch (e:any) {
      console.error('[place order]', e)
      alert(friendlyError(e))
    } finally {
      setPlacing(false)
    }
  }

  const iconSrc = (t:Token) => t.icon || (t.address==='native'
    ? '/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png'
    : '/images/no-token.png'
  )

  return (
    <div>
      {/* barra titolo interna come nel pannello swap */}
      <div className="h-[44px] rounded-xl border border-[rgba(120,170,240,.55)] bg-[rgba(255,255,255,.06)] backdrop-blur-[6px] flex items-center justify-center font-semibold mb-3">
        Limit Order Swap
      </div>

      {/* You sell */}
      <div className={rowCss}>
        <div className="absolute top-1 left-4 text-xs opacity-80">You sell</div>
        <button className="token-select token-select--clean"
                onClick={() => openSel('sell')}>
          <img className="token-icon" src={iconSrc(sell)} alt={sell.symbol} />
          <span className="token-ticker">{sell.symbol}</span>
          <AiOutlineDown className="token-chevron" style={{ opacity:.9, fontSize:14, marginLeft:6 }}/>
        </button>
        <input
          inputMode="decimal"
          className="ml-auto bg-transparent outline-none text-3xl text-right w-[45%]"
          placeholder="0.0"
          value={amountIn}
          onChange={e => setAmountIn(e.target.value)}
        />
      </div>

      {/* You buy (solo display, stessa altezza) */}
      <div className={rowCss}>
        <div className="absolute top-1 left-4 text-xs opacity-80">You buy</div>
        <button className="token-select token-select--clean"
                onClick={() => openSel('buy')}>
          <img className="token-icon" src={iconSrc(buy)} alt={buy.symbol} />
          <span className="token-ticker">{buy.symbol}</span>
          <AiOutlineDown className="token-chevron" style={{ opacity:.9, fontSize:14, marginLeft:6 }}/>
        </button>
        <div className="ml-auto text-3xl opacity-90 w-[45%] text-right pr-1 select-none">
          {amountOutView || '—'}
        </div>
      </div>

      {/* Target price */}
      <div className="rounded-2xl border border-[rgba(120,170,240,.55)] p-4 bg-[rgba(255,255,255,.06)] backdrop-blur-[6px]">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Target price</div>
          <div className="text-xs opacity-80">
            Current price: {ref.v>0 ? `${ref.v.toLocaleString('en-US',{maximumFractionDigits:10})} ${buy.symbol}/${sell.symbol}` : 'loading…'}
            <span className="opacity-60"> {ref.v>0 ? `(${ref.src})` : ''}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 outline-none"
            placeholder={`${buy.symbol} per ${sell.symbol}`}
            value={targetPrice}
            onChange={e => setTargetPrice(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2 mt-2">
          <button className={pillCss} onClick={() => setFromRef(1)}>Use current</button>
          <button className={pillCss} onClick={() => setFromRef(0.80)}>-20%</button>
          <button className={pillCss} onClick={() => setFromRef(0.90)}>-10%</button>
          <button className={pillCss} onClick={() => setFromRef(0.95)}>-5%</button>
          <button className={pillCss} onClick={() => setFromRef(1.02)}>+2%</button>
          <button className={pillCss} onClick={() => setFromRef(1.05)}>+5%</button>
          <button className={pillCss} onClick={() => setFromRef(1.10)}>+10%</button>
          <button className={pillCss} onClick={() => setFromRef(1.20)}>+20%</button>
        </div>
      </div>

      {/* Azione */}
      <div className="mt-4">
        <button
          className="confirm-btn w-full disabled:opacity-60"
          disabled={placing || !amountIn || !targetPrice}
          onClick={place}
        >
          {placing ? 'Placing…' : 'Place Limit Order'}
        </button>
      </div>

      {/* Token selector overlay */}
      <TokenSelector
        open={selOpen}
        side={selSide==='sell' ? 'pay' : 'receive'}
        onClose={() => setSelOpen(false)}
        onSelect={onSelect}
        excludeAddress={selSide==='sell' ? (buy.address||'') : (sell.address||'')}
      />

      <style jsx>{`
        .token-select{ display:flex; align-items:center; gap:8px; padding:8px 10px;
          border-radius:12px; border:1px solid rgba(120,170,240,.55); background:rgba(255,255,255,.06) }
        .token-icon{ width:22px; height:22px; border-radius:999px; object-fit:cover }
      `}</style>
    </div>
  )
}

export default LimitTab
