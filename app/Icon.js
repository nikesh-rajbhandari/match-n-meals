// Material Symbols Rounded (Apache 2.0), tinted via CSS mask so it follows the text color in both themes
const files = { pickleball: 'pickleball', basketball: 'sports_basketball' };

export default function Icon({ name }) {
  return <i className="ico" style={{ '--i': `url(/icons/${files[name]}.svg)` }} aria-hidden="true" />;
}
