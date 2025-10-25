import React, { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'

declare global { interface Window { ethereum?: any } }

const ABI_LIMIT = [
  'function orders(uint256) view returns (address maker,address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 expiry,uint256 tipPLS,bool filled,bool cancelled)',
  'function ordersOfMaker(address) view returns (uint256[])',
  'function cancel(uint256 id)'
]

const format = (n: bigint, d = 18, max = 8) => {
  const base = 10n ** BigInt(d)
  const i = n / base
  let f = (n % base).toString().padStart(d,'0')
  if (max >= 0) f = f.slice(0, max)
  f = f.replace(/0+$/,'')
  return i.toString() + (f ? '.'+f : '')
}

const OrdersPanel: React.FC<{ limitAddress: string }> = ({ limitAddress }) => {
  const [addr, setAddr] = useState<string | null>(null)
  const [ids, setIds] = useState<number[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const a:string[] = await window.ethereum.request({ method:'eth_requestAccounts' })
        setAddr(a?.[0] || null)
      } catch { setAddr(null) }
    })()
  }, [])

  const refresh = useMemo(() => async () => {
    if (!addr) return
    setBusy(true)
    try {
      const E:any = ethers as any
      const provider = E.BrowserProvider ? new E.BrowserProvider(window.ethereum) : new E.providers.Web3Provider(window.ethereum)
      const signer   = provider.getSigner ? await provider.getSigner() : await provider.getSigner(0)
      const limit    = new E.Contract(limitAddress, ABI_LIMIT, signer)
      const idList: bigint[] = await limit.ordersOfMaker(addr)
      const idNums = idList.map(x => Number(x))
      const dets = await Promise.all(idNums.map(i => limit.orders(i)))
      setIds(idNums); setRows(dets)
    } finally { setBusy(false) }
  }, [addr, limitAddress])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { const t = setInterval(refresh, 30000); return () => clearInterval(t) }, [refresh])

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

      {!ids.length ? (
        <div className="opacity-70 text-sm">No open orders.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((o:any, i:number) => {
            const id = ids[i]
            const closed = o.filled || o.cancelled
            return (
              <div key={id} className="p-2 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-semibold">#{id} {closed ? '• CLOSED' : '• OPEN'}</div>
                  <div className="opacity-80">
                    in: {String(o.tokenIn).slice(0,6)}…{String(o.tokenIn).slice(-4)} → out: {String(o.tokenOut).slice(0,6)}…{String(o.tokenOut).slice(-4)}
                  </div>
                  <div className="opacity-90">
                    amountIn: {format(o.amountIn as bigint)} • minOut: {format(o.minOut as bigint)}
                  </div>
                </div>
                {!closed && (
                  <button className="px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10"
                    onClick={async () => {
                      const E:any = ethers as any
                      const provider = E.BrowserProvider ? new E.BrowserProvider(window.ethereum) : new E.providers.Web3Provider(window.ethereum)
                      const signer   = provider.getSigner ? await provider.getSigner() : await provider.getSigner(0)
                      const limit    = new E.Contract(limitAddress, ABI_LIMIT, signer)
                      const tx = await limit.cancel(id); await tx.wait(); refresh()
                    }}>
                    Cancel
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default OrdersPanel
