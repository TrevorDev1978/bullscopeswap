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
const parseUnitsBI = (s: string, decimals = 18) => {
  const [i, f = ''] = s.replace(/,/g, '').replace(',', '.').split('.')
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(i || '0') * (10n ** BigInt(decimals)) + BigInt(frac || '0')
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

/* ====== Prezzo corrente (Dexscreener) ====== */
const DS_TTL = 60_000
const _dsCache: Record<string, { ts: number; pairs: any[] }> = {}
async function dexscreener(address: string) {
  const key = address.toLowerCase()
  const now = Date.now()
  const c = _dsCache[key]
  if (c && now - c.ts < DS_TTL) return c
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${key}`)
  const j = await r.json()
  const pairs = Array.isArray(j?.pairs) ? j.pairs : []
  const out = { ts: now, pairs }
  _dsCache[key] = out
  return out
}
async function computePoolMidPrice(tokenIn: string, tokenOut: string) {
  const { pairs } = await dexscreener(tokenIn)
  const onPulse = pairs.filter((p: any) => String(p?.chainId || '').toLowerCase().includes('pulse'))
  if (!onPulse.length) return 0
  onPulse.sort((a: any, b: any) => (parseFloat(b?.liquidity?.usd || '0')||0) - (parseFloat(a?.liquidity?.usd || '0')||0))
  const best = onPulse[0]
  try {
    const pxInUsd  = parseFloat(best?.priceUsd || '0') || 0
    const pxOutUsd = parseFloat(best?.priceUsd || '0') || 0
    if (pxInUsd > 0 && pxOutUsd > 0) return pxOutUsd / pxInUsd
  } catch {}
  const price = parseFloat(best?.priceNative || '0') || 0
  return price > 0 ? price : 0
}

/* ====== Prefill type ====== */
type Prefill = {
  sell: Token
  buy: Token
  amountIn: string
  useCurrentOnOpen?: boolean
}

const LimitTab: React.FC<{ prefill?: Prefill }> = ({ prefill }) => {
  const [sell, setSell] = useState<Token>(prefill?.sell || DEFAULT_TOKENS.find(t=>t.symbol==='PLS')!)
  const [buy,  setBuy]  = useState<Token>(prefill?.buy  || DEFAULT_TOKENS.find(t=>t.symbol==='BLSEYE')!)
  const [amountIn, setAmountIn] = useState<string>(prefill?.amountIn || '')
  const [targetPrice, setTargetPrice] = useState<string>('')
  const [minOut, setMinOut] = useState<string>('')
  const [refPrice, setRefPrice] = useState<number>(0)
  const didAutofill = useRef(false)

  const [selOpen, setSelOpen] = useState(false)
  const [selSide, setSelSide] = useState<'sell'|'buy'>('sell')
  const openSel = (s:'sell'|'buy') => { setSelSide(s); setSelOpen(true) }

  /* Prefill sync */
  useEffect(() => {
    if (!prefill) return
    setSell(prefill.sell)
    setBuy(prefill.buy)
    setAmountIn(prefill.amountIn || '')
    setTargetPrice('')
    setMinOut('')
    didAutofill.current = false
  }, [prefill?.sell?.address, prefill?.buy?.address, prefill?.amountIn])

  /* Aggiorna ref price */
  useEffect(() => {
    let alive = true, t:any
    const aIn = (sell.address==='native'?WPLS:sell.address)
    const aOut= (buy.address==='native'?WPLS:buy.address)
    const update = async()=>{ const p = await computePoolMidPrice(aIn,aOut); if(alive) setRefPrice(p) }
    update(); const loop=()=>{t=setTimeout(async()=>{await update();loop()},30000)}; loop()
    return()=>{alive=false;clearTimeout(t)}
  },[sell.address,buy.address])

  /* Autofill “Use current” */
  useEffect(()=>{
    if(didAutofill.current) return
    if(!prefill || prefill.useCurrentOnOpen===false) return
    if(refPrice>0){didAutofill.current=true;setTargetPrice(refPrice.toLocaleString('en-US',{maximumFractionDigits:12}))}
  },[refPrice,prefill])

  /* Calcolo minOut */
  useEffect(()=>{
    const q=parseFloat((amountIn||'0').replace(',','.'))
    const px=parseFloat((targetPrice||'0').replace(',','.'))
    if(!Number.isFinite(q)||!Number.isFinite(px)||q<=0||px<=0){setMinOut('');return}
    setMinOut((q*px).toLocaleString('en-US',{maximumFractionDigits:12}))
  },[amountIn,targetPrice])

  const setFromRef=(mult:number)=>{
    if(!refPrice||refPrice<=0)return
    const p=refPrice*mult
    setTargetPrice(p.toLocaleString('en-US',{maximumFractionDigits:12}))
  }

  async function place(){
    if(!(window as any).ethereum)return
    try{
      const cid=await(window as any).ethereum.request({method:'eth_chainId'})
      if(cid!==PULSE_CHAIN_HEX){
        await(window as any).ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:PULSE_CHAIN_HEX}]})
      }
    }catch{}
    const provider=new(ethers as any).BrowserProvider((window as any).ethereum)
    const signer=await provider.getSigner()
    const user=await signer.getAddress()
    const [inDec,outDec]=await Promise.all([
      getTokenDecimals(sell.address==='native'?WPLS:sell.address),
      getTokenDecimals(buy.address==='native'?WPLS:buy.address),
    ])
    const _amountIn=parseUnitsBI(amountIn||'0',sell.address==='native'?18:inDec)
    const px=parseFloat((targetPrice||'0').replace(',','.'))
    if(_amountIn<=0n||!(px>0))return
    const mult=BigInt(Math.floor(px*1e12))
    const _minOut=(_amountIn*mult)/BigInt(1e12)
    const limit=new(ethers as any).Contract(LIMIT_ADDRESS,ABI_LIMIT,signer)
    if(sell.address!=='native'){
      const erc20=new(ethers as any).Contract(sell.address,ABI_ERC20,signer)
      const allowance=await erc20.allowance(user,LIMIT_ADDRESS)
      const need=_amountIn
      if((allowance?._hex?BigInt(allowance._hex):BigInt(allowance))<need){
        const txA=await erc20.approve(LIMIT_ADDRESS,need);await txA.wait()
      }
    }
    const expiry=Math.floor(Date.now()/1000)+60*60*24*30
    let tx
    if(sell.address==='native'){
      tx=await limit.placeOrderPLS(buy.address==='native'?WPLS:buy.address,_minOut,expiry,{value:_amountIn})
    }else{
      tx=await limit.placeOrderERC20(sell.address,buy.address==='native'?WPLS:buy.address,_amountIn,_minOut,expiry)
    }
    await tx.wait()
    alert('Limit order placed ✅')
  }

  return(
    <div className="limit-wrap">
      <div className="section-title">Limit Order Swap</div>

      <div className="box">
        <div className="row-title">You sell</div>
        <button className="token-select" onClick={()=>openSel('sell')}>
          <img className="token-icon" src={sell.icon||'/images/no-token.png'} alt={sell.symbol}/>
          <span className="token-ticker">{sell.symbol}</span>
          <AiOutlineDown className="token-chevron"/>
        </button>
        <input className="amount-input" placeholder="0.0" inputMode="decimal" value={amountIn} onChange={e=>setAmountIn(e.target.value)}/>
      </div>

      <div className="box">
        <div className="row-title">You buy</div>
        <button className="token-select" onClick={()=>openSel('buy')}>
          <img className="token-icon" src={buy.icon||'/images/no-token.png'} alt={buy.symbol}/>
          <span className="token-ticker">{buy.symbol}</span>
          <AiOutlineDown className="token-chevron"/>
        </button>
        <div className="amount-out">{minOut||'—'}</div>
      </div>

      <div className="box box--light">
        <div className="box-head">
          <div className="dim">Target price</div>
          <div className="dim small">Current: {refPrice?`${refPrice.toLocaleString('en-US',{maximumFractionDigits:12})} ${buy.symbol}/${sell.symbol}`:'—'}</div>
        </div>
        <input className="price-input" placeholder={`${buy.symbol} per ${sell.symbol}`} value={targetPrice} onChange={e=>setTargetPrice(e.target.value)}/>
        <div className="pills">
          <button className="pill" onClick={()=>setFromRef(1.00)}>Use current</button>
          <button className="pill" onClick={()=>setFromRef(0.95)}>-5%</button>
          <button className="pill" onClick={()=>setFromRef(0.98)}>-2%</button>
          <button className="pill" onClick={()=>setFromRef(1.02)}>+2%</button>
          <button className="pill" onClick={()=>setFromRef(1.05)}>+5%</button>
        </div>
      </div>

      <button className="place-btn" onClick={place}>Place Limit Order</button>

      <TokenSelector open={selOpen} side={selSide==='sell'?'pay':'receive'} onClose={()=>setSelOpen(false)} onSelect={(t)=>{(selSide==='sell'?setSell:setBuy)(t)}} excludeAddress={selSide==='sell'?(buy.address||''):(sell.address||'')}/>

      <style jsx>{`
        .limit-wrap{display:flex;flex-direction:column;align-items:center;gap:14px;margin:auto;max-width:460px;}
        .section-title{font-weight:800;font-size:15px;border:1px solid rgba(120,170,240,.35);background:rgba(255,255,255,.08);padding:8px 12px;border-radius:12px;text-align:center;width:100%;}
        .box{position:relative;border:1px solid rgba(120,170,240,.50);background:rgba(255,255,255,.08);backdrop-filter:blur(6px);border-radius:16px;padding:14px 12px 10px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;width:100%;}
        .box--light{background:rgba(255,255,255,.10);}
        .row-title{position:absolute;top:8px;left:12px;font-size:12px;opacity:.85;}
        .token-select{display:flex;align-items:center;gap:8px;border:1px solid rgba(120,170,240,.55);background:rgba(255,255,255,.10);padding:8px 10px;border-radius:12px;font-weight:700;}
        .token-icon{width:22px;height:22px;border-radius:999px;object-fit:cover;}
        .token-ticker{font-weight:800;}
        .token-chevron{opacity:.9;font-size:14px;margin-left:6px;}
        .amount-input{background:rgba(255,255,255,.10);border:1px solid rgba(120,170,240,.55);border-radius:12px;padding:10px 12px;font-size:20px;font-weight:800;text-align:right;width:100%;outline:none;}
        .amount-out{padding:10px 12px;text-align:right;width:100%;font-size:18px;font-weight:700;opacity:.95;}
        .box-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
        .dim{opacity:.85;font-weight:600;}
        .small{font-size:12px;}
        .price-input{width:100%;background:rgba(255,255,255,.10);border:1px solid rgba(120,170,240,.50);border-radius:12px;padding:10px 12px;outline:none;font-weight:700;}
        .pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}
        .pill{padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);font-weight:700;font-size:13px;transition:background .15s ease;}
        .pill:hover{background:rgba(255,255,255,.14);}
        .place-btn{height:46px;border-radius:14px;width:100%;font-weight:800;border:1px solid rgba(120,170,240,.65);background:linear-gradient(180deg,rgba(124,200,255,.22),rgba(59,130,246,.22));box-shadow:inset 0 0 0 1px rgba(124,200,255,.18);}
      `}</style>
    </div>
  )
}

export default LimitTab
