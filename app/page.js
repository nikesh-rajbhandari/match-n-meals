import Image from 'next/image';
import { PRICE, DEPOSIT, OPEN_HOUR, CLOSE_HOUR, fmtHour, rs } from '@/lib/config';
import Booker from './book/Booker';

export default function Home() {
  return (
    <>
      <section className="hero">
        {/* Placeholder stock photos (sources and licences in public/courts/SOURCES.txt); swap for real venue shots.
            CSS shows the one matching the court picked in the booker. */}
        <div className="hero-bg" aria-hidden="true">
          <Image src="/courts/pickleball-court.jpg" alt="" data-court="pickleball" fill sizes="100vw" priority />
          <Image src="/courts/basketball-grey.jpg" alt="" data-court="basketball" fill sizes="100vw" />
        </div>
        <div className="hero-inner">
          <div className="hero-copy">
            <h1>Your court, <em>booked</em> in a minute.</h1>
            <p className="lead">Pickleball and basketball, open every day from {fmtHour(OPEN_HOUR)} to {fmtHour(CLOSE_HOUR)}.</p>
            <p className="hours-pill">{PRICE.pickleball}. {rs(DEPOSIT)} deposit to confirm.</p>
          </div>
          <div className="panel hero-panel" id="book"><Booker /></div>
        </div>
      </section>

      <section className="section how">
        <h2>How Booking Works</h2>
        <ol>
          <li><strong>Request a slot.</strong> Choose a court, day and hour above. We hold it for you.</li>
          <li><strong>Pay the deposit.</strong> Scan our QR to pay {rs(DEPOSIT)} and send the screenshot on WhatsApp.</li>
          <li><strong>Play.</strong> We confirm your slot. Pay the rest at the counter.</li>
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
