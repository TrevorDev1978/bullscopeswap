import TransactionProvider from '../context/TransactionContext'
import '../styles/globals.css'
import '../styles/custom.css'
import type { AppProps } from 'next/app'

import '@rainbow-me/rainbowkit/styles.css'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { WagmiProvider, createConfig } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http } from 'viem'
import { injected, walletConnect } from 'wagmi/connectors'
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
  process.env.NEXT_PUBLIC_WALLETCONNECT_ID || '' // deve essere VALIDO (niente 'demo')
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://bullscopeswap.vercel.app' // https pubblico
const APP_ICON = `${APP_URL}/favicon.ico` // icona assoluta https

// ⚙️ Config Wagmi con connettori espliciti + metadata (fondamentale per mobile)
const hasWC = Boolean(WALLETCONNECT_ID)

const config = createConfig({
  chains: [pulsechain],
  transports: {
    [pulsechain.id]: http('https://rpc.pulsechain.com'),
  },
  connectors: [
    // 1) Injected: funziona subito nel browser in-app di MetaMask/OKX/Trust
    injected({
      shimDisconnect: true,
    }),
    // 2) WalletConnect v2: istanziato solo se il projectId è reale
    ...(hasWC
      ? [
          walletConnect({
            projectId: WALLETCONNECT_ID,
            showQrModal: false,
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
  ssr: true,
   // ✅ aggiunta qui per persistenza connessione
})

const queryClient = new QueryClient()

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config} reconnectOnMount={true} autoConnect={true}>
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
