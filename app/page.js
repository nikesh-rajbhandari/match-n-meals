import Link from 'next/link';
import { PRICE, OPEN_HOUR, CLOSE_HOUR, fmtHour } from '@/lib/config';

const menu = [
  ['Courtside Burger', 'Smash patty, cheddar, house pickles', 'Rs 650'],
  ['Chicken Momo', 'Steamed, with tomato-sesame achar', 'Rs 380'],
  ['Loaded Fries', 'Cheese sauce, jalapeño, spring onion', 'Rs 420'],
  ['Grilled Chicken Bowl', 'Rice, greens, chimichurri', 'Rs 720'],
  ['Fresh Lime Soda', 'Sweet, salted or mixed', 'Rs 180'],
  ['Cold Coffee', 'Double shot, vanilla ice cream', 'Rs 280'],
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Play hard.<br />Eat well.</h1>
        <p>Pickleball and basketball courts with a full kitchen just off the sideline.</p>
        <div className="row">
          <Link href="/book" className="btn big">Book a court</Link>
          <Link href="/#menu" className="btn ghost big">See the menu</Link>
        </div>
      </section>

      <section id="courts" className="section">
        <h2>Our courts</h2>
        <div className="grid">
          <article className="card">
            <h3>🏓 Pickleball</h3>
            <p>Regulation court, paddles and balls available to rent.</p>
            <strong>{PRICE.pickleball}</strong>
          </article>
          <article className="card">
            <h3>🏀 Basketball</h3>
            <p>Full court with night lighting. Bring your squad.</p>
            <strong>{PRICE.basketball}</strong>
          </article>
        </div>
      </section>

      <section id="menu" className="section">
        <h2>The kitchen</h2>
        <ul className="menu">
          {menu.map(([name, desc, price]) => (
            <li key={name}>
              <div><b>{name}</b><small>{desc}</small></div>
              <span>{price}</span>
            </li>
          ))}
        </ul>
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
