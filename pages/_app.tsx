import TransactionProvider from '../context/TransactionContext'
import '../styles/globals.css'
import '../styles/custom.css'
import type { AppProps } from 'next/app'

import '@rainbow-me/rainbowkit/styles.css'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import {
  WagmiProvider,
  createConfig,
  cookieStorage,
  createStorage,
  http,
} from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import MobileAutoConnector from '../components/MobileAutoConnector' // ✅ Auto-connect mobile

// 👉 PulseChain
const pulsechain = {
  id: 369,
  name: 'PulseChain',
  network: 'pulsechain',
  nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.pulsechain.com'] },
    public: { http: ['https://rpc.pulsechain.com'] },
  },
  blockExplorers: {
    default: { name: 'PulseScan', url: 'https://scan.pulsechain.com' },
  },
}

// ✅ ENV obbligatori per WalletConnect mobile
const WALLETCONNECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_ID || '' // deve essere VALIDO (no “demo”)
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://bullscopeswap.vercel.app' // URL pubblico
const APP_ICON = `${APP_URL}/favicon.ico` // icona https assoluta

const hasWC = Boolean(WALLETCONNECT_ID)

// ⚙️ Config Wagmi v2 con persistenza integrata
const config = createConfig({
  chains: [pulsechain],
  transports: {
    [pulsechain.id]: http('https://rpc.pulsechain.com'),
  },
  connectors: [
    injected({ shimDisconnect: true }),

    // ✅ Coinbase Wallet aggiunto
    coinbaseWallet({
      appName: 'Bullscope Swap',
      preference: 'all',
      appLogoUrl: APP_ICON,
    }),

    // ✅ WalletConnect con QR UFFICIALE (come PulseX)
    ...(hasWC
      ? [
          walletConnect({
            projectId: WALLETCONNECT_ID,
            showQrModal: true, // 👈 mostra QR ufficiale WalletConnect
            metadata: {
              name: 'Bullscope Swap',
              description: 'DEX on PulseChain',
              url: APP_URL,
              icons: [APP_ICON],
            },
          }),
        ]
      : []),
  ],
  storage: createStorage({
    storage: cookieStorage, // ✅ mantiene connessione persistente
  }),
  ssr: true,
})

const queryClient = new QueryClient()

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* ✅ v2: niente autoConnect nel provider, già gestito via storage */}
      <WagmiProvider config={config}>
        <RainbowKitProvider>
          {/* 🔹 Auto-connect mobile “parallelo” (non tocca la tua UI) */}
          <MobileAutoConnector />

          {/* 🔹 Context originale del progetto */}
          <TransactionProvider>
            <Component {...pageProps} />
          </TransactionProvider>
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  )
}

export default MyApp
