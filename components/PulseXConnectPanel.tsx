import React, { useEffect, useMemo } from 'react'
import { useAccount, useConnect } from 'wagmi'

declare global {
  interface Window { ethereum?: any }
}

type Props = {
  open: boolean
  onClose: () => void
}

const PULSE_CHAIN_HEX = '0x171' // 369 (PulseChain)
const RPC_INFO = {
  chainId: PULSE_CHAIN_HEX,
  chainName: 'PulseChain',
  nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 },
  rpcUrls: ['https://rpc.pulsechain.com'],
  blockExplorerUrls: ['https://scan.pulsechain.com'],
}

async function ensurePulseChain(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.ethereum) return false
  try {
    const cid = await window.ethereum.request({ method: 'eth_chainId' })
    if (cid === PULSE_CHAIN_HEX) return true
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: PULSE_CHAIN_HEX }] })
      return true
    } catch (e: any) {
      if (e?.code === 4902) {
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [RPC_INFO] })
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: PULSE_CHAIN_HEX }] })
        return true
      }
      return false
    }
  } catch {
    return false
  }
}

function isMobileUA() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

const MM_ICON = '/images/metamask.png'
const WC_ICON = '/images/walletconnect.png'
const CB_ICON = '/images/coinbase.png'
const TRUST_ICON = '/images/trust.png'
const BRAVE_ICON = '/images/brave.png'
const OPERA_ICON = '/images/opera.png'
const BINANCE_ICON = '/images/binance.png'
const MATH_ICON = '/images/mathwallet.png'
const LEDGER_ICON = '/images/ledger.png'
const BLOCTO_ICON = '/images/blocto.png'

const walletList = [
  { key: 'metamask', label: 'MetaMask', icon: MM_ICON, type: 'injected' as const },
  { key: 'walletconnect', label: 'WalletConnect', icon: WC_ICON, type: 'walletconnect' as const },
  { key: 'coinbase', label: 'Coinbase Wallet', icon: CB_ICON, type: 'coinbase' as const },
  { key: 'trust', label: 'Trust Wallet', icon: TRUST_ICON, type: 'walletconnect' as const },
  { key: 'binance', label: 'Binance Wallet', icon: BINANCE_ICON, type: 'injected' as const },
  { key: 'blocto', label: 'Blocto', icon: BLOCTO_ICON, type: 'walletconnect' as const },
  { key: 'brave', label: 'Brave', icon: BRAVE_ICON, type: 'injected' as const },
  { key: 'opera', label: 'Opera', icon: OPERA_ICON, type: 'injected' as const },
  { key: 'mathwallet', label: 'MathWallet', icon: MATH_ICON, type: 'walletconnect' as const },
  { key: 'ledger', label: 'Ledger', icon: LEDGER_ICON, type: 'walletconnect' as const },
]

const PulseXConnectPanel: React.FC<Props> = ({ open, onClose }) => {
  const { isConnected } = useAccount()
  const { connect, connectors, status } = useConnect()

  // chiudi il pannello appena connesso
  useEffect(() => { if (isConnected) onClose() }, [isConnected, onClose])

  // mappa connettori
  const injectedConnector = useMemo(() => connectors.find(c => c.id === 'injected'), [connectors])
  const wcConnector       = useMemo(() => connectors.find(c => c.id === 'walletConnect'), [connectors])
  const cbConnector       = useMemo(() => connectors.find(c => c.id === 'coinbaseWallet'), [connectors])

  // detection base (EIP-6963 sarebbe “extra”, ma qui basta flag comuni)
  const hasInjected = typeof window !== 'undefined' && !!(window as any).ethereum
  const mmInstalled = typeof window !== 'undefined' && !!(window as any).ethereum?.isMetaMask
  const braveInstalled = typeof window !== 'undefined' && !!(window as any).ethereum?.isBraveWallet
  const operaInstalled = typeof window !== 'undefined' && (!!(window as any).ethereum?.isOpera || !!(window as any).ethereum?.isOperaCrypto)

  async function connectViaInjected() {
    if (!injectedConnector) return
    // come PulseX: chain first → request accounts
    await ensurePulseChain()
    connect({ connector: injectedConnector })
  }
  function connectViaWC() { if (wcConnector) connect({ connector: wcConnector }) }
  function connectViaCB() { if (cbConnector) connect({ connector: cbConnector }) }

  function onClickWallet(key: string, type: 'injected' | 'walletconnect' | 'coinbase') {
    if (type === 'injected') return connectViaInjected()
    if (type === 'coinbase') return connectViaCB()
    return connectViaWC()
  }

  if (!open) return null
  return (
    <div className="pxx-modal" role="dialog" aria-modal="true" onClick={(e)=>{ if (e.target===e.currentTarget) onClose() }}>
      <div className="pxx-box">
        <div className="pxx-head">
          <h3>Connect Wallet</h3>
          <button className="pxx-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pxx-grid">
          {walletList.map(w => (
            <button
              key={w.key}
              className="pxx-wallet"
              onClick={() => onClickWallet(w.key, w.type)}
              disabled={status === 'pending'}
              title={w.label}
            >
              <img src={w.icon} alt={w.label} />
              <span>{w.label}</span>
              {/* micro badge installato/no */}
              {w.key === 'metamask' && hasInjected && (
                <em className="pxx-badge">{mmInstalled ? 'Installed' : 'Injected'}</em>
              )}
              {w.key === 'brave' && braveInstalled && <em className="pxx-badge">Installed</em>}
              {w.key === 'opera' && operaInstalled && <em className="pxx-badge">Installed</em>}
            </button>
          ))}
        </div>

        <div className="pxx-foot">
          <span className="hint">
            On mobile, MetaMask opens via WalletConnect QR/link automatically.
          </span>
        </div>
      </div>

      {/* CSS scoped — *stessa* impostazione visiva “PulseX-style” */}
      <style jsx>{`
        .pxx-modal { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.45); z-index:9999; }
        .pxx-box { width:min(560px,94vw); background:#0e1117; color:#fff; border:1px solid #2a3650; border-radius:16px; padding:18px; box-shadow:0 30px 70px rgba(0,0,0,.5); }
        .pxx-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
        .pxx-head h3 { margin:0; font-weight:800; letter-spacing:.2px; }
        .pxx-close { background:transparent; border:0; color:#cde3ff; cursor:pointer; font-size:20px; }
        .pxx-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
        @media(min-width:520px){ .pxx-grid{ grid-template-columns:repeat(3,1fr); } }
        .pxx-wallet { position:relative; display:flex; align-items:center; gap:10px; padding:12px; border-radius:12px; background:linear-gradient(180deg,#161b22,#0f141b); border:1px solid rgba(90,140,210,.25); transition:transform .06s ease, border-color .15s ease; }
        .pxx-wallet:hover { transform: translateY(-1px); border-color: rgba(90,140,210,.55); }
        .pxx-wallet img { width:28px; height:28px; object-fit:contain; }
        .pxx-badge { position:absolute; right:10px; top:10px; font-size:10px; opacity:.75; }
        .pxx-foot { margin-top:10px; font-size:.9rem; opacity:.8; }
        .hint { opacity:.8; }
      `}</style>
    </div>
  )
}

export default PulseXConnectPanel
