import React, { useState, useEffect, createContext } from 'react'
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { parseEther } from 'viem'
import { contractABI, contractAddress } from '../lib/constants'
import { client } from '../lib/sanityClient'
import { useRouter } from 'next/router'

const defaultCtx = {
  currentAccount: null,
  connectWallet: () => {},          // RainbowKit gestisce la connessione
  sendTransaction: () => {},
  handleChange: () => {},
  formData: { addressTo: '', amount: '' },
  isLoading: false,
}

// Named export
export const TransactionContext = createContext(defaultCtx)

// Named export (funzione)
export function TransactionProvider({ children }) {
  const router = useRouter()
  const { address: currentAccount, isConnected } = useAccount()

  const [formData, setFormData] = useState({ addressTo: '', amount: '' })

  // PATH A: native PLS
  const { sendTransactionAsync, data: txHashNative, isPending: isSendingNative } = useSendTransaction()
  // PATH B: router (contratto)
  const { writeContractAsync, data: txHashRouter, isPending: isSendingRouter } = useWriteContract()

  const awaitedHash = txHashRouter ?? txHashNative
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: awaitedHash })

  const isLoading = isSendingNative || isSendingRouter || isConfirming

  const handleChange = (e, name) => {
    setFormData(prev => ({ ...prev, [name]: e.target.value }))
  }

  const saveTransaction = async (hash, amount, fromAddress, toAddress) => {
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
        // Configura il nome funzione del tuo router via ENV o cambia qui:
        const fnName = process.env.NEXT_PUBLIC_ROUTER_FN || 'publishTransaction'
        const args = [
          addressTo,
          parseEther(amount),
          `Transaction PLS ${amount} to ${addressTo}`,
          'TRANSFER',
        ]
        // Se la tua funzione NON è payable, rimuovi "value"
        await writeContractAsync({
          address: contractAddress,
          abi: contractABI,
          functionName: fnName,
          args,
          value: parseEther(amount), // <-- togli se non payable
        })
      } else {
        // ===== INVIO NATIVO PLS =====
        await sendTransactionAsync({
          to: addressTo,
          value: parseEther(amount),
        })
      }

      // reset UI
      setFormData({ addressTo: '', amount: '' })
    } catch (e) {
      console.error('sendTransaction error:', e)
    }
  }

  // crea profilo utente su Sanity quando cambia account
  useEffect(() => {
    if (!currentAccount) return
    ;(async () => {
      try {
        const userDoc = {
          _type: 'users',
          _id: currentAccount,
          userName: 'Unnamed',
          address: currentAccount,
        }
        await client.createIfNotExists(userDoc)
      } catch (e) {
        console.error('Sanity user error:', e)
      }
    })()
  }, [currentAccount])

  // toggla loader page come facevi prima
  useEffect(() => {
    if (isLoading) router.push(`/?loading=${currentAccount}`)
    else router.push('/')
  }, [isLoading, currentAccount, router])

  // al successo, salva su Sanity
  useEffect(() => {
    if (!isSuccess || !awaitedHash) return
    const to = receipt?.to || ''
    const from = currentAccount || ''
    // NB: se vuoi l'importo preciso, conservalo in una ref prima di resettare formData
    saveTransaction(awaitedHash, formData.amount, from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, awaitedHash])

  return (
    <TransactionContext.Provider
      value={{
        currentAccount,
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

// Default export (così qualsiasi import funziona)
export default TransactionProvider
