// 💬 Confirmação e avisos dentro do app (no lugar das janelinhas do navegador)
// Uso: if (!(await confirmDialog('Cancelar o pedido #12?'))) return;   ·   notify('✅ Salvo!')
const EVENT = 'emporio-dialog';

export const confirmDialog = (message, { okText = 'Confirmar', cancelText = 'Voltar', danger = false } = {}) =>
  new Promise(resolve => {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { kind: 'confirm', message, okText, cancelText, danger, resolve } }));
  });

export const notify = (message, type = 'success') => {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { kind: 'notify', message, type } }));
};

export const DIALOG_EVENT = EVENT;
