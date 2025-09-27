import Head from 'next/head';
import dynamic from 'next/dynamic';

const GameCanvas = dynamic(() => import('../components/GameCanvas'), { ssr: false });

export default function HomePage() {
  return (
    <>
      <Head>
        <title>Canyon Curlers</title>
        <meta
          name="description"
          content="A deterministic turn-based car curling duel. Launch, collide, and outscore in a canyon arena."
        />
      </Head>
      <GameCanvas />
    </>
  );
}
