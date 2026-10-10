import React, { useState, useEffect, useContext } from 'react';
import { API_URL } from '../config';
import { AuthContext } from '../AuthContext';
import { formatQty, lineTotal } from '../utils/units';
import { QRCodeSVG } from 'qrcode.react';
import { gerarPixCopiaECola, PIX_CONFIG } from '../utils/pix';
import './Checkout.css';

const OTHER = '__outro';

// Compara bairros sem acento/maiúscula ("Enéas" = "eneas")
const normalize = (s) => (s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim().replace(/\s+/g, ' ');

const Checkout = ({ cart, total, onClose, onSuccess }) => {
  const { user } = useContext(AuthContext);
  const [deliveryAddress, setDeliveryAddress] = useState(user?.address || '');
  const [fees, setFees] = useState([]);
  const [defaultFee, setDefaultFee] = useState(0);
  const [neighborhood, setNeighborhood] = useState('');
  const [otherNeighborhood, setOtherNeighborhood] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('dinheiro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [orderTotal, setOrderTotal] = useState(null);
  const [pixCode, setPixCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [needChange, setNeedChange] = useState(null); // null = não respondeu | false = trocado | true = precisa de troco
  const [changeFor, setChangeFor] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null); // { code, discount }
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  const token = localStorage.getItem('authToken');

  // 🛵 Carrega as taxas e já seleciona o bairro do cadastro do cliente
  useEffect(() => {
    fetch(`${API_URL}/delivery-fees`)
      .then(res => res.json())
      .then(data => {
        setFees(data.fees || []);
        setDefaultFee(parseFloat(data.default_fee) || 0);
        const match = (data.fees || []).find(f => normalize(f.neighborhood) === normalize(user?.neighborhood));
        if (match) {
          setNeighborhood(match.neighborhood);
        } else if (user?.neighborhood && user.neighborhood !== '-') {
          setNeighborhood(OTHER);
          setOtherNeighborhood(user.neighborhood);
        }
      })
      .catch(err => console.error('Erro ao buscar taxas:', err));
  }, [user]);

  const selectedNeighborhood = neighborhood === OTHER ? otherNeighborhood.trim() : neighborhood;
  const selectedFee = fees.find(f => f.neighborhood === neighborhood);
  const deliveryFee = !neighborhood ? 0 : selectedFee ? parseFloat(selectedFee.fee) : defaultFee;
  const discount = coupon ? coupon.discount : 0;
  const finalTotalPreview = Math.round((parseFloat(total) - discount + deliveryFee) * 100) / 100;
  const changeValue = parseFloat(String(changeFor).replace(',', '.')) || 0;

  // 🎟️ Confere o cupom (o servidor confere de novo ao criar o pedido)
  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const response = await fetch(`${API_URL}/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code: couponInput, subtotal: total })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Cupom inválido');
      setCoupon(data);
    } catch (err) {
      setCoupon(null);
      setCouponError(err.message);
    } finally {
      setCouponLoading(false);
    }
  };

  const createOrder = async () => {
    const response = await fetch(`${API_URL}/orders`, {
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
        delivery_neighborhood: selectedNeighborhood,
        payment_method: paymentMethod,
        coupon_code: coupon ? coupon.code : undefined,
        change_for: paymentMethod === 'dinheiro' && needChange ? changeValue : undefined
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

    if (!selectedNeighborhood) {
      setError('Escolha o bairro da entrega');
      return;
    }

    if (paymentMethod === 'dinheiro') {
      if (needChange === null) {
        setError('Diga se você precisa de troco');
        return;
      }
      if (needChange && changeValue <= finalTotalPreview) {
        setError(`Informe para quanto é o troco (maior que R$ ${finalTotalPreview.toFixed(2)})`);
        return;
      }
    }

    setLoading(true);

    try {
      const data = await createOrder();
      const finalTotal = parseFloat(data.order?.total ?? finalTotalPreview);

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
            {paymentMethod === 'dinheiro' && (
              <p>
                💵 Pagamento em dinheiro na entrega
                {needChange ? ` — levaremos troco para R$ ${changeValue.toFixed(2)} (troco de R$ ${(changeValue - orderTotal).toFixed(2)})` : ' — valor certinho, sem troco'}
              </p>
            )}
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
                <span>{formatQty(item.quantity, item.unit)} {item.name}</span>
                <span>R$ {lineTotal(item).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="order-item">
            <span>Subtotal</span>
            <span>R$ {parseFloat(total).toFixed(2)}</span>
          </div>
          {coupon && (
            <div className="order-item discount">
              <span>🎟️ Cupom {coupon.code}</span>
              <span>− R$ {discount.toFixed(2)}</span>
            </div>
          )}
          <div className="order-item">
            <span>🛵 Taxa de entrega{neighborhood ? '' : ' (escolha o bairro)'}</span>
            <span>R$ {deliveryFee.toFixed(2)}</span>
          </div>
          <div className="order-total">
            <strong>Total: R$ {finalTotalPreview.toFixed(2)}</strong>
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
            <label>🏘️ Bairro:</label>
            <select
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              disabled={loading}
            >
              <option value="">Selecione o bairro</option>
              {fees.map(f => (
                <option key={f.id} value={f.neighborhood}>
                  {f.neighborhood} — R$ {parseFloat(f.fee).toFixed(2)}
                </option>
              ))}
              <option value={OTHER}>Outro bairro — R$ {defaultFee.toFixed(2)}</option>
            </select>
            {neighborhood === OTHER && (
              <input
                type="text"
                value={otherNeighborhood}
                onChange={(e) => setOtherNeighborhood(e.target.value)}
                placeholder="Digite o nome do seu bairro"
                disabled={loading}
                style={{ marginTop: '8px' }}
              />
            )}
          </div>

          <div className="form-group">
            <label>🎟️ Cupom de desconto:</label>
            {coupon ? (
              <div className="coupon-applied">
                <span>✅ <strong>{coupon.code}</strong> — você economiza R$ {discount.toFixed(2)}</span>
                <button type="button" onClick={() => { setCoupon(null); setCouponInput(''); }} disabled={loading}>Remover</button>
              </div>
            ) : (
              <div className="coupon-row">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } }}
                  placeholder="Tem um cupom? Digite aqui"
                  disabled={loading || couponLoading}
                />
                <button type="button" onClick={applyCoupon} disabled={loading || couponLoading || !couponInput.trim()}>
                  {couponLoading ? '...' : 'Aplicar'}
                </button>
              </div>
            )}
            {couponError && <small className="coupon-error">❌ {couponError}</small>}
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

          {paymentMethod === 'dinheiro' && (
            <div className="change-box">
              <p className="change-title">💵 Vai precisar de troco?</p>
              <div className="change-options">
                <button
                  type="button"
                  className={needChange === false ? 'active' : ''}
                  onClick={() => setNeedChange(false)}
                  disabled={loading}
                >
                  Não, tenho trocado
                </button>
                <button
                  type="button"
                  className={needChange === true ? 'active' : ''}
                  onClick={() => setNeedChange(true)}
                  disabled={loading}
                >
                  Sim, preciso de troco
                </button>
              </div>
              {needChange && (
                <div className="change-for">
                  <label>Troco para quanto?</label>
                  <div className="change-input">
                    <span>R$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="Ex: 100"
                      value={changeFor}
                      onChange={(e) => setChangeFor(e.target.value)}
                      disabled={loading}
                      autoFocus
                    />
                  </div>
                  <div className="change-quick">
                    {[20, 50, 100, 200].filter(v => v > finalTotalPreview).map(v => (
                      <button type="button" key={v} onClick={() => setChangeFor(String(v))} disabled={loading}>
                        R$ {v}
                      </button>
                    ))}
                  </div>
                  {changeValue > finalTotalPreview && (
                    <small>Seu troco será de <strong>R$ {(changeValue - finalTotalPreview).toFixed(2)}</strong></small>
                  )}
                </div>
              )}
            </div>
          )}

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
            {loading ? '⏳ Processando...' : `✅ Confirmar Pedido — R$ ${finalTotalPreview.toFixed(2)}`}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Checkout;