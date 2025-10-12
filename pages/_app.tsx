import TransactionProvider from '../context/TransactionContext'
import '../styles/globals.css'
import '../styles/custom.css'
import type { AppProps } from 'next/app'

import '@rainbow-me/rainbowkit/styles.css'
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http } from 'viem'
import MobileAutoConnector from '../components/MobileAutoConnector' // ✅ Nuovo connettore mobile

// 👉 PulseChain
const pulsechain = {
  id: 369,
  name: 'PulseChain',
  network: 'pulsechain',
  nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.pulsechain.com'] },
    public:  { http: ['https://rpc.pulsechain.com'] },
  },
  blockExplorers: {
    default: { name: 'PulseScan', url: 'https://scan.pulsechain.com' },
  },
}

// ⚠️ Imposta un vero WalletConnect Project ID da https://cloud.walletconnect.com
const WALLETCONNECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_ID || 'demo'

// ⚙️ Configurazione Wagmi + RainbowKit
const config = getDefaultConfig({
  appName: 'Bullscope Swap',
  projectId: WALLETCONNECT_ID,
  chains: [pulsechain],
  transports: {
    [pulsechain.id]: http('https://rpc.pulsechain.com'),
  },
  ssr: true,
})

const queryClient = new QueryClient()

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <RainbowKitProvider>
          {/* 🔹 Auto-connect mobile parallelo */}
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
