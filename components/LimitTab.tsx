// components/LimitTab.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import TokenSelector, { DEFAULT_TOKENS, Token } from './TokenSelector'
import { AiOutlineDown } from 'react-icons/ai'
import { ethers } from 'ethers'

const RPC_URL = 'https://rpc.pulsechain.com'
const PULSE_CHAIN_HEX = '0x171'
const WPLS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27'
const LIMIT_ADDRESS = '0xFEa1023F5d52536beFc71c3404E356ae81C82F4B'

const ABI_LIMIT = [
  'function placeOrderERC20(address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 expiry) payable returns (uint256)',
  'function placeOrderPLS(address tokenOut,uint256 minOut,uint256 expiry) payable returns (uint256)',
  'function setNextTipPLS(uint256 tip) payable',
]
const ABI_ERC20 = [
  'function decimals() view returns (uint8)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
]

const SELECTOR = { decimals: '0x313ce567' }
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

// ====== Current price (Dexscreener) ======
const DS_TTL = 120_000
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
  const [inUsd, outUsd] = await Promise.all([usdPrice(tokenIn), usdPrice(tokenOut)])
  if (inUsd > 0 && outUsd > 0) return outUsd / inUsd
  return 0
}

const LimitTab: React.FC<{ prefill?: any; onPlaced?: (id?: number) => void }> = ({ prefill, onPlaced }) => {
  const [sell, setSell] = useState<Token>(prefill?.sell || DEFAULT_TOKENS.find(t => t.symbol === 'PLS')!)
  const [buy, setBuy] = useState<Token>(prefill?.buy || DEFAULT_TOKENS.find(t => t.symbol === 'BLSEYE')!)
  const [amountIn, setAmountIn] = useState<string>(prefill?.amountIn || '')
  const [targetPrice, setTargetPrice] = useState<string>('')
  const [amountOut, setAmountOut] = useState<string>('')

  const [tipPLS, setTipPLS] = useState<string>('0')
  const [expiryMode, setExpiryMode] = useState<'min'|'h'|'d'>('d')
  const [expiryVal, setExpiryVal] = useState<string>('30')
  const parsePLS = (s: string) => {
    const n = Number.parseFloat((s || '0').replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return 0n
    return BigInt(Math.floor(n * 1e18))
  }

  const [selOpen, setSelOpen] = useState(false)
  const [selSide, setSelSide] = useState<'sell'|'buy'>('sell')
  const openSel = (s: 'sell'|'buy') => { setSelSide(s); setSelOpen(true) }
  const onSelect = (t: Token) => { (selSide === 'sell' ? setSell : setBuy)(t) }

  const [ref, setRef] = useState<{v:number,src:string}>({v:0,src:'Dexscreener'})
  useEffect(() => {
    let alive = true, timer:any
    const aIn = (sell.address === 'native' ? WPLS : sell.address)
    const aOut = (buy.address === 'native' ? WPLS : buy.address)
    const update = async () => {
      const r = await refRatioBuyPerSellUSD(aIn, aOut)
      if (alive) setRef({v:r,src:'Dexscreener'})
    }
    update()
    const loop = () => { timer = setTimeout(async()=>{await update();loop()},DS_TTL) }
    loop()
    return () => { alive=false; clearTimeout(timer) }
  }, [sell.address,buy.address])

  const didAutofillRef = useRef(false)
  useEffect(() => {
    if (didAutofillRef.current) return
    if (prefill && prefill.useCurrentOnOpen === false) return
    if (ref.v > 0) {
      didAutofillRef.current = true
      setTargetPrice(ref.v.toLocaleString('en-US',{maximumFractionDigits:12}))
    }
  }, [ref.v, prefill])

  useEffect(() => {
    const q = Number.parseFloat((amountIn||'0').replace(',', '.'))
    const p = Number.parseFloat((targetPrice||'0').replace(',', '.'))
    if (q>0&&p>0) setAmountOut((q*p).toLocaleString('en-US',{maximumFractionDigits:12}))
    else setAmountOut('')
  }, [amountIn,targetPrice])

  const setFromRef = (mult:number) => {
    if(!(ref.v>0))return
    const v = ref.v*mult
    setTargetPrice(v.toLocaleString('en-US',{maximumFractionDigits:12}))
  }

  async function place() {
    if (!(window as any).ethereum) return
    try {
      const cid = await (window as any).ethereum.request({ method: 'eth_chainId' })
      if (cid !== PULSE_CHAIN_HEX) {
        try { await (window as any).ethereum.request({ method:'wallet_switchEthereumChain', params:[{chainId:PULSE_CHAIN_HEX}] }) } catch {}
      }
    } catch {}

    const E:any = ethers as any
    const provider = E.BrowserProvider ? new E.BrowserProvider((window as any).ethereum) : new E.providers.Web3Provider((window as any).ethereum)
    const signer = provider.getSigner ? await provider.getSigner() : await provider.getSigner(0)
    const user = await signer.getAddress()

    const inDec = await getTokenDecimals(sell.address==='native'?WPLS:sell.address)
    const outDec = await getTokenDecimals(buy.address==='native'?WPLS:buy.address)
    const amountInRaw = parseUnitsBI(amountIn||'0',inDec)
    const px = Number.parseFloat((targetPrice||'0').replace(',','.'))
    if (amountInRaw<=0n||!(px>0)) return

    const priceQ = BigInt(Math.floor(px*1e12))
    const pow = outDec - inDec
    let scaleUp = 1n, scaleDown = 1n
    if (pow>0) scaleUp = 10n**BigInt(pow)
    if (pow<0) scaleDown = 10n**BigInt(-pow)
    const minOutRaw = (amountInRaw*priceQ*scaleUp)/(scaleDown*1_000_000_000_000n)

    const n = Math.max(1,Math.floor(Number(expiryVal||'0')))
    let seconds=0
    if(expiryMode==='min')seconds=n*60
    if(expiryMode==='h')seconds=n*60*60
    if(expiryMode==='d')seconds=n*24*60*60
    const expiry=Math.floor(Date.now()/1000)+seconds

    const limit=new E.Contract(LIMIT_ADDRESS,ABI_LIMIT,signer)
    const tipWei=parsePLS(tipPLS)

    if(sell.address==='native'){
      if(tipWei>0n){
        const txTip=await limit.setNextTipPLS(tipWei,{value:tipWei})
        await txTip.wait()
      }
      const value=amountInRaw+tipWei
      const tx=await limit.placeOrderPLS(buy.address==='native'?WPLS:buy.address,minOutRaw,expiry,{value})
      await tx.wait()
    }else{
      const erc20=new E.Contract(sell.address,ABI_ERC20,signer)
      const allowance=await erc20.allowance(user,LIMIT_ADDRESS)
      const allowanceBI=(allowance?._hex?BigInt(allowance._hex):BigInt(allowance||0))
      if(allowanceBI<amountInRaw){
        const txA=await erc20.approve(LIMIT_ADDRESS,amountInRaw)
        await txA.wait()
      }
      const tx=await limit.placeOrderERC20(
        sell.address,
        (buy.address==='native'?WPLS:buy.address),
        amountInRaw,
        minOutRaw,
        expiry,
        {value:tipWei}
      )
      await tx.wait()
    }
    onPlaced?.()
  }

  const priceHint=useMemo(()=>{
    if(!(ref.v>0))return '—'
    return `${ref.v.toLocaleString('en-US',{maximumFractionDigits:12})} ${buy.symbol} / ${sell.symbol}`
  },[ref.v,buy.symbol,sell.symbol])

  return (
    <div className="limit-wrap">
      <div className="section-title">Limit Order Swap</div>

      {/* You sell */}
      <div className="box">
        <div className="row-title">You sell</div>
        <button className="token-select" onClick={()=>openSel('sell')}>
          <img className="token-icon" src={sell.icon||'/images/no-token.png'} alt={sell.symbol}/>
          <span className="token-ticker">{sell.symbol}</span>
          <AiOutlineDown className="token-chevron"/>
        </button>
        <input className="amount-input" placeholder="0.0" inputMode="decimal" value={amountIn} onChange={e=>setAmountIn(e.target.value)}/>
      </div>

      {/* You buy */}
      <div className="box">
        <div className="row-title">You buy</div>
        <button className="token-select" onClick={()=>openSel('buy')}>
          <img className="token-icon" src={buy.icon||'/images/no-token.png'} alt={buy.symbol}/>
          <span className="token-ticker">{buy.symbol}</span>
          <AiOutlineDown className="token-chevron"/>
        </button>
        <div className="amount-out">{amountOut||'—'}</div>
      </div>

      {/* Target price */}
      <div className="box box--light">
        <div className="box-head">
          <div className="dim">Target price</div>
          <div className="dim small">Current price: {priceHint} <span className="opacity-70">(Dexscreener)</span></div>
        </div>
        <input className="price-input" placeholder={`${buy.symbol} per ${sell.symbol}`} value={targetPrice} onChange={e=>setTargetPrice(e.target.value)}/>
        <div className="pills">
          <button className="pill" onClick={()=>setFromRef(1.00)}>Use current</button>
          <button className="pill" onClick={()=>setFromRef(0.98)}>-2%</button>
          <button className="pill" onClick={()=>setFromRef(0.95)}>-5%</button>
          <button className="pill" onClick={()=>setFromRef(0.90)}>-10%</button>
          <button className="pill" onClick={()=>setFromRef(0.80)}>-20%</button>
          <button className="pill" onClick={()=>setFromRef(1.02)}>+2%</button>
          <button className="pill" onClick={()=>setFromRef(1.05)}>+5%</button>
          <button className="pill" onClick={()=>setFromRef(1.10)}>+10%</button>
          <button className="pill" onClick={()=>setFromRef(1.20)}>+20%</button>
        </div>
      </div>

      {/* Tip PLS */}
      <div className="box box--light">
        <div className="box-head">
          <div className="dim">Executor tip (PLS) — opzionale</div>
          <div className="dim small">Incentiva l’esecuzione più rapida</div>
        </div>
        <input className="price-input" placeholder="0.00 (PLS)" value={tipPLS} onChange={e=>setTipPLS(e.target.value)}/>
      </div>

      {/* Expiry */}
      <div className="box box--light">
        <div className="box-head">
          <div className="dim">Expiry</div>
          <div className="dim small">Dopo la scadenza l’ordine non è più eseguibile</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <input className="price-input" style={{flex:1}} inputMode="numeric" value={expiryVal} onChange={e=>setExpiryVal(e.target.value)}/>
          <select className="price-input" style={{flex:'0 0 120px'}} value={expiryMode} onChange={e=>setExpiryMode(e.target.value as any)}>
            <option value="min">min</option>
            <option value="h">hours</option>
            <option value="d">days</option>
          </select>
        </div>
      </div>

      <button className="place-btn" onClick={place}>Place Limit Order</button>

      <TokenSelector open={selOpen} side={selSide==='sell'?'pay':'receive'} onClose={()=>setSelOpen(false)} onSelect={onSelect} excludeAddress={selSide==='sell'?(buy.address||''):(sell.address||'')} />
    </div>
  )
}

export default LimitTab
