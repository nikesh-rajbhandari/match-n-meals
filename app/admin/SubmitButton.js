'use client';
import { useFormStatus } from 'react-dom';

// Submit button that says what it's doing while the server action runs (a waking database can take a few seconds),
// and can't be sent twice meanwhile.
export default function SubmitButton({ pendingLabel, disabled, children, ...props }) {
  const { pending } = useFormStatus();
  return <button {...props} disabled={pending || disabled}>{pending ? pendingLabel : children}</button>;
}
