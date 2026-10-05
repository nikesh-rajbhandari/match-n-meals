import Booker from './Booker';

export const metadata = { title: 'Book a Court | Match & Meals' };

export default function Book() {
  return (
    <section className="section narrow">
      <h1>Book a Court</h1>
      <p className="lead">Pick a court, day and hour. You’ll get a call to confirm.</p>
      <div className="panel"><Booker /></div>
    </section>
  );
}
