import './globals.css';

export const metadata = {
  title: 'Ultimate Car River — Game Codex',
  description:
    'Deterministic multiplayer curling/pétanque inspired ruleset for Ultimate Car River, ready for instant-play hosting on the web.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
