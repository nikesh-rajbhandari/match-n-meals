'use client';
import { useId, useRef } from 'react';

// A button that opens `children` in the shared .popup dialog (native <dialog>: Esc, focus trap, backdrop for free).
// The children are server-rendered forms; submitting redirects, which remounts the page and so closes the dialog.
export default function Popup({ label, title, className, children }) {
  const dialog = useRef(null);
  const id = useId();
  return (
    <>
      <button type="button" className={className} onClick={() => dialog.current.showModal()}>{label}</button>
      {/* a click on the backdrop lands on the <dialog> itself (the body fills it), so that closes it too */}
      <dialog ref={dialog} className="popup" aria-labelledby={id} onClick={(e) => e.target === dialog.current && dialog.current.close()}>
        <div className="popup-body admin-pop">
          <h2 id={id}>{title}</h2>
          {children}
          <form method="dialog"><button className="btn ghost">Cancel</button></form>
        </div>
      </dialog>
    </>
  );
}
