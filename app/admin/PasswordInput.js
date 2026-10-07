'use client';
import { useState } from 'react';

// Password field with a show/hide toggle. The toggle sits outside the <label> so it isn't read as part of the field's name.
export default function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input {...props} type={show ? 'text' : 'password'} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button type="button" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow(!show)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {show && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  );
}
