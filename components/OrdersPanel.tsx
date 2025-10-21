import React, { useEffect, useState } from 'react'

const ABI_LIMIT = [
  'function orders(uint256) view returns (address maker,address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 expiry,uint256 tipPLS,bool filled,bool cancelled)',
  'function ordersOfMaker(address) view returns (uint256[])',
  'function cancel(uint256 id)'
]

const OrdersPanel: React.FC<{ limitAddress:string; ethers:any; account?:string|null }> = ({ limitAddress, ethers, account }) => {
  const [ids, setIds] = useState<number[]>([])
  const [rows, setRows] = useState<any[]>([])

  useEffect(()=>{
    if (!account || !ethers) return
    let alive = true
    ;(async()=>{
      const provider = new ethers.BrowserProvider((window as any).ethereum)
      const limit = new ethers.Contract(limitAddress, ABI_LIMIT, await provider.getSigner())
      const idList: bigint[] = await limit.ordersOfMaker(account)
      const ints = idList.map(x=>Number(x))
      const details = await Promise.all(ints.map(i=>limit.orders(i)))
      if (alive){ setIds(ints); setRows(details) }
    })()
    return ()=>{ alive=false }
  }, [account, ethers, limitAddress])

  if (!account) return null

  return (
    <div className="bg-[#191B1F] rounded-xl p-3 border border-white/10">
      <div className="font-semibold mb-2">My Limit Orders</div>
      {!ids.length ? (
        <div className="opacity-70 text-sm">No open orders.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((o,i)=>{
            const closed = o.filled || o.cancelled
            return (
              <div key={ids[i]} className="p-2 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between">
                <div className="text-sm">#{ids[i]} • minOut: {String(o.minOut)} • {closed? 'CLOSED':'OPEN'}</div>
                {!closed && <button className="pill" onClick={async()=>{
                  const provider = new (window as any).ethers.BrowserProvider((window as any).ethereum)
                  const limit = new (window as any).ethers.Contract(limitAddress, ABI_LIMIT, await provider.getSigner())
                  const tx = await limit.cancel(ids[i]); await tx.wait()
                }}>Cancel</button>}
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