import { useEffect, useId, useRef } from 'react';

// Нативный dialog удерживает фокус, поддерживает Escape и клавиатуру.
export function Modal({ title, onClose, children, className = '' }) {
  const reference = useRef(null);
  const heading = useId();
  useEffect(() => {
    const dialog = reference.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={reference}
      className={`club-dialog ${className}`}
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="dialog-heading">
        <h2 id={heading}>{title}</h2>
        <button type="button" className="round-button" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
