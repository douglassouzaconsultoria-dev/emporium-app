// 🖨️ Imprime o pedido no formato de cupom (impressora térmica 80mm ou folha comum)
import { formatQty } from './units';
import { API_URL } from '../config';

const PAYMENT = { pix: 'PIX', cartao: 'Cartão (levar maquininha)', dinheiro: 'Dinheiro' };

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (v) => `R$ ${parseFloat(v || 0).toFixed(2)}`;

const receiptHtml = (order) => {
  const items = (order.items || []).map(item => `
    <tr>
      <td>${esc(formatQty(item.quantity, item.unit))} ${esc(item.product_name)}</td>
      <td class="r">${money(parseFloat(item.price) * parseFloat(item.quantity))}</td>
    </tr>`).join('');

  const discount = parseFloat(order.discount) || 0;
  const fee = parseFloat(order.delivery_fee) || 0;
  const subtotal = (parseFloat(order.total) || 0) + discount - fee;
  const changeFor = parseFloat(order.change_for) || 0;

  let payment = PAYMENT[order.payment_method] || esc(order.payment_method);
  if (order.payment_method === 'dinheiro') {
    payment += changeFor > 0
      ? `<br><b>TROCO PARA ${money(changeFor)} (levar ${money(changeFor - parseFloat(order.total))})</b>`
      : '<br>Cliente tem trocado';
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>Pedido #${order.id}</title>
<style>
  @page { margin: 4mm; }
  body { font-family: 'Courier New', monospace; font-size: 13px; width: 72mm; margin: 0 auto; color: #000; }
  h1 { font-size: 18px; text-align: center; margin: 0; }
  h2 { font-size: 22px; text-align: center; margin: 6px 0; }
  .c { text-align: center; }
  .r { text-align: right; white-space: nowrap; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 2px 0; }
  .total td { font-size: 16px; font-weight: bold; }
</style></head><body>
  <h1>EMPÓRIO BRUMADO</h1>
  <div class="c">Delivery de Supermercado</div>
  <hr>
  <h2>PEDIDO #${order.id}</h2>
  <div class="c">${esc(new Date(order.created_at).toLocaleString('pt-BR'))}</div>
  <hr>
  <b>Cliente:</b> ${esc(order.name)}<br>
  <b>Telefone:</b> ${esc(order.phone_number)}<br>
  <b>Endereço:</b> ${esc(order.delivery_address || order.address)}<br>
  ${order.delivery_neighborhood ? `<b>Bairro:</b> ${esc(order.delivery_neighborhood)}<br>` : ''}
  ${order.motoboy_name ? `<b>Motoboy:</b> ${esc(order.motoboy_name)}<br>` : ''}
  ${order.notes ? `<hr><b>OBSERVAÇÃO:</b><br><b>${esc(order.notes)}</b><br>` : ''}
  <hr>
  <table>${items}</table>
  <hr>
  <table>
    <tr><td>Subtotal</td><td class="r">${money(subtotal)}</td></tr>
    ${discount > 0 ? `<tr><td>Desconto${order.coupon_code ? ` (${esc(order.coupon_code)})` : ''}</td><td class="r">- ${money(discount)}</td></tr>` : ''}
    <tr><td>Taxa de entrega</td><td class="r">${money(fee)}</td></tr>
    <tr class="total"><td>TOTAL</td><td class="r">${money(order.total)}</td></tr>
  </table>
  <hr>
  <b>Pagamento:</b> ${payment}
  <hr>
  <div class="c">Obrigado pela preferência!</div>
</body></html>`;
};

// Imprime por um iframe escondido (não abre aba nova)
export const printOrder = (order) => new Promise(resolve => {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(receiptHtml(order));
  doc.close();
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => {
      iframe.remove();
      resolve();
    }, 1000);
  }, 300);
});

// Busca o pedido completo (cliente + itens) e imprime
export const printOrderById = async (id) => {
  const response = await fetch(`${API_URL}/orders/${id}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
  });
  if (!response.ok) throw new Error('Erro ao buscar o pedido para imprimir');
  await printOrder(await response.json());
};

// Impressão automática: liga/desliga por computador (fica salvo neste navegador)
export const getAutoPrint = () => {
  try {
    return localStorage.getItem('autoPrint') === '1';
  } catch {
    return false;
  }
};

export const setAutoPrint = (on) => {
  try {
    localStorage.setItem('autoPrint', on ? '1' : '0');
  } catch {
    // sem armazenamento: não guarda a escolha
  }
};
