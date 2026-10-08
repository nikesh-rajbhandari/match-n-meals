import { stampFmt } from '@/lib/dates';

// A booking's activity log (schema.sql `activity`), oldest first, folded to one line until opened.
// Corrections (unconfirmed payments, undone refunds / no-shows, replaced discounts) are flagged so mistakes stand out.
export default function History({ entries }) {
  if (!entries.length) return null;
  const fixes = entries.filter((e) => e.correction).length;
  return (
    <details className="history">
      <summary>
        History <span className="muted">· {entries.length} {entries.length === 1 ? 'change' : 'changes'}</span>
        {fixes > 0 && <span className="fix-count"> · {fixes} {fixes === 1 ? 'correction' : 'corrections'}</span>}
      </summary>
      <ol>
        {entries.map((e) => (
          <li key={e.id} className={e.correction ? 'fix' : undefined}>
            <time dateTime={new Date(e.at).toISOString()}>{stampFmt.format(new Date(e.at))}</time>
            <span><b>{e.who ?? 'Customer'}</b> {e.text}{e.correction && <span className="fix-tag"> · Correction</span>}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
