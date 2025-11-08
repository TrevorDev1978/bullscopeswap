import React, { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'

declare global { interface Window { ethereum?: any } }

const ABI_LIMIT = [
  // views
  'function orders(uint256) view returns (address maker,address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 expiry,uint256 tipPLS,bool filled,bool cancelled)',
  'function ordersOfMaker(address) view returns (uint256[])',
  'function router() view returns (address)',
  'function wpls() view returns (address)',
  // actions
  'function cancel(uint256 id)',
  'function execute(uint256 id, address[] path, uint256 deadline)',
]

const SELECTOR = {
  getAmountsOut: '0xd06ca61f',
}
const RPC_URL = 'https://rpc.pulsechain.com'
const PULSE_CHAIN_HEX = '0x171'

const format = (n: bigint, d = 18, max = 8) => {
  const base = 10n ** BigInt(d)
  const i = n / base
  let f = (n % base).toString().padStart(d,'0')
  if (max >= 0) f = f.slice(0, max)
  f = f.replace(/0+$/,'')
  return i.toString() + (f ? '.'+f : '')
}
const nowSec = () => Math.floor(Date.now()/1000)

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

async function ethCallSafe(chainHex: string, to: string, data: string) {
  try {
    if (window.ethereum) {
      const cid = await window.ethereum.request({ method: 'eth_chainId' })
      if (cid === chainHex) {
        return await window.ethereum.request({
          method: 'eth_call',
          params: [{ to, data }, 'latest'],
        }) as string
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

async function ensurePulse(): Promise<boolean> {
  if (!window.ethereum) return false
  try {
    const cid = await window.ethereum.request({ method: 'eth_chainId' })
    if (cid === PULSE_CHAIN_HEX) return true
    try {
      await window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{ chainId:PULSE_CHAIN_HEX }] })
      return true
    } catch {
      return false
    }
  } catch { return false }
}

type Ord = {
  id: number
  maker: string
  tokenIn: string
  tokenOut: string
  amountIn: bigint
  minOut: bigint
  expiry: bigint
  tipPLS: bigint
  filled: boolean
  cancelled: boolean
}

const OrdersPanel: React.FC<{ limitAddress: string }> = ({ limitAddress }) => {
  const [addr, setAddr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<Ord[]>([])
  const [routerAddr, setRouterAddr] = useState<string>('')
  const [wplsAddr, setWplsAddr] = useState<string>('')

  // connect silently
  useEffect(() => {
    (async () => {
      try {
        const a:string[] = await window.ethereum.request({ method:'eth_accounts' })
        setAddr(a?.[0] || null)
      } catch { setAddr(null) }
    })()
  }, [])

  const refresh = useMemo(() => async () => {
    if (!window.ethereum) return
    setBusy(true)
    try {
      await ensurePulse()
      const E:any = ethers as any
      const provider = E.BrowserProvider ? new E.BrowserProvider(window.ethereum) : new E.providers.Web3Provider(window.ethereum)
      const signer   = provider.getSigner ? await provider.getSigner() : await provider.getSigner(0)
      const limit    = new E.Contract(limitAddress, ABI_LIMIT, signer)

      // router & wpls del contratto (veri!)
      const [rtr, w] = await Promise.all([limit.router(), limit.wpls()])
      setRouterAddr(String(rtr))
      setWplsAddr(String(w))

      if (!addr) { setRows([]); return }
      const idList: bigint[] = await limit.ordersOfMaker(addr)
      const idNums = idList.map(x => Number(x))
      const dets = await Promise.all(idNums.map(i => limit.orders(i)))
      const packed: Ord[] = dets.map((o:any, i:number) => ({
        id: idNums[i],
        maker: o.maker,
        tokenIn: o.tokenIn,
        tokenOut: o.tokenOut,
        amountIn: BigInt(o.amountIn),
        minOut:   BigInt(o.minOut),
        expiry:   BigInt(o.expiry),
        tipPLS:   BigInt(o.tipPLS),
        filled:   Boolean(o.filled),
        cancelled:Boolean(o.cancelled),
      }))
      setRows(packed)
    } finally { setBusy(false) }
  }, [addr, limitAddress])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { const t = setInterval(refresh, 20000); return () => clearInterval(t) }, [refresh])

  // Quoting to detect "READY"
  async function quoteOut(amountIn: bigint, path: string[]): Promise<bigint> {
    if (!routerAddr) return 0n
    try {
      const data = encodeGetAmountsOut(amountIn, path)
      const res = await ethCallSafe(PULSE_CHAIN_HEX, routerAddr, data)
      const arr = decodeUintArray(res)
      return arr[arr.length - 1] || 0n
    } catch { return 0n }
  }

  function candidates(o: Ord): string[][] {
    const a0 = (o.tokenIn === '0x0000000000000000000000000000000000000000' ? wplsAddr : o.tokenIn)
    const b  = o.tokenOut
    if (!a0 || !b) return []
    const direct = [a0, b]
    const viaW   = (a0.toLowerCase() !== wplsAddr.toLowerCase() && b.toLowerCase() !== wplsAddr.toLowerCase())
      ? [a0, wplsAddr, b]
      : direct
    const uniq: string[][] = []
    const seen = new Set<string>()
    for (const p of [direct, viaW]) {
      const k = p.join('>')
      if (!seen.has(k)) { uniq.push(p); seen.add(k) }
    }
    return uniq
  }

  async function firstFillable(o: Ord): Promise<string[] | null> {
    const ps = candidates(o)
    for (const p of ps) {
      const out = await quoteOut(o.amountIn, p)
      if (out >= o.minOut) return p
    }
    return null
  }

  if (!addr) return <div className="opacity-70 text-sm">Connect your wallet to view your limit orders.</div>

  return (
    <div className="bg-[#191B1F] rounded-xl p-3 border border-white/10">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">My Limit Orders</div>
        <button className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10"
                onClick={refresh} disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {!rows.length ? (
        <div className="opacity-70 text-sm">No orders found.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((o: Ord) => {
            const closed = o.filled || o.cancelled
            const expTxt = o.expiry === 0n ? 'GTC' : (Number(o.expiry) < nowSec() ? 'EXPIRED' : new Date(Number(o.expiry)*1000).toLocaleString())
            return (
              <div key={o.id} className="p-2 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-semibold">#{o.id} {closed ? '• CLOSED' : '• OPEN'}</div>
                    <div className="opacity-80">
                      in: {String(o.tokenIn).slice(0,6)}…{String(o.tokenIn).slice(-4)} → out: {String(o.tokenOut).slice(0,6)}…{String(o.tokenOut).slice(-4)}
                    </div>
                    <div className="opacity-90">
                      amountIn: {format(o.amountIn)} • minOut: {format(o.minOut)} • expiry: {expTxt}
                    </div>
                    {(!closed && Number(o.expiry) > 0 && Number(o.expiry) < nowSec()) && (
                      <div className="text-xs text-red-400 font-semibold mt-1">Expired</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!closed && (
                      <>
                        <AsyncReadyBadge order={o} firstFillable={firstFillable} />
                        <button
                          className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10"
                          onClick={async () => {
                            try {
                              if (!(await ensurePulse())) return
                              const E:any = ethers as any
                              const provider = E.BrowserProvider ? new E.BrowserProvider(window.ethereum) : new E.providers.Web3Provider(window.ethereum)
                              const signer   = provider.getSigner ? await provider.getSigner() : await provider.getSigner(0)
                              const limit    = new E.Contract(limitAddress, ABI_LIMIT, signer)
                              const path = await firstFillable(o)
                              if (!path) { alert('Not fillable at current price.'); return }
                              const deadline = nowSec() + 900
                              const tx = await limit.execute(o.id, path, deadline)
                              await tx.wait()
                              await refresh()
                            } catch (e) {
                              console.error(e)
                              alert('Execution failed.')
                            }
                          }}
                        >
                          Fill
                        </button>
                        <button
                          className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10"
                          onClick={async () => {
                            try {
                              if (!(await ensurePulse())) return
                              const E:any = ethers as any
                              const provider = E.BrowserProvider ? new E.BrowserProvider(window.ethereum) : new E.providers.Web3Provider(window.ethereum)
                              const signer   = provider.getSigner ? await provider.getSigner() : await provider.getSigner(0)
                              const limit    = new E.Contract(limitAddress, ABI_LIMIT, signer)
                              const tx = await limit.cancel(o.id)
                              await tx.wait()
                              await refresh()
                            } catch (e) {
                              console.error(e)
                              alert('Cancel failed.')
                            }
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const AsyncReadyBadge: React.FC<{ order: Ord; firstFillable: (o: Ord)=>Promise<string[]|null> }> = ({ order, firstFillable }) => {
  const [state, setState] = useState<'checking'|'ready'|'notready'>('checking')
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const p = await firstFillable(order)
        if (!live) return
        setState(p ? 'ready' : 'notready')
      } catch { if (live) setState('notready') }
    })()
    return () => { live = false }
  }, [order, firstFillable])

  if (state === 'checking') return <span className="px-2 py-1 text-xs rounded bg-white/10">Checking…</span>
  if (state === 'ready')    return <span className="px-2 py-1 text-xs rounded bg-green-500/20 border border-green-400/40 text-green-300">READY TO FILL</span>
  return <span className="px-2 py-1 text-xs rounded bg-white/10">Not ready</span>
}

export default OrdersPanel
