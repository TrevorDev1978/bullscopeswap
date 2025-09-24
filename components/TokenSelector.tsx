import React, { useEffect, useMemo, useState } from 'react'

export type Token = {
  symbol: string
  name: string
  address: string   // 'native' per PLS
  icon?: string     // /images/tokens/<address>.png
  decimals?: number
}

/** Nomi/simboli noti (tuoi indirizzi reali) */
const KNOWN: Record<string, { symbol: string; name: string }> = {
  '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab': { symbol: 'PLSX',  name: 'PulseX' },
  '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d': { symbol: 'INC',   name: 'Incentive' },
  '0xA1077a294dDE1B09bB078844df40758a5D0f9a27': { symbol: 'WPLS',  name: 'Wrapped Pulse' },
  '0xefD766cCb38EaF1dfd701853BFCe31359239F305': { symbol: 'DAI',   name: 'Dai Stablecoin' },
  '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07': { symbol: 'USDC',  name: 'USD Coin' },
  '0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f': { symbol: 'USDT',  name: 'Tether USD' },
  '0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C': { symbol: 'WETH',  name: 'Wrapped Ether' },
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': { symbol: 'WBTC',  name: 'Wrapped Bitcoin' },
  '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39': { symbol: 'HEX',   name: 'HEX' },
  '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE': { symbol: 'SHIB',  name: 'Shiba Inu' },
  '0x514910771AF9Ca656af840dff83E8264EcF986CA': { symbol: 'LINK',  name: 'Chainlink' },
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': { symbol: 'USDC.e',name: 'USD Coin (Ethereum)' },
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': { symbol: 'WETH.e',name: 'Wrapped Ether (Ethereum)' },
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': { symbol: 'USDT.e',name: 'Tether USD (Ethereum)' },
  '0x6B175474E89094C44Da98b954EedeAC495271d0F': { symbol: 'DAI.e', name: 'Dai (Ethereum)' },
}

const ICON_ADDRS = [
  '0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C',
  '0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f',
  '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07',
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39',
  '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d',
  '0x3819f64f282bf135d62168C1e513280dAF905e06',
  '0x3Ab667c153B8DD2248bb96E7A2e1575197667784',
  '0x514910771AF9Ca656af840dff83E8264EcF986CA',
  '0x57fde0a71132198BBeC939B98976993d8D89D225',
  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
  '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab',
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',
  '0xAbF663531FA10ab8116cbf7d5c6229B018A26Ff9',
  '0xb17D901469B9208B17d916112988A3FeD19b5cA1',
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  '0xefD766cCb38EaF1dfd701853BFCe31359239F305',
] as const

const fromIcon = (addr: string): Token => {
  const k = KNOWN[addr]
  return { symbol: k?.symbol ?? `TKN-${addr.slice(2,6).toUpperCase()}`, name: k?.name ?? 'Custom Token', address: addr, icon: `/images/tokens/${addr}.png` }
}

const PLS: Token = {
  symbol: 'PLS',
  name: 'Pulse',
  address: 'native',
  icon: '/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
}

export const DEFAULT_TOKENS: Token[] = [ PLS, ...ICON_ADDRS.map(fromIcon) ]

type Props = {
  open: boolean
  side: 'pay' | 'receive'
  onClose: () => void
  onSelect: (t: Token) => void
  tokens?: Token[]
  account?: string
}

// —— RPC helpers (bilanci/decimals) ———————————————
const PULSE_CHAIN_HEX = '0x171'
async function ensurePulseChain(): Promise<boolean> {
  if (!window.ethereum) return false
  try {
    const cid = await window.ethereum.request({ method: 'eth_chainId' })
    if (cid === PULSE_CHAIN_HEX) return true
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: PULSE_CHAIN_HEX }] })
      return true
    } catch (e:any) {
      if (e?.code === 4902) {
        await window.ethereum.request({
          method:'wallet_addEthereumChain',
          params:[{
            chainId:PULSE_CHAIN_HEX, chainName:'PulseChain',
            nativeCurrency:{ name:'Pulse', symbol:'PLS', decimals:18 },
            rpcUrls:['https://rpc.pulsechain.com'],
            blockExplorerUrls:['https://scan.pulsechain.com']
          }]
        })
        await window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{ chainId:PULSE_CHAIN_HEX }] })
        return true
      }
      return false
    }
  } catch { return false }
}
async function call(address: string, data: string) {
  return window.ethereum.request({ method:'eth_call', params:[{ to: address, data }, 'latest'] }) as Promise<string>
}
const SELECTOR = { symbol:'0x95d89b41', name:'0x06fdde03', decimals:'0x313ce567', balanceOf:'0x70a08231' }
const addrParam = (addr: string) => ('0'.repeat(24) + addr.toLowerCase().replace(/^0x/, ''))
const hexToBigInt = (hex: string) => (!hex || hex === '0x' ? 0n : BigInt(hex))
const formatUnits = (value: bigint, decimals = 18, maxFrac = 6) => {
  const neg = value < 0n; const v = neg ? -value : value
  const base = 10n ** BigInt(decimals)
  const i = v / base; const f = v % base
  let fStr = f.toString().padStart(decimals, '0')
  if (maxFrac >= 0) fStr = fStr.slice(0, maxFrac)
  fStr = fStr.replace(/0+$/, '')
  return (neg ? '-' : '') + i.toString() + (fStr ? '.' + fStr : '')
}
const hexToAscii = (hex: string) => {
  hex = hex.replace(/^0x/, '')
  if (hex.length >= 130) {
    const len = parseInt(hex.slice(64, 128), 16)
    const start = 128
    return Buffer.from(hex.slice(start, start + len * 2), 'hex').toString('utf8').replace(/\u0000+$/,'')
  }
  try { return Buffer.from(hex,'hex').toString('utf8').replace(/\u0000+$/,'') } catch { return '' }
}
const decimalsCache = new Map<string, number>()
async function getTokenDecimals(tokenAddr: string): Promise<number> {
  if (decimalsCache.has(tokenAddr)) return decimalsCache.get(tokenAddr)!
  const res = await call(tokenAddr, SELECTOR.decimals)
  const n = parseInt(res, 16)
  const d = Number.isFinite(n) ? n : 18
  decimalsCache.set(tokenAddr, d)
  return d
}
async function getErc20Balance(tokenAddr: string, account: string): Promise<bigint> {
  const data = SELECTOR.balanceOf + addrParam(account)
  const res = await call(tokenAddr, data)
  return hexToBigInt(res)
}

// ————————————————————————————————————————————————

const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s.trim())
const eqAddr = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

const TokenSelector: React.FC<Props> = ({ open, side, onClose, onSelect, tokens = DEFAULT_TOKENS, account }) => {
  const [q, setQ] = useState('')
  const [list, setList] = useState<Token[]>(tokens)
  const [fetching, setFetching] = useState(false)
  const [fetched, setFetched] = useState<Token | null>(null)
  const [error, setError] = useState<string | null>(null)

  // balances map
  type Bal = { raw: bigint; formatted: string; decimals: number }
  const [balances, setBalances] = useState<Record<string, Bal>>({})

  // lock scroll
  useEffect(() => {
    if (typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = open ? 'hidden' : prev
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => { if (open) setQ('') }, [open])
  useEffect(() => { setList(tokens) }, [tokens])

  // fetch balances quando apri e hai account
  useEffect(() => {
    if (!open || !account) return
    let alive = true
    ;(async () => {
      const ok = await ensurePulseChain()
      if (!ok) return
      const entries: [string, Bal][] = await Promise.all(list.map(async (t) => {
        try {
          if (t.address === 'native') {
            const wei = await window.ethereum.request({ method:'eth_getBalance', params:[account, 'latest'] })
            const raw = hexToBigInt(wei)
            return [t.address, { raw, formatted: formatUnits(raw, 18), decimals: 18 }]
          } else {
            const [dec, raw] = await Promise.all([ getTokenDecimals(t.address), getErc20Balance(t.address, account) ])
            return [t.address, { raw, formatted: formatUnits(raw, dec), decimals: dec }]
          }
        } catch {
          return [t.address, { raw: 0n, formatted: '0', decimals: 18 }]
        }
      }))
      if (alive) {
        const obj: Record<string,Bal> = {}
        for (const [k, v] of entries) obj[k] = v
        setBalances(obj)
      }
    })()
    return () => { alive = false }
  }, [open, account, list])

  // se incolli address esterno → anteprima add
  useEffect(() => {
    const s = q.trim()
    if (!isAddr(s)) { setFetched(null); setError(null); return }
    if (list.some(t => eqAddr(t.address, s))) { setFetched(null); setError(null); return }
    let alive = true
    ;(async () => {
      if (!window.ethereum) { setError('Wallet RPC non disponibile'); return }
      const ok = await ensurePulseChain()
      if (!ok) { setError('Switch to PulseChain'); return }
      try {
        setFetching(true); setError(null)
        const [sym, nam, dec] = await Promise.all([
          call(s, SELECTOR.symbol),
          call(s, SELECTOR.name),
          call(s, SELECTOR.decimals),
        ])
        const symbol = hexToAscii(sym)
        const name   = hexToAscii(nam)
        const decimals = parseInt(dec, 16)
        if (!symbol && !name) throw new Error('Token non leggibile')
        const t: Token = {
          symbol: symbol || 'TOKEN',
          name: name || s.slice(0,10),
          address: s,
          icon: `/images/tokens/${s}.png`,
          decimals: Number.isFinite(decimals) ? decimals : 18,
        }
        if (alive) setFetched(t)
      } catch (e:any) {
        if (alive) { setError('Impossibile leggere il token'); setFetched(null) }
      } finally {
        if (alive) setFetching(false)
      }
    })()
    return () => { alive = false }
  }, [q, list])

  // filtro + ordinamento: posseduti (balance > 0) prima; PLS prima tra i posseduti
  const filteredSorted = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = !s
      ? list
      : list.filter(t =>
          t.symbol.toLowerCase().includes(s) ||
          t.name.toLowerCase().includes(s) ||
          t.address.toLowerCase().includes(s)
        )
    const has = (t: Token) => {
      const b = balances[t.address]
      return b && b.raw > 0n
    }
    const arr = [...base]
    arr.sort((a,b) => {
      const ha = has(a), hb = has(b)
      if (ha && !hb) return -1
      if (!ha && hb) return 1
      if (ha && hb) {
        if (a.address === 'native' && b.address !== 'native') return -1
        if (b.address === 'native' && a.address !== 'native') return 1
      }
      return a.symbol.localeCompare(b.symbol)
    })
    return arr
  }, [q, list, balances])

  if (!open) return null

  const apply = (t: Token) => { onSelect(t); onClose() }
  const addFetched = () => {
    if (!fetched) return
    if (!list.some(x => eqAddr(x.address, fetched.address))) setList(prev => [...prev, fetched])
    apply(fetched)
  }

  // overlay & panel
  const overlay: React.CSSProperties = {
    position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.75)',
    display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'6vh 12px 12px',
  }
  const panel: React.CSSProperties = {
    width:'min(600px, 96vw)', maxHeight:'80vh', overflow:'hidden',
    background:'#0b0b0c', border:'1px solid rgba(255,255,255,0.12)',
    borderRadius:16, color:'#fff', boxShadow:'0 22px 60px rgba(0,0,0,0.85)', padding:14,
  }

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={panel}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
          <h3 style={{margin:0, fontSize:16, fontWeight:700}}>Select a Token</h3>
          <button aria-label="Close" onClick={onClose} style={{background:'transparent', border:0, color:'#fff', fontSize:24, cursor:'pointer'}}>×</button>
        </div>

        <input
          style={{ width:'100%', margin:'10px 0 12px', padding:'10px 12px', color:'#fff',
            background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.18)', borderRadius:12, outline:'none' }}
          placeholder="Search name, symbol or paste address"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        {/* Anteprima/Add da address */}
        {(/^0x[a-fA-F0-9]{40}$/.test(q.trim()) && !list.some(t => eqAddr(t.address, q.trim()))) && (
          <div style={{margin:'6px 0 10px'}}>
            <div style={{fontSize:12, opacity:.9, marginBottom:6}}>
              {fetching ? 'Reading token from chain…' : (error ? error : 'External token not in list')}
            </div>
            <button
              disabled={fetching || !fetched}
              onClick={addFetched}
              style={{
                display:'flex', alignItems:'center', gap:10, width:'100%',
                background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.18)',
                borderRadius:12, padding:10, cursor: fetching || !fetched ? 'default' : 'pointer'
              }}
            >
              <span className="token-avatar">
                <img src={fetched?.icon || '/images/tokens/metamask.png'} alt={fetched?.symbol || 'token'} width={22} height={22} />
              </span>
              <div className="token-meta">
                <span className="token-symbol">{fetched?.symbol || q.slice(0,10)}</span>
                <span className="token-name">{fetched?.name || 'ERC-20 on PulseChain'}</span>
              </div>
              <div className="token-addr">{q.slice(0,6)}…{q.slice(-4)}</div>
            </button>
          </div>
        )}

        {/* Lista (posseduti prima, PLS primo se posseduto) */}
        <div style={{maxHeight:'60vh', overflowY:'auto', paddingRight:2}}>
          {filteredSorted.map(t => {
            const bal = balances[t.address]
            const qty = bal ? bal.formatted : ''
            return (
              <button
                key={`item-${t.address}-${t.symbol}`}
                onClick={() => apply(t)}
                className="token-item"
              >
                <span className="token-avatar">
                  <img src={t.icon || '/images/tokens/metamask.png'} alt={t.symbol} width={22} height={22} />
                </span>
                <div className="token-meta">
                  <span className="token-symbol">{t.symbol}</span>
                  <span className="token-name">{t.name}</span>
                </div>
                {qty && <span className="token-bal">{qty}</span>}
                <span className="token-addr">{t.address === 'native' ? 'native' : `${t.address.slice(0,6)}…${t.address.slice(-4)}`}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default TokenSelector
