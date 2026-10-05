'use client';

// Submit button that asks first, for destructive server actions (reject / cancel).
export default function ConfirmButton({ message, children, ...props }) {
  return <button {...props} onClick={(e) => !confirm(message) && e.preventDefault()}>{children}</button>;
}
