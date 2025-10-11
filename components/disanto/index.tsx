import type { NextPage } from 'next'
import Head from 'next/head'
import Header from '../components/Header'
import Main from '../components/Main'

const Home: NextPage = () => {  

  return (
    <div className="min-h-screen flex flex-col text-white">
      <Head>
        <title>Bullscope Swap</title>
        <link rel="shortcut icon" href="/favicon.ico" />
      </Head>

      <Header />

      {/* se vuoi il “bubblegum” che occupi più viewport, il body lo ha già  */}
      <main className="flex-1 flex justify-center items-start mt-10">
        <Main />
      </main>
    </div>
  )
}

export default Home
