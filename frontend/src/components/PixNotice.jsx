import React from 'react';

// 📱 Como o PIX é conferido (checkout, tela do QR Code e Meus Pedidos)
function PixNotice({ orderId }) {
  const code = orderId ? `EMP${orderId}` : 'EMP + número do pedido';
  return (
    <div className="pix-notice">
      <strong>🔎 Como funciona o pagamento por PIX</strong>
      <ol>
        <li>Pague pelo <b>QR Code</b> ou pelo <b>Copia e Cola</b>: o valor e a identificação do pedido (<b>{code}</b>) já vêm preenchidos. Não precisa digitar nada.</li>
        <li>Pague o <b>valor exato</b> e não apague a identificação. É ela que mostra que o pagamento é do seu pedido.</li>
        <li>Nossa equipe <b>confere o pagamento no banco</b> e libera seu pedido para preparo e entrega. Acompanhe em <b>"Meus Pedidos"</b>: o status muda de <b>Pendente</b> para <b>Preparando</b>.</li>
      </ol>
      <small>Vai pagar digitando a chave? Escreva <b>{code}</b> na descrição do PIX.</small>
    </div>
  );
}

export default PixNotice;
