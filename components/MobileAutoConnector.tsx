import { useEffect, useRef } from 'react'
import { useAccount, useConnect } from 'wagmi'

declare global {
  interface Window {
    ethereum?: any
  }
}

/** Rilevazione mobile semplice */
function isMobileUA() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** PulseChain chain params (stesse del progetto) */
const PULSE_CHAIN_HEX = '0x171' // 369
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
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: PULSE_CHAIN_HEX }],
      })
      return true
    } catch (e: any) {
      if (e?.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [RPC_INFO],
        })
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: PULSE_CHAIN_HEX }],
        })
        return true
      }
      return false
    }
  } catch {
    return false
  }
}

/** Deep link per aprire la DApp direttamente nel browser in-app di MetaMask Mobile (una sola volta per sessione) */
function openInMetaMaskDappOncePerSession() {
  if (typeof window === 'undefined') return
  try {
    // Evita redirect su ambienti non pubblici
    if (/^(localhost|127\.0\.0\.1)/i.test(window.location.hostname)) return
    // Evita loop
    if (sessionStorage.getItem('bls_mm_deeplink_done') === '1') return
    sessionStorage.setItem('bls_mm_deeplink_done', '1')

    const hostAndPath = `${window.location.host}${window.location.pathname}${window.location.search}`
    const url = `https://metamask.app.link/dapp/${hostAndPath}`
    window.location.href = url
  } catch {
    // silenzio
  }
}

/** Tenta auto-connect su mobile con injected; altrimenti prova deeplink MM. Nessun modal RainbowKit. */
export default function MobileAutoConnector() {
  const { isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const triedRef = useRef(false)

  useEffect(() => {
    if (triedRef.current) return
    if (!isMobileUA() || isConnected) return
    triedRef.current = true

    ;(async () => {
      try {
        const injected = connectors.find((c) => c.id === 'injected')
        const hasInjected = typeof window !== 'undefined' && !!(window as any).ethereum

        // 1) Browser in-app (injected): chain → connect
        if (hasInjected && injected) {
          await ensurePulseChain()
          connect({ connector: injected })
          return
        }

        // 2) Nessun injected → prova deeplink MetaMask (una volta per sessione)
        if (!hasInjected) {
          openInMetaMaskDappOncePerSession()
        }
      } catch {
        // silenzio
      }
    })()
  }, [isConnected, connect, connectors])

  return null
}
