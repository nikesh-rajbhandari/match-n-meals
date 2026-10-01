import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'Match & Meals — Courts & Kitchen',
  description: 'Pickleball, basketball and great food under one roof.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="nav">
          <Link href="/" className="logo">Match <span>&amp;</span> Meals</Link>
          <nav>
            <Link href="/#courts">Courts</Link>
            <Link href="/#menu">Menu</Link>
            <Link href="/#visit">Visit</Link>
            <Link href="/book" className="btn">Book a court</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="footer">© {new Date().getFullYear()} Match &amp; Meals</footer>
      </body>
    </html>
  );
}
