import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { gerarPixCopiaECola, PIX_CONFIG } from '../utils/pix';
import './Checkout.css';

const Checkout = ({ cart, total, onClose, onSuccess }) => {
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('dinheiro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [orderTotal, setOrderTotal] = useState(null);
  const [pixCode, setPixCode] = useState('');
  const [copied, setCopied] = useState(false);

  const token = localStorage.getItem('authToken');

  const createOrder = async () => {
    const response = await fetch('http://localhost:3001/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        items: cart.map(item => ({
          product_id: item.id,
          quantity: item.quantity
        })),
        delivery_address: deliveryAddress,
        payment_method: paymentMethod
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao criar pedido');
    }

    return data;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!deliveryAddress.trim()) {
      setError('Digite o endereço de entrega');
      return;
    }

    setLoading(true);

    try {
      const data = await createOrder();
      const finalTotal = parseFloat(data.order?.total ?? total);

      setOrderId(data.id);
      setOrderTotal(finalTotal);

      if (paymentMethod === 'pix') {
        // PIX: mostra o QR e espera o cliente fechar
        setPixCode(gerarPixCopiaECola({ valor: finalTotal, txid: `EMP${data.id}` }));
        setSuccess(true);
      } else {
        // Dinheiro / cartão: fecha sozinho
        setSuccess(true);
        setTimeout(() => onSuccess(), 2500);
      }
    } catch (err) {
      setError(err.message);
      console.error('Erro ao criar pedido:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyPixCode = async () => {
    try {
      await navigator.clipboard.writeText(pixCode);
    } catch {
      // Plano B para navegadores antigos
      const textarea = document.createElement('textarea');
      textarea.value = pixCode;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // ✅ TELA DE SUCESSO
  if (success) {
    return (
      <div className="checkout-modal">
        <div className="checkout-content">
          <div className="success-message">
            <h2>✅ Pedido #{orderId} Criado!</h2>

            {paymentMethod === 'pix' && (
              <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <p style={{ fontSize: '16px', fontWeight: 700 }}>
                  📱 Pague R$ {orderTotal?.toFixed(2)} com PIX
                </p>

                <div style={{
                  display: 'inline-block',
                  padding: '14px',
                  background: '#fff',
                  border: '2px solid #e0e0e0',
                  borderRadius: '12px',
                  margin: '10px 0'
                }}>
                  <QRCodeSVG value={pixCode} size={220} />
                </div>

                <p style={{ fontSize: '13px', color: '#666', margin: '6px 0 12px' }}>
                  Abra o app do seu banco → PIX → Ler QR Code
                </p>

                <button
                  type="button"
                  onClick={copyPixCode}
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: copied ? '#22c55e' : '#C41E3A',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginBottom: '10px'
                  }}
                >
                  {copied ? '✅ Código copiado!' : '📋 Copiar código PIX (Copia e Cola)'}
                </button>

                <p style={{ fontSize: '12px', color: '#888', margin: '4px 0' }}>
                  Chave PIX (CNPJ): <strong>{PIX_CONFIG.keyDisplay}</strong>
                </p>
                <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 14px' }}>
                  Seu pedido será separado assim que confirmarmos o pagamento.
                </p>

                <button
                  type="button"
                  onClick={onSuccess}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#fff',
                    color: '#333',
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  ✅ Já paguei / Fechar
                </button>
              </div>
            )}

            {paymentMethod === 'cartao' && <p>💳 Levaremos a maquininha na entrega</p>}
            {paymentMethod === 'dinheiro' && <p>💵 Pagamento em dinheiro na entrega</p>}
            {paymentMethod !== 'pix' && <p>Você pode acompanhar o status em "Meus Pedidos"</p>}
          </div>
        </div>
      </div>
    );
  }

  // 🛒 TELA DO CHECKOUT
  return (
    <div className="checkout-modal">
      <div className="checkout-content">
        <button className="close-btn" onClick={onClose}>×</button>

        <h2>Finalizar Pedido</h2>

        <div className="checkout-summary">
          <h3>📦 Resumo do Carrinho</h3>
          <div className="order-items">
            {cart.map(item => (
              <div key={item.id} className="order-item">
                <span>{item.name} x{item.quantity}</span>
                <span>R$ {(parseFloat(item.price) * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="order-total">
            <strong>Total: R$ {parseFloat(total).toFixed(2)}</strong>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>📍 Endereço de Entrega:</label>
            <input
              type="text"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="Digite seu endereço completo"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>💳 Método de Pagamento:</label>
            <div className="payment-methods">
              <label className="payment-option">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="pix"
                  checked={paymentMethod === 'pix'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={loading}
                />
                <span>📱 PIX (pague agora pelo app do banco)</span>
              </label>
              <label className="payment-option">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="dinheiro"
                  checked={paymentMethod === 'dinheiro'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={loading}
                />
                <span>💵 Dinheiro (na entrega)</span>
              </label>
              <label className="payment-option">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="cartao"
                  checked={paymentMethod === 'cartao'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  disabled={loading}
                />
                <span>💳 Cartão de Crédito/Débito (na entrega)</span>
              </label>
            </div>
          </div>

          {paymentMethod === 'pix' && (
            <div className="card-message">
              <p>📱 Após confirmar, vamos mostrar o QR Code e o código Copia e Cola com o valor do pedido.</p>
            </div>
          )}

          {paymentMethod === 'cartao' && (
            <div className="card-message">
              <p>💳 Levaremos a maquininha de cartão na entrega!</p>
              <p>Você pode pagar com débito ou crédito quando receber seu pedido.</p>
            </div>
          )}

          {error && <div className="error-message">❌ {error}</div>}

          <button type="submit" disabled={loading || cart.length === 0}>
            {loading ? '⏳ Processando...' : '✅ Confirmar Pedido'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Checkout;