import React, { useEffect, useRef, useState } from 'react';
import { DIALOG_EVENT } from '../utils/dialog';
import './DialogHost.css';

// Mostra as confirmações e avisos pedidos por confirmDialog() / notify()
function DialogHost() {
  const [confirm, setConfirm] = useState(null);
  const [notes, setNotes] = useState([]);
  const nextId = useRef(1);

  useEffect(() => {
    const onEvent = (e) => {
      const d = e.detail;
      if (d.kind === 'confirm') {
        setConfirm(d);
      } else {
        const id = nextId.current++;
        setNotes(list => [...list, { id, message: d.message, type: d.type }]);
        setTimeout(() => setNotes(list => list.filter(n => n.id !== id)), 4000);
      }
    };
    window.addEventListener(DIALOG_EVENT, onEvent);
    return () => window.removeEventListener(DIALOG_EVENT, onEvent);
  }, []);

  useEffect(() => {
    if (!confirm) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') answer(false);
      if (e.key === 'Enter') answer(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const answer = (ok) => {
    confirm.resolve(ok);
    setConfirm(null);
  };

  return (
    <>
      {confirm && (
        <div className="dlg-overlay" onClick={() => answer(false)}>
          <div className="dlg-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <p>{confirm.message}</p>
            <div className="dlg-actions">
              <button className="dlg-cancel" onClick={() => answer(false)}>{confirm.cancelText}</button>
              <button className={`dlg-ok ${confirm.danger ? 'danger' : ''}`} onClick={() => answer(true)} autoFocus>
                {confirm.okText}
              </button>
            </div>
          </div>
        </div>
      )}
      {notes.length > 0 && (
        <div className="dlg-notes">
          {notes.map(n => <div key={n.id} className={`dlg-note ${n.type}`}>{n.message}</div>)}
        </div>
      )}
    </>
  );
}

export default DialogHost;
