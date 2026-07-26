import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Inter, Space_Mono } from 'next/font/google';
import './globals.css';
import { getCurrentUser } from '@/lib/auth';
import { Header } from '@/components/Header';

const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const mono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Feira de Trocas — COTEMIG',
  description: 'Economia de fichas da Feira de Trocas do COTEMIG.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#5fa838',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    /* banco fora do ar */
  }

  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <div className="app-shell">
          {user && <Header user={user} />}
          {children}
        </div>
      </body>
    </html>
  );
}
