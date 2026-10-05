import Link from 'next/link';
import { COURTS, PRICE, OPEN_HOUR, CLOSE_HOUR, fmtHour } from '@/lib/config';
import Booker from './book/Booker';
import Icon from './Icon';

const blurb = {
  pickleball: 'Regulation court. Paddles and balls available to rent at the counter.',
  basketball: 'Full court with night lighting. Bring your squad.',
};

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>Your court, <em>booked</em> in a minute.</h1>
          <p className="lead">Pickleball and basketball, open every day from {fmtHour(OPEN_HOUR)} to {fmtHour(CLOSE_HOUR)}.</p>
          <p className="hours-pill">{PRICE.pickleball}. Pay at the counter.</p>
        </div>
        <div className="panel hero-panel" id="book"><Booker /></div>
      </section>

      <section id="courts" className="section">
        <h2>The Courts</h2>
        <div className="courts">
          {Object.entries(COURTS).map(([k, label]) => (
            <Link key={k} href={`/book?court=${k}`} className={`court court-${k}`}>
              <img src={`/icons/${k}.webp`} alt="" width="120" height="120" loading="lazy" />
              <div>
                <h3><Icon name={k} /> {label}</h3>
                <p>{blurb[k]}</p>
                <span className="court-meta">{PRICE[k]} <span className="arrow">Book {label} <span aria-hidden="true">→</span></span></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section how">
        <h2>How Booking Works</h2>
        <ol>
          <li><strong>Pick a slot.</strong> Choose a court, day and hour above.</li>
          <li><strong>Get a call.</strong> You’ll get a call back to confirm the slot.</li>
          <li><strong>Play.</strong> Turn up and pay at the counter.</li>
        </ol>
      </section>

      <section id="visit" className="section visit">
        <div>
          <h2>Hours</h2>
          <p className="big-num">{fmtHour(OPEN_HOUR)} - {fmtHour(CLOSE_HOUR)}</p>
          <p className="muted">Every day, including holidays.</p>
        </div>
        <div>
          <h2>Find Us</h2>
          {/* TODO: real address, phone and email */}
          <p>Your address here</p>
          <p><a href="tel:+9770000000000">+977-0000000000</a></p>
          <p><a href="mailto:hello@matchnmeals.com">hello@matchnmeals.com</a></p>
        </div>
      </section>
    </>
  );
}
