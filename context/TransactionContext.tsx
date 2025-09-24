import React, { useState, useEffect, createContext } from 'react'
import {
  useAccount,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { parseEther } from 'viem'
import { contractABI, contractAddress } from '../lib/constants'
import { client } from '../lib/sanityClient'
import { useRouter } from 'next/router'

/* ===== Tipi forti per il Context ===== */
type Address = `0x${string}`
type TxContext = {
  currentAccount: Address | null
  connectWallet: () => void
  sendTransaction: () => Promise<void> | void
  handleChange: (e: any, name?: string) => void
  formData: { addressTo: string; amount: string }
  isLoading: boolean
}

/* Default context (usato solo per inizializzare React Context) */
const defaultCtx: TxContext = {
  currentAccount: null,
  connectWallet: () => {},
  sendTransaction: async () => {},
  handleChange: () => {},
  formData: { addressTo: '', amount: '' },
  isLoading: false,
}

export const TransactionContext = createContext<TxContext>(defaultCtx)

export function TransactionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { address: wagmiAddress, isConnected } = useAccount()
  const [formData, setFormData] = useState({ addressTo: '', amount: '' })

  // PATH A: native PLS
  const {
    sendTransactionAsync,
    data: txHashNative,
    isPending: isSendingNative,
  } = useSendTransaction()

  // PATH B: router (contratto)
  const {
    writeContractAsync,
    data: txHashRouter,
    isPending: isSendingRouter,
  } = useWriteContract()

  const awaitedHash = txHashRouter ?? txHashNative
  const {
    isLoading: isConfirming,
    isSuccess,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash: awaitedHash })

  const isLoading = isSendingNative || isSendingRouter || isConfirming

  // accetta opzionale `name` per compat con chiamate esistenti
  const handleChange = (e: any, name?: string) => {
    const key = name || e?.target?.name
    if (!key) return
    setFormData(prev => ({ ...prev, [key]: e.target.value }))
  }

  const saveTransaction = async (hash: string, amount: string, fromAddress: string, toAddress: string) => {
    try {
      const txDoc = {
        _type: 'transactions',
        _id: hash,
        fromAddress,
        toAddress,
        timestamp: new Date(Date.now()).toISOString(),
        txHash: hash,
        amount: parseFloat(amount || '0'),
      }
      await client.createIfNotExists(txDoc)
      await client
        .patch(fromAddress)
        .setIfMissing({ transactions: [] })
        .insert('after', 'transactions[-1]', [{ _key: hash, _ref: hash, _type: 'reference' }])
        .commit()
    } catch (e) {
      console.error('Sanity save error:', e)
    }
  }

  const sendTransaction = async () => {
    const { addressTo, amount } = formData
    if (!isConnected) return console.warn('Wallet non connesso (usa Connect Wallet)')
    if (!addressTo || !amount) return

    try {
      const useRouter = process.env.NEXT_PUBLIC_USE_ROUTER === '1'

      if (useRouter) {
        // ===== ROUTER CALL =====
        const fnName = process.env.NEXT_PUBLIC_ROUTER_FN || 'publishTransaction'
        const args = [
          addressTo as Address,
          parseEther(amount),
          `Transaction PLS ${amount} to ${addressTo}`,
          'TRANSFER',
        ]
        await writeContractAsync({
          address: contractAddress as Address,
          abi: contractABI,
          functionName: fnName,
          args,
          value: parseEther(amount), // togli se la tua fn non è payable
        })
      } else {
        // ===== INVIO NATIVO PLS =====
        await sendTransactionAsync({
          to: addressTo as Address,         // 👈 TS vuole un address tipizzato
          value: parseEther(amount),
        })
      }

      setFormData({ addressTo: '', amount: '' })
    } catch (e) {
      console.error('sendTransaction error:', e)
    }
  }

  // crea profilo utente su Sanity quando cambia account
  useEffect(() => {
    if (!wagmiAddress) return
    ;(async () => {
      try {
        const userDoc = {
          _type: 'users',
          _id: wagmiAddress,
          userName: 'Unnamed',
          address: wagmiAddress,
        }
        await client.createIfNotExists(userDoc)
      } catch (e) {
        console.error('Sanity user error:', e)
      }
    })()
  }, [wagmiAddress])

  // toggla loader page come prima
  useEffect(() => {
    if (isLoading) router.push(`/?loading=${wagmiAddress ?? ''}`)
    else router.push('/')
  }, [isLoading, wagmiAddress, router])

  // al successo, salva su Sanity
  useEffect(() => {
    if (!isSuccess || !awaitedHash) return
    const to = receipt?.to || ''
    const from = wagmiAddress || ''
    saveTransaction(awaitedHash, formData.amount, from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, awaitedHash])

  return (
    <TransactionContext.Provider
      value={{
        currentAccount: (wagmiAddress ?? null) as Address | null, // 👈 coerciamo a Address|null
        connectWallet: () => {}, // RainbowKit gestisce la connessione
        sendTransaction,
        handleChange,
        formData,
        isLoading,
      }}
    >
      {children}
    </TransactionContext.Provider>
  )
}

export default TransactionProvider
