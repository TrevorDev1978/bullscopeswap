import type { NextPage } from 'next'
import Head from 'next/head'
import Header from '../components/Header'
import LimitTab from '../components/LimitTab'

const LimitPage: NextPage = () => {
  return (
    <div className="min-h-screen flex flex-col text-white">
      <Head>
        <title>Bullscope — Limit Orders</title>
        <link rel="shortcut icon" href="/favicon.ico" />
      </Head>
      <Header />
      <main className="flex-1 flex justify-center items-start mt-10">
        <LimitTab />
      </main>
    </div>
  )
}
export default LimitPage