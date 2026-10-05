import Link from 'next/link';
import { Geist } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

const geist = Geist({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'Match & Meals | Court Booking',
  description: 'Book pickleball and basketball courts, open every day 6 AM to 9 PM.',
};

// matches --bg in globals.css
export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0c100f' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={geist.className}>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        <header className="nav">
          <Link href="/" className="logo" translate="no">Match <span>&amp;</span> Meals</Link>
          <nav aria-label="Main">
            <Link href="/#courts">Courts</Link>
            <Link href="/#visit">Hours</Link>
            <Link href="/#book" className="btn">Book a Court</Link>
          </nav>
        </header>
        <main id="main">{children}</main>
        <SpeedInsights />
        <footer className="footer">© {new Date().getFullYear()} <span translate="no">Match &amp; Meals</span></footer>
      </body>
    </html>
  );
}
