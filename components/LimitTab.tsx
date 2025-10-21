import React, { useEffect, useMemo, useRef, useState } from 'react'
import TokenSelector, { DEFAULT_TOKENS, Token } from './TokenSelector'
import { AiOutlineDown } from 'react-icons/ai'
import { ethers } from 'ethers' // ✅ import diretto, niente più window.ethers

// ====== Chain ======
const PULSE_CHAIN_HEX = '0x171'
const RPC_URL = 'https://rpc.pulsechain.com'
const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'
const LIMIT_ADDRESS = '0xFEa1023F5d52536beFc71c3404E356ae81C82F4B'
const ROUTER = '0x6CE485B02Cf97a69D8bAbfe18AF83D6a0c829Dde'

// ====== Minimal ABIs ======
const ABI_LIMIT = [
  'function placeOrderERC20(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 expiry) payable returns (uint256)',
  'function placeOrderPLS(address tokenOut,uint256 minOut,uint256 expiry) payable returns (uint256)',
  'function cancel(uint256 id)',
  'function orders(uint256) view returns (address maker,address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 expiry,uint256 tipPLS,bool filled,bool cancelled)',
  'function ordersOfMaker(address) view returns (uint256[])'
]
const ABI_ERC20 = [
  'function decimals() view returns (uint8)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)'
]
const SELECTOR = { decimals: '0x313ce567' }

// ====== Helpers ======
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

async function ethCall(address: string, data: string) {
  try {
    if ((window as any)?.ethereum) {
      const cid = await (window as any).ethereum.request({ method: 'eth_chainId' })
      if (cid === PULSE_CHAIN_HEX) {
        return await (window as any).ethereum.request({
          method: 'eth_call',
          params: [{ to: address, data }, 'latest'],
        }) as string
      }
    }
  } catch { }
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: address, data }, 'latest'] }),
  })
  const j = await r.json(); if (j?.error) throw new Error(j.error.message || 'eth_call failed')
  return j.result as string
}
async function getTokenDecimals(addr: string) {
  if (addr === 'native') return 18
  const res = await ethCall(addr, SELECTOR.decimals)
  const n = parseInt(res, 16); return Number.isFinite(n) ? n : 18
}

// ====== Reference Price (Dexscreener) ======
const DS_TTL = 60_000
const _dsCache: Record<string, { ts: number; priceUsd: number; pairs: any[] }> = {}
async function dexscreener(address: string) {
  const key = address.toLowerCase()
  const now = Date.now()
  const c = _dsCache[key]
  if (c && now - c.ts < DS_TTL) return c
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${key}`)
  const j = await r.json()
  const pairs = Array.isArray(j?.pairs) ? j.pairs : []
  const best = pairs.find((p: any) => String(p?.chainId || '').toLowerCase().includes('pulse')) || pairs[0]
  const priceUsd = parseFloat(best?.priceUsd || '0') || 0
  const out = { ts: now, priceUsd, pairs }
  _dsCache[key] = out
  return out
}
async function computePoolMidPrice(tokenIn: string, tokenOut: string) {
  const { pairs } = await dexscreener(tokenIn)
  const onPulse = pairs.filter((p: any) => String(p?.chainId || '').toLowerCase().includes('pulse'))
  if (!onPulse.length) return 0
  onPulse.sort((a: any, b: any) => (parseFloat(b?.liquidity?.usd || '0') || 0) - (parseFloat(a?.liquidity?.usd || '0') || 0))
  const pairAddr = onPulse[0]?.pairAddress
  if (!pairAddr) return 0
  const [t0Hex, t1Hex] = await Promise.all([
    ethCall(pairAddr, '0x0dfe1681'),
    ethCall(pairAddr, '0xd21220a7'),
  ])
  const token0 = '0x' + t0Hex.slice(26)
  const token1 = '0x' + t1Hex.slice(26)
  const res = await ethCall(pairAddr, '0x0902f1ac')
  const r0 = hexToBigInt('0x' + res.slice(2, 66))
  const r1 = hexToBigInt('0x' + res.slice(66, 130))
  const [dIn, dOut] = await Promise.all([getTokenDecimals(tokenIn), getTokenDecimals(tokenOut)])

  let price: number
  if (tokenIn.toLowerCase() === token0.toLowerCase() && tokenOut.toLowerCase() === token1.toLowerCase()) {
    price = Number(formatUnitsBI(r1, dOut, 18)) / Number(formatUnitsBI(r0, dIn, 18))
  } else if (tokenIn.toLowerCase() === token1.toLowerCase() && tokenOut.toLowerCase() === token0.toLowerCase()) {
    price = Number(formatUnitsBI(r0, dOut, 18)) / Number(formatUnitsBI(r1, dIn, 18))
  } else {
    return 0
  }
  return Number.isFinite(price) && price > 0 ? price : 0
}

// ====== UI ======
const style = {
  box: `relative bg-[#20242A] my-3 rounded-2xl p-4 text-xl border border-[#2A2F36] hover:border-[#41444F] flex justify-between items-center`,
  input: `bg-transparent placeholder:text-[#B2B9D2] outline-none w-full text-3xl text-white text-right`,
}

const LimitTab: React.FC = () => {
  const [sell, setSell] = useState<Token>(DEFAULT_TOKENS.find(t => t.symbol === 'PLS')!)
  const [buy, setBuy] = useState<Token>(DEFAULT_TOKENS.find(t => t.symbol === 'BLSEYE')!)
  const [amountIn, setAmountIn] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [minOut, setMinOut] = useState('')

  const [selOpen, setSelOpen] = useState(false)
  const [selSide, setSelSide] = useState<'sell' | 'buy'>('sell')
  const openSel = (s: 'sell' | 'buy') => { setSelSide(s); setSelOpen(true) }
  const onSelect = (t: Token) => { (selSide === 'sell' ? setSell : setBuy)(t) }

  // Reference price updater
  const [refPrice, setRefPrice] = useState<number>(0)
  const refTimer = useRef<any>(null)
  useEffect(() => {
    let alive = true
    async function update() {
      const aIn = (sell.address === 'native' ? WPLS : sell.address)
      const aOut = (buy.address === 'native' ? WPLS : buy.address)
      const p = await computePoolMidPrice(aIn, aOut)
      if (alive) setRefPrice(p)
    }
    update()
    const tick = () => { refTimer.current = setTimeout(async () => { await update(); tick() }, 30_000) }
    tick()
    return () => { alive = false; clearTimeout(refTimer.current) }
  }, [sell.address, buy.address])

  // Derive minOut
  useEffect(() => {
    const q = parseFloat((amountIn || '0').replace(',', '.'))
    const px = parseFloat((targetPrice || '0').replace(',', '.'))
    if (!Number.isFinite(q) || !Number.isFinite(px) || q <= 0 || px <= 0) { setMinOut(''); return }
    setMinOut((q * px).toLocaleString('en-US', { maximumFractionDigits: 12 }))
  }, [amountIn, targetPrice])

  const setFromRef = (pct: number) => {
    const p = refPrice * pct
    if (p > 0) setTargetPrice(p.toLocaleString('en-US', { maximumFractionDigits: 12 }))
  }

  // ====== Place Order ======
  async function place() {
    if (!(window as any)?.ethereum) return
    const [aInDec, aOutDec] = await Promise.all([
      getTokenDecimals(sell.address === 'native' ? WPLS : sell.address),
      getTokenDecimals(buy.address === 'native' ? WPLS : buy.address),
    ])
    const _amountIn = parseUnitsBI(amountIn || '0', sell.address === 'native' ? 18 : aInDec)
    const _minOut = parseUnitsBI(minOut || '0', buy.address === 'native' ? 18 : aOutDec)
    if (_amountIn <= 0n || _minOut <= 0n) return

    const provider = new ethers.BrowserProvider((window as any).ethereum)
    const signer = await provider.getSigner()
    const limit = new ethers.Contract(LIMIT_ADDRESS, ABI_LIMIT, signer)

    const tipWei = (sell.address === 'native' ? 0n : 20000000000000000n)

    if (sell.address === 'native') {
      const tx = await limit.placeOrderPLS(
        buy.address === 'native' ? WPLS : buy.address,
        _minOut,
        0,
        { value: _amountIn }
      )
      await tx.wait()
    } else {
      const erc20 = new ethers.Contract(sell.address, ABI_ERC20, signer)
      const owner = await signer.getAddress()
      const allowance = await erc20.allowance(owner, LIMIT_ADDRESS)
      if (allowance < _amountIn) {
        const txA = await erc20.approve(LIMIT_ADDRESS, _amountIn)
        await txA.wait()
      }
      const tx = await limit.placeOrderERC20(
        sell.address,
        buy.address === 'native' ? WPLS : buy.address,
        _amountIn,
        _minOut,
        0,
        { value: tipWei }
      )
      await tx.wait()
    }
    setAmountIn(''); setTargetPrice(''); setMinOut('')
  }

  const priceHint = refPrice > 0 ? `${refPrice.toLocaleString('en-US', { maximumFractionDigits: 10 })} ${buy.symbol} / ${sell.symbol}` : '—'

  return (
    <div className="w-full max-w-xl">
      <div className="px-2 flex items-center justify-between mb-1">
        <div className="font-semibold">Limit Order</div>
      </div>

      {/* You sell */}
      <div className={style.box}>
        <div className="row-title">You sell</div>
        <button className="token-select token-select--clean" onClick={() => openSel('sell')}>
          <img className="token-icon" src={sell.icon || '/images/no-token.png'} alt={sell.symbol} />
          <span className="token-ticker">{sell.symbol}</span>
          <AiOutlineDown className="token-chevron" style={{ opacity: .9, fontSize: 14, marginLeft: 6 }} />
        </button>
        <input className={style.input} inputMode="decimal" placeholder="0.0" value={amountIn} onChange={e => setAmountIn(e.target.value)} />
      </div>

      {/* You buy */}
      <div className={style.box}>
        <div className="row-title">You buy</div>
        <button className="token-select token-select--clean" onClick={() => openSel('buy')}>
          <img className="token-icon" src={buy.icon || '/images/no-token.png'} alt={buy.symbol} />
          <span className="token-ticker">{buy.symbol}</span>
          <AiOutlineDown className="token-chevron" style={{ opacity: .9, fontSize: 14, marginLeft: 6 }} />
        </button>
        <div className="text-right opacity-80 pr-1">{minOut || '—'}</div>
      </div>

      {/* Target Price */}
      <div className="bg-[#20242A] rounded-2xl border border-[#2A2F36] p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="dim">Target price</div>
          <div className="text-sm opacity-80">Ref: {priceHint}</div>
        </div>
        <div className="flex gap-2">
          <input className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 outline-none"
            placeholder={`${buy.symbol} per ${sell.symbol}`}
            value={targetPrice}
            onChange={e => setTargetPrice(e.target.value)} />
        </div>
        <div className="flex gap-2 mt-2">
          <button className="pill" onClick={() => setFromRef(1)}>Use ref</button>
          <button className="pill" onClick={() => setFromRef(0.98)}>-2%</button>
          <button className="pill" onClick={() => setFromRef(0.95)}>-5%</button>
          <button className="pill" onClick={() => setFromRef(1.02)}>+2%</button>
          <button className="pill" onClick={() => setFromRef(1.05)}>+5%</button>
        </div>
      </div>

      {/* Action */}
      <div className="actions mt-4">
        <button className="confirm-btn w-full" disabled={!amountIn || !minOut} onClick={place}>
          Place Limit Order
        </button>
      </div>

      <TokenSelector
        open={selOpen}
        side={selSide === 'sell' ? 'pay' : 'receive'}
        onClose={() => setSelOpen(false)}
        onSelect={onSelect}
        excludeAddress={selSide === 'sell' ? (buy.address || '') : (sell.address || '')}
      />

      <style jsx>{`
        .row-title{ position:absolute; top:10px; left:14px; font-size:12px; opacity:.8 }
        .token-select{ display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:12px; border:1px solid rgba(120,170,240,.55); background:rgba(255,255,255,.06) }
        .token-icon{ width:22px; height:22px; border-radius:999px; object-fit:cover }
        .pill{ padding:6px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.06) }
      `}</style>
    </div>
  )
}

export default LimitTab
