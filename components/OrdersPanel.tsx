import React, { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'

const ABI_LIMIT = [
  'function orders(uint256) view returns (address maker,address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 expiry,uint256 tipPLS,bool filled,bool cancelled)',
  'function ordersOfMaker(address) view returns (uint256[])',
  'function cancel(uint256 id)'
]
const SELECTOR = { decimals: '0x313ce567' }
const RPC_URL = 'https://rpc.pulsechain.com'

const hexToBigInt = (hex: string) => (!hex || hex === '0x' ? 0n : BigInt(hex))
const formatUnitsBI = (v: bigint, decimals = 18, maxFrac = 6) => {
  const base = 10n ** BigInt(decimals)
  const ip = v / base
  let fp = (v % base).toString().padStart(decimals, '0')
  if (maxFrac >= 0) fp = fp.slice(0, maxFrac)
  fp = fp.replace(/0+$/, '')
  return ip.toString() + (fp ? '.' + fp : '')
}
const addrParam = (addr: string) => ('0'.repeat(24) + addr.toLowerCase().replace(/^0x/, ''))

async function ethCall(address: string, data: string) {
  try {
    if ((window as any)?.ethereum) {
      const cid = await (window as any).ethereum.request({ method: 'eth_chainId' })
      if (cid === '0x171') {
        return await (window as any).ethereum.request({
          method: 'eth_call',
          params: [{ to: address, data }, 'latest'],
        }) as string
      }
    }
  } catch {}
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: address, data }, 'latest'] }),
  })
  const j = await r.json(); if (j?.error) throw new Error(j.error.message || 'eth_call failed')
  return j.result as string
}
async function getTokenDecimals(addr: string) {
  if (!addr || addr.toLowerCase() === '0x0000000000000000000000000000000000000000') return 18
  try {
    const res = await ethCall(addr, SELECTOR.decimals)
    const n = parseInt(res, 16); return Number.isFinite(n) ? n : 18
  } catch { return 18 }
}

const OrdersPanel: React.FC<{ limitAddress: string }> = ({ limitAddress }) => {
  const [account, setAccount] = useState<string | null>(null)
  const [ids, setIds] = useState<number[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const accs: string[] = await (window as any).ethereum.request({ method: 'eth_requestAccounts' })
        if (on) setAccount(accs?.[0] || null)
      } catch { setAccount(null) }
    })()
    return () => { on = false }
  }, [])

  const refresh = useMemo(() => async () => {
    if (!account || !(window as any)?.ethereum) return
    setLoading(true)
    try {
      const E: any = ethers as any
      const provider = E.BrowserProvider ? new E.BrowserProvider((window as any).ethereum) : new E.providers.Web3Provider((window as any).ethereum)
      const signer = provider.getSigner ? await provider.getSigner() : await provider.getSigner(0)
      const limit = new E.Contract(limitAddress, ABI_LIMIT, signer)
      const idList: bigint[] = await limit.ordersOfMaker(account)
      const ints = idList.map(x => Number(x))
      const details = await Promise.all(ints.map(i => limit.orders(i)))
      setIds(ints)
      setRows(details)
    } finally {
      setLoading(false)
    }
  }, [account, limitAddress])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [refresh])

  if (!account) return <div className="opacity-70 text-sm">Connect your wallet to view your limit orders.</div>

  return (
    <div className="bg-[#191B1F] rounded-xl p-3 border border-white/10">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">My Limit Orders</div>
        <button className="pill" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      {!ids.length ? (
        <div className="opacity-70 text-sm">No open orders.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((o: any, i: number) => {
            const id = ids[i]
            const closed = o.filled || o.cancelled
            const tokenIn = String(o.tokenIn)
            const tokenOut = String(o.tokenOut)
            const [di, do_] = [o._decIn ?? 18, o._decOut ?? 18]
            const [ai, mo] = [o.amountIn as bigint, o.minOut as bigint]
            const [aiF, moF] = [formatUnitsBI(ai, di, 8), formatUnitsBI(mo, do_, 8)]
            return (
              <div key={id} className="p-2 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm">
                    <div className="font-semibold">#{id} {closed ? '• CLOSED' : '• OPEN'}</div>
                    <div className="opacity-80">in: {tokenIn.slice(0,6)}…{tokenIn.slice(-4)} → out: {tokenOut.slice(0,6)}…{tokenOut.slice(-4)}</div>
                    <div className="opacity-90">amountIn: {aiF} • minOut: {moF}</div>
                  </div>
                  {!closed && (
                    <button className="pill" onClick={async () => {
                      const E: any = ethers as any
                      const provider = E.BrowserProvider ? new E.BrowserProvider((window as any).ethereum) : new E.providers.Web3Provider((window as any).ethereum)
                      const signer = provider.getSigner ? await provider.getSigner() : await provider.getSigner(0)
                      const limit = new E.Contract(limitAddress, ABI_LIMIT, signer)
                      const tx = await limit.cancel(id)
                      await tx.wait()
                      refresh()
                    }}>Cancel</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style jsx>{`.pill{ padding:6px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.06) }`}</style>
    </div>
  )
}

export default OrdersPanel