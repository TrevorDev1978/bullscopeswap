// components/MobileAutoConnector.tsx
import React, { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'

/** Rilevazione mobile semplice ma efficace */
function isMobileUA() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** PulseChain chain params (stesse di progetto) */
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

/** Deep link per aprire la DApp direttamente nel browser in-app di MetaMask Mobile */
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
    // Redirect “morbido”: se MM non c’è, iOS/Android porteranno allo store
    window.location.href = url
  } catch {
    // silenzio
  }
}

/** Componente “parallelo” che non tocca il resto: tenta auto-connect su mobile */
const MobileAutoConnector: React.FC = () => {
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()

  const triedRef = useRef(false)

  useEffect(() => {
    const run = async () => {
      if (triedRef.current) return
      triedRef.current = true

      // Attiva solo su device mobile e solo se non sei già connesso
      if (!isMobileUA() || isConnected) return

      // 1) Se siamo nel browser in-app (ethereum presente), prova auto-connect diretto
      const hasInjected = typeof window !== 'undefined' && !!(window as any).ethereum
      if (hasInjected) {
        try {
          const ok = await ensurePulseChain()
          if (ok) {
            await (window as any).ethereum.request({ method: 'eth_requestAccounts' })
            return // se va, finiamo qui
          }
        } catch {
          // passa al piano B
        }
      }

      // 2) Se NON c’è provider mobile, prova una volta a riaprire in MetaMask
      if (!hasInjected) {
        openInMetaMaskDappOncePerSession()
        // Nota: se l’utente rientra e ancora non c’è provider, passiamo al piano C
      }

      // 3) Piano C: apri in automatico il modal di RainbowKit (WalletConnect)
      try {
        // piccolo delay per evitare conflitti con SSR/hydration
        setTimeout(() => openConnectModal?.(), 350)
      } catch {
        // silenzio
      }
    }

    run()
  }, [isConnected, openConnectModal])

  return null
}

export default MobileAutoConnector
