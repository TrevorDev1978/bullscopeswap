import TransactionProvider from '../context/TransactionContext'
import '../styles/globals.css'
import '../styles/custom.css'
import type { AppProps } from 'next/app'
// import { TransactionProvider } from '../context/TransactionContext' //

import '@rainbow-me/rainbowkit/styles.css'
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http } from 'viem'

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

// Config wagmi + RainbowKit (v2)
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
          {/* ⬇️ Tieni il tuo context */}
          <TransactionProvider>
            <Component {...pageProps} />
          </TransactionProvider>
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  )
}

export default MyApp
