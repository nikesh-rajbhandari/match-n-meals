import Link from 'next/link';
import { PRICE, OPEN_HOUR, CLOSE_HOUR, fmtHour } from '@/lib/config';

// Draft menu, hidden until final. To show it again, render it in the #menu section.
const menu = [
  ['Courtside Burger', 'Smash patty, cheddar, house pickles', 'Rs 650'],
  ['Chicken Momo', 'Steamed, with tomato-sesame achar', 'Rs 380'],
  ['Loaded Fries', 'Cheese sauce, jalapeño, spring onion', 'Rs 420'],
  ['Grilled Chicken Bowl', 'Rice, greens, chimichurri', 'Rs 720'],
  ['Fresh Lime Soda', 'Sweet, salted or mixed', 'Rs 180'],
  ['Cold Coffee', 'Double shot, vanilla ice cream', 'Rs 280'],
];

// Material Symbols Rounded (Apache 2.0), tinted via CSS mask
const Icon = ({ name, color }) => (
  <i className="ico" style={{ '--i': `url(/icons/${name}.svg)`, '--c': `var(--${color})` }} aria-hidden="true" />
);

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Play hard.<br />Eat well.</h1>
        <p>Pickleball and basketball courts, with a kitchen opening soon just off the sideline.</p>
        <div className="row">
          <Link href="/book" className="btn big">Book a court</Link>
          <Link href="/#menu" className="btn ghost big">Kitchen — coming soon</Link>
        </div>
      </section>

      <section id="courts" className="section">
        <h2>Our courts</h2>
        <div className="grid">
          <Link href="/book?court=pickleball" className="card card-link">
            <h3><Icon name="pickleball" color="accent" /> Pickleball</h3>
            <p>Regulation court, paddles and balls available to rent.</p>
            <strong>{PRICE.pickleball}</strong>
            <span className="cta">Book now →</span>
          </Link>
          <Link href="/book?court=basketball" className="card card-link">
            <h3><Icon name="sports_basketball" color="brand" /> Basketball</h3>
            <p>Full court with night lighting. Bring your squad.</p>
            <strong>{PRICE.basketball}</strong>
            <span className="cta">Book now →</span>
          </Link>
        </div>
      </section>

      <section id="menu" className="section">
        <h2>The kitchen</h2>
        <div className="card soon">
          <div className="bounce">
            {['burger', 'pickleball', 'basketball'].map((n) => (
              <img key={n} src={`/icons/${n}.webp`} alt="" width="72" height="72" />
            ))}
          </div>
          <span className="badge">Coming soon</span>
          <h3>Food &amp; drinks, courtside</h3>
          <p>Our kitchen is getting ready. Burgers, momos, fresh drinks and more — opening soon.</p>
        </div>
      </section>

      <section id="visit" className="section">
        <h2>Visit us</h2>
        <div className="grid">
          <div className="card">
            <h3>Hours</h3>
            <p>Every day, {fmtHour(OPEN_HOUR)} – {fmtHour(CLOSE_HOUR)}</p>
          </div>
          <div className="card">
            <h3>Contact</h3>
            <p>📍 Your address here<br />📞 +977-0000000000<br />✉️ hello@matchnmeals.com</p>
          </div>
        </div>
      </section>
    </>
  );
}
