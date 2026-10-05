'use client';
import { useEffect, useState } from 'react';

// Feedback after an admin action. Success fades after 5s; errors stay until closed.
// The message is dropped from the URL right away so a reload or Back doesn't show it again.
export default function Notice({ text, error }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.delete('msg'); url.searchParams.delete('err');
    history.replaceState(history.state, '', url);
    if (error) return;
    const id = setTimeout(() => setOpen(false), 5000);
    return () => clearTimeout(id);
  }, [error]);

  if (!open) return null;
  return (
    <div className={`notice${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}>
      <p>{text}</p>
      <button type="button" className="notice-close" aria-label="Dismiss message" onClick={() => setOpen(false)}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
