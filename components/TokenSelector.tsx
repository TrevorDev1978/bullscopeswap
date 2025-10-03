// components/TokenSelector.tsx
import React, { useEffect, useMemo, useState } from 'react'

export type Token = {
  symbol: string
  name: string
  address: string   // 'native' per PLS
  icon?: string     // preferibilmente URL da CDN; fallback: '/images/no-token.png'
  decimals?: number
}

/** Nomi/simboli noti (solo quelli richiesti; NIENTE token ".e") */
const KNOWN: Record<string, { symbol: string; name: string; icon?: string }> = {
  '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab': { symbol: 'PLSX',  name: 'PulseX' },
  '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d': { symbol: 'INC',   name: 'Incentive' },
  '0xA1077a294dDE1B09bB078844df40758a5D0f9a27': { symbol: 'WPLS',  name: 'Wrapped Pulse' },

  // **PulseChain USDC/USDT/WETH/WBTC** con icone manuali (CDN "cryptocurrency-icons")
  '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07': {
    symbol: 'USDC',  name: 'USD Coin',
    icon: 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdc.png',
  },
  '0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f': {
    symbol: 'USDT',  name: 'Tether USD',
    icon: 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdt.png',
  },
  '0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C': {
    symbol: 'WETH',  name: 'Wrapped Ether',
    // uso l’icona ETH per rappresentare WETH
    icon: 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/eth.png',
  },
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': {
    symbol: 'WBTC',  name: 'Wrapped Bitcoin',
    icon: 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/wbtc.png',
  },

  '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39': { symbol: 'HEX',   name: 'HEX' },
  '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE': { symbol: 'SHIB',  name: 'Shiba Inu' },
  '0x514910771AF9Ca656af840dff83E8264EcF986CA': { symbol: 'LINK',  name: 'Chainlink' },

  // Nuovi richiesti
  '0xeAb7c22B8F5111559A2c2B1A3402d3FC713CAc27': { symbol: 'BLSEYE', name: 'Bullseye' },
  '0x6B175474E89094C44Da98b954EedeAC495271d0F': { symbol: 'pDAI',   name: 'Pulse Dai' },
}

/** Ordine richiesto (PLS, BLSEYE, pDAI, poi il resto) */
// NB: icone verranno idratate via Dexscreener (se non presenti manualmente)
const ICON_ADDRS = [
  '0xeAb7c22B8F5111559A2c2B1A3402d3FC713CAc27', // BLSEYE
  '0x6B175474E89094C44Da98b954EedeAC495271d0F', // pDAI
  '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab', // PLSX
  '0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C', // WETH
  '0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f', // USDT
  '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07', // USDC
  '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', // SHIB
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
  '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39', // HEX
  '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d', // INC
  '0x514910771AF9Ca656af840dff83E8264EcF986CA', // LINK
] as const

const fromIcon = (addr: string): Token => {
  const k = KNOWN[addr]
  return {
    symbol: k?.symbol ?? `TKN-${addr.slice(2,6).toUpperCase()}`,
    name:   k?.name   ?? 'Custom Token',
    address: addr,
    // icona manuale se presente in KNOWN, altrimenti undefined (verrà idratata)
    icon: k?.icon ?? undefined,
  }
}

const PLS: Token = {
  symbol: 'PLS',
  name: 'Pulse',
  address: 'native',
  // per il native puoi tenere un’icona locale: non serve fetch
  icon: '/images/tokens/0xA1077a294dDE1B09bB078844df40758a5D0f9a27.png',
}

export const DEFAULT_TOKENS: Token[] = [
  PLS,
  ...ICON_ADDRS.map(fromIcon),
]

// resto del file invariato ↓↓↓


type Props = {
  open: boolean
  side: 'pay' | 'receive'
  onClose: () => void
  onSelect: (t: Token) => void
  tokens?: Token[]
  account?: string
  /** escludi questo address dalla selezione (evita PLS→PLS etc) */
  excludeAddress?: string
}

// —— RPC helpers ———————————————
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
// SOSTITUISCI call() con:
async function call(address: string, data: string) {
  try {
    if (window.ethereum) {
      const cid = await window.ethereum.request({ method:'eth_chainId' })
      if (cid === PULSE_CHAIN_HEX) {
        return await window.ethereum.request({ method:'eth_call', params:[{ to: address, data }, 'latest'] }) as string
      }
    }
  } catch {}
  const r = await fetch('https://rpc.pulsechain.com', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'eth_call', params:[{ to: address, data }, 'latest'] }),
  })
  const j = await r.json()
  if (j?.error) throw new Error(j.error.message || 'eth_call failed')
  return j.result as string
}

const SELECTOR = { symbol:'0x95d89b41', name:'0x06fdde03', decimals:'0x313ce567', balanceOf:'0x70a08231' }
const addrParam = (addr: string) => ('0'.repeat(24) + addr.toLowerCase().replace(/^0x/, ''))
const hexToBigInt = (hex: string) => (!hex || hex === '0x' ? 0n : BigInt(hex))

// ===== Decodifica stringhe ABI in UTF-8 e sanificazione =====
function decodeAbiString(hex: string) {
  hex = (hex || '').replace(/^0x/, '')
  if (!hex) return ''
  let bytes: Uint8Array
  if (hex.length >= 128) {
    const len = parseInt(hex.slice(64, 128), 16)
    const start = 128
    const arr: number[] = []
    for (let i=0; i<len && (start + 2*i + 2) <= hex.length; i++) {
      arr.push(parseInt(hex.slice(start + 2*i, start + 2*i + 2), 16))
    }
    bytes = new Uint8Array(arr)
  } else {
    const arr: number[] = []
    for (let i=0;i<hex.length;i+=2) arr.push(parseInt(hex.slice(i,i+2), 16))
    bytes = new Uint8Array(arr)
  }
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\u0000+$/,'')
  } catch {
    return Array.from(bytes).map(b => b ? String.fromCharCode(b) : '').join('').replace(/\u0000+$/,'')
  }
}
const cleanSymbol = (s: string) =>
  (s || 'TOKEN')
    .normalize('NFKD')
    .replace(/[^\w.\-]/g, '') // rimuovi emoji/simboli strani
    .slice(0, 16)
    .toUpperCase() || 'TOKEN'

const cleanName = (s: string) =>
  (s || 'ERC-20 Token')
    .normalize('NFKD')
    .replace(/[^\w.\- ()]/g, '') // nomi leggibili senza emoji
    .slice(0, 42)

// ——— Dexscreener icon cache ———
const NO_ICON = '/images/no-token.png' // <-- icona tua (cerchio rosso/trasparente)
const ICON_CACHE_KEY = 'bls_ds_icon_cache_v1'

type IconCache = Record<string, string> // address(lowercase) -> iconUrl
function loadIconCache(): IconCache {
  try { return JSON.parse(localStorage.getItem(ICON_CACHE_KEY) || '{}') } catch { return {} }
}
function saveIconCache(map: IconCache) {
  localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(map))
}

async function fetchDexscreenerIcon(address: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`)
    const json: any = await res.json()
    const pairs: any[] = Array.isArray(json?.pairs) ? json.pairs : []
    if (!pairs.length) return null
    // preferisci pair su PulseChain
    const preferred = pairs.find(p => String(p?.chainId || '').toLowerCase().includes('pulse')) || pairs[0]
    const icon = preferred?.info?.imageUrl || preferred?.info?.image || null
    return (typeof icon === 'string' && icon.startsWith('http')) ? icon : null
  } catch { return null }
}

async function fetchTokenMetaFromChain(address: string) {
  const [sym, nam, dec] = await Promise.all([
    call(address, SELECTOR.symbol),
    call(address, SELECTOR.name),
    call(address, SELECTOR.decimals),
  ])
  const symbol = cleanSymbol(decodeAbiString(sym))
  const name   = cleanName(decodeAbiString(nam) || address.slice(0,10))
  const decimals = parseInt(dec, 16)
  return {
    symbol,
    name,
    decimals: Number.isFinite(decimals) ? decimals : 18
  }
}

// ——— Persistenza & recenti ———
const CUSTOM_KEY = 'bls_custom_tokens_v1'
const RECENT_KEY = 'bls_recent_tokens_v1'
type Persisted = { symbol: string; name: string; address: string; icon?: string; decimals?: number }

function loadCustom(): Persisted[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]') } catch { return [] }
}
function saveCustom(list: Persisted[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list))
}
function upsertCustom(tok: Token) {
  const list = loadCustom()
  const i = list.findIndex(t => (t.address || '').toLowerCase() === (tok.address || '').toLowerCase())
  const row = { symbol: tok.symbol, name: tok.name, address: tok.address, icon: tok.icon, decimals: tok.decimals }
  if (i >= 0) list[i] = row
  else list.push(row)
  saveCustom(list)
}
function loadRecents(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '{}') } catch { return {} }
}
function bumpRecent(address: string) {
  const map = loadRecents()
  map[(address || '').toLowerCase()] = Date.now()
  localStorage.setItem(RECENT_KEY, JSON.stringify(map))
}
const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test((s||'').trim())
const eqAddr = (a: string, b: string) => (a || '').toLowerCase() === (b || '').toLowerCase()

// ——— formatting ———
const formatUnitsStr = (value: bigint, decimals = 18) => {
  const base = 10n ** BigInt(decimals)
  const i = value / base
  const f = value % base
  let fStr = f.toString().padStart(decimals, '0')
  fStr = fStr.replace(/0+$/, '')
  return fStr ? `${i}.${fStr}` : i.toString()
}
function tokenBalanceSmart(raw: bigint, decimals: number): string {
  const s = formatUnitsStr(raw, decimals)
  const n = Number(s)
  if (Number.isFinite(n)) {
    const abs = Math.abs(n)
    let maxFrac = 0
    if (abs >= 1000) maxFrac = 0
    else if (abs >= 100) maxFrac = 2
    else if (abs >= 1) maxFrac = 4
    else maxFrac = 6
    return n.toLocaleString('en-US', { maximumFractionDigits: maxFrac })
  }
  const [iPart, fPart=''] = s.split('.')
  const intFmt = iPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fPart ? `${intFmt}.${fPart.slice(0,6)}` : intFmt
}

// ————————————————————————————————————————————————

const TokenSelector: React.FC<Props> = ({ open, side, onClose, onSelect, tokens = DEFAULT_TOKENS, account, excludeAddress }) => {
  const [q, setQ] = useState('')
  const [baseList, setBaseList] = useState<Token[]>(tokens)
  const [list, setList] = useState<Token[]>(tokens)
  const [fetching, setFetching] = useState(false)
  const [fetched, setFetched] = useState<Token | null>(null)
  const [error, setError] = useState<string | null>(null)

  // balances map
  type Bal = { raw: bigint; formatted: string; decimals: number }
  const [balances, setBalances] = useState<Record<string, Bal>>({})

  // icone idratate da Dexscreener (con cache locale)
  const [iconMap, setIconMap] = useState<IconCache>(() => loadIconCache())

  // persistenti (custom) — ricarica a ogni apertura
  useEffect(() => {
    if (!open) return
    const customs = loadCustom()
    const merged: Token[] = [
      PLS,
      ...customs.map(c => ({ ...c })),
      ...DEFAULT_TOKENS.filter(t => t.address !== 'native'),
    ]
    const seen = new Set<string>()
    const uniq = merged.filter(t => {
      const k = (t.address === 'native' ? 'native' : t.address.toLowerCase())
      if (seen.has(k)) return false
      seen.add(k); return true
    })
    setBaseList(uniq)
    setList(uniq)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // lock scroll
  useEffect(() => {
    if (typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = open ? 'hidden' : prev
    return () => { document.body.style.overflow = prev }
  }, [open])

  useEffect(() => { if (open) setQ('') }, [open])

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
            return [t.address, { raw, formatted: tokenBalanceSmart(raw, 18), decimals: 18 }]
          } else {
            const [dec, raw] = await Promise.all([ getTokenDecimals(t.address), getErc20Balance(t.address, account) ])
            return [t.address, { raw, formatted: tokenBalanceSmart(raw, dec), decimals: dec }]
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

  // risolvi icone da Dexscreener per i token in lista (lazy, con cache)
  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      const cache = { ...iconMap }
      const tasks: Promise<void>[] = []
      for (const t of list) {
        const addr = (t.address || '').toLowerCase()
        if (!addr || addr === 'native') continue
        // se ha già un'icona manuale, non fare fetch né cache
        if (t.icon) { cache[addr] = t.icon; continue }
        if (cache[addr]) continue
        tasks.push((async () => {
          const icon = await fetchDexscreenerIcon(addr)
          cache[addr] = icon || NO_ICON
        })())
      }
      if (tasks.length) {
        await Promise.allSettled(tasks)
      }
      if (!alive) return
      setIconMap(cache)
      saveIconCache(cache)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list])

  // se incolli address esterno → anteprima add (persistente) con icona Dexscreener
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
        const chainMeta = await fetchTokenMetaFromChain(s)
        // icona Dexscreener con cache
        const addrLC = s.toLowerCase()
        let icon = iconMap[addrLC]
        if (!icon) {
          icon = await fetchDexscreenerIcon(addrLC) || NO_ICON
          const next = { ...iconMap, [addrLC]: icon }
          setIconMap(next)
          saveIconCache(next)
        }
        const symbol = KNOWN[s]?.symbol ?? chainMeta.symbol
        const name   = KNOWN[s]?.name   ?? chainMeta.name
        const manual = KNOWN[s]?.icon
        const t: Token = {
          symbol, name, address: s, icon: manual || icon, decimals: chainMeta.decimals
        }
        if (alive) setFetched(t)
      } catch {
        if (alive) { setError('Impossibile leggere il token'); setFetched(null) }
      } finally {
        if (alive) setFetching(false)
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, list])

  // filtro + ordinamento: posseduti prima; poi recenti; PLS tra i posseduti in testa
  const recents = useMemo(() => loadRecents(), [])
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
    const recentScore = (t: Token) => recents[(t.address || '').toLowerCase()] || 0
    const arr = [...base]
    arr.sort((a,b) => {
      const ha = has(a), hb = has(b)
      if (ha && !hb) return -1
      if (!ha && hb) return 1
      if (ha && hb) {
        if (a.address === 'native' && b.address !== 'native') return -1
        if (b.address === 'native' && a.address !== 'native') return 1
      }
      const ra = recentScore(a), rb = recentScore(b)
      if (ra !== rb) return rb - ra
      return a.symbol.localeCompare(b.symbol)
    })
    return arr
  }, [q, list, balances, recents])

  if (!open) return null

    const apply = (t: Token) => {
    // blocca token uguale sull'altro lato
    if (excludeAddress && (t.address || '').toLowerCase() === (excludeAddress || '').toLowerCase()) return
    const addrLC = (t.address || '').toLowerCase()
    const resolvedIcon =
      t.icon
      || (addrLC && addrLC !== 'native' ? iconMap[addrLC] : undefined)
      || (t.address === 'native' ? (PLS.icon as string) : NO_ICON)
    const selected: Token = { ...t, icon: resolvedIcon }
    onSelect(selected)
    bumpRecent(t.address === 'native' ? 'native' : t.address)
    onClose()
  }


  const addFetched = () => {
    if (!fetched) return
    if (!list.some(x => eqAddr(x.address, fetched.address))) {
      const next = [fetched, ...baseList.filter(x => !eqAddr(x.address, fetched.address))]
      setBaseList(next)
      setList(next)
      upsertCustom(fetched) // persist
    } else {
      // aggiorna icona/simbolo se migliorati
      const next = baseList.map(x => eqAddr(x.address, fetched.address) ? { ...x, ...fetched } : x)
      setBaseList(next)
      setList(next)
      upsertCustom(fetched)
    }
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
  const listWrap: React.CSSProperties = { maxHeight:'60vh', overflowY:'auto', paddingRight:2 }
  const itemStyle: React.CSSProperties = {
    display:'grid',
    gridTemplateColumns:'auto 1fr auto auto',
    alignItems:'center',
    gap:12,
    width:'100%',
    padding:'10px 12px',
    borderRadius:12,
    background:'rgba(255,255,255,0.06)',
    border:'1px solid rgba(255,255,255,0.15)',
    marginBottom:6,
    cursor:'pointer'
  }
  const avatarStyle: React.CSSProperties = { width:22, height:22, borderRadius:999, objectFit:'cover', background:'#1a1b1d' }
  const symStyle: React.CSSProperties = { fontWeight:700, fontSize:14, lineHeight:1.1 }
  const nameStyle: React.CSSProperties = { opacity:.8, fontSize:12 }
  const qtyStyle: React.CSSProperties = { fontVariantNumeric:'tabular-nums', fontSize:12, opacity:.95 }
  const addrStyle: React.CSSProperties = { opacity:.6, fontSize:11 }

  // Priorità icone: manuale (t.icon) > cache Dexscreener > fallback
  const iconOf = (t: Token) => {
    if (t.icon) return t.icon
    const addrLC = (t.address || '').toLowerCase()
    if (addrLC && addrLC !== 'native' && iconMap[addrLC]) return iconMap[addrLC]
    return t.address === 'native' ? (PLS.icon as string) : NO_ICON
  }

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={panel}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
          <h3 style={{margin:0, fontSize:16, fontWeight:700}}>
            Select a token {side === 'pay' ? '(You pay)' : '(You receive)'}
          </h3>
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
              disabled={fetching || !fetched || (excludeAddress && fetched?.address.toLowerCase() === excludeAddress.toLowerCase())}
              onClick={addFetched}
              style={{
                display:'flex', alignItems:'center', gap:10, width:'100%',
                background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.18)',
                borderRadius:12, padding:10, cursor: fetching || !fetched ? 'default' : 'pointer',
                opacity: (excludeAddress && fetched?.address.toLowerCase() === excludeAddress.toLowerCase()) ? .5 : 1
              }}
            >
              <span className="token-avatar">
                {fetched && (
                  <img
                    src={iconOf(fetched)}
                    alt={fetched.symbol || 'token'}
                    width={22}
                    height={22}
                    style={avatarStyle}
                    onError={(e)=>{ (e.currentTarget as HTMLImageElement).src = NO_ICON }}
                  />
                )}
              </span>
              <div className="token-meta" style={{display:'flex', flexDirection:'column'}}>
                <span className="token-symbol" style={symStyle}>{fetched?.symbol || q.slice(0,10)}</span>
                <span className="token-name" style={nameStyle}>{fetched?.name || 'ERC-20 on PulseChain'}</span>
              </div>
              <div className="token-addr" style={{marginLeft:'auto', ...addrStyle}}>{q.slice(0,6)}…{q.slice(-4)}</div>
            </button>
          </div>
        )}

        {/* Lista */}
        <div style={listWrap}>
          {filteredSorted.map(t => {
            const bal = balances[t.address]
            const qty = bal ? bal.formatted : ''
            const same = excludeAddress && (t.address || '').toLowerCase() === excludeAddress.toLowerCase()
            const icon = iconOf(t)
            return (
              <button
                key={`item-${t.address}-${t.symbol}`}
                onClick={() => apply(t)}
                style={{...itemStyle, cursor: same ? 'not-allowed' : 'pointer', opacity: same ? .5 : 1}}
                disabled={!!same}
              >
                <span className="token-avatar">
                  <img
                    src={icon}
                    alt={t.symbol}
                    width={22}
                    height={22}
                    style={avatarStyle}
                    onError={(e)=>{ (e.currentTarget as HTMLImageElement).src = NO_ICON }}
                  />
                </span>
                <div className="token-meta" style={{display:'flex', flexDirection:'column', overflow:'hidden'}}>
                  <span className="token-symbol" style={symStyle}>{t.symbol}</span>
                  <span className="token-name" style={{...nameStyle, whiteSpace:'nowrap', textOverflow:'ellipsis', overflow:'hidden'}}>{t.name}</span>
                </div>
                {qty && <span className="token-bal" style={qtyStyle}>{qty}</span>}
                <span className="token-addr" style={addrStyle}>{t.address === 'native' ? 'native' : `${t.address.slice(0,6)}…${t.address.slice(-4)}`}</span>
              </button>
            )
          })}
          {!filteredSorted.length && (
            <div style={{textAlign:'center', opacity:.7, fontSize:13, padding:'14px 6px'}}>
              Nessun token trovato.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TokenSelector

// === Helpers extra usati sopra ===
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
