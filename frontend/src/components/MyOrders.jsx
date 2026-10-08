import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { QRCodeSVG } from 'qrcode.react';
import { gerarPixCopiaECola, PIX_CONFIG } from '../utils/pix';
import './MyOrders.css';

const MyOrders = ({ user }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pixOrder, setPixOrder] = useState(null);
  const [copied, setCopied] = useState(false);


  useEffect(() => {
    fetchMyOrders();
  }, []);

  // Tecla ESC fecha a janela do PIX
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setPixOrder(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fetchMyOrders = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/orders/my-orders`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Erro ao buscar pedidos');
      const data = await response.json();
      setOrders(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pendente': return '#fbbf24';
      case 'Preparando': return '#60a5fa';
      case 'Saído': return '#8b5cf6';
      case 'Entregue': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Pendente': return '⏳';
      case 'Preparando': return '👨‍🍳';
      case 'Saído': return '🚗';
      case 'Entregue': return '✅';
      default: return '📦';
    }
  };

  const getPaymentInfo = (method) => {
    switch (method) {
      case 'pix':
        return { icon: '📱', label: 'PIX', bg: '#e0f2fe', color: '#075985' };
      case 'cartao':
        return { icon: '💳', label: 'Cartão na entrega', bg: '#ede9fe', color: '#5b21b6' };
      default:
        return { icon: '💵', label: 'Dinheiro na entrega', bg: '#dcfce7', color: '#166534' };
    }
  };

  const pixCode = pixOrder
    ? gerarPixCopiaECola({ valor: parseFloat(pixOrder.total), txid: `EMP${pixOrder.id}` })
    : '';

  const copyPixCode = async () => {
    try {
      await navigator.clipboard.writeText(pixCode);
    } catch {
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

  const openPix = (order) => {
    setCopied(false);
    setPixOrder(order);
  };

  if (loading) return <div className="my-orders-loading">Carregando seus pedidos...</div>;

  return (
    <div className="my-orders">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h2>📦 Meus Pedidos</h2>
        <button
          onClick={fetchMyOrders}
          style={{
            padding: '8px 14px',
            background: '#fff',
            border: '2px solid #e0e0e0',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          🔄 Atualizar
        </button>
      </div>

      {error && <div className="my-orders-error">{error}</div>}

      {orders.length === 0 ? (
        <div className="empty-orders">
          <p>Você ainda não fez nenhum pedido</p>
          <p className="empty-orders-sub">Que tal começar a comprar?</p>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map(order => {
            const payment = getPaymentInfo(order.payment_method);
            const canPayPix = order.payment_method === 'pix' && order.status === 'Pendente';

            return (
              <div key={order.id} className="order-card">
                <div className="order-header">
                  <h3>Pedido #{order.id}</h3>
                  <span
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(order.status) }}
                  >
                    {getStatusIcon(order.status)} {order.status}
                  </span>
                </div>

                <div className="order-info">
                  <p><strong>Data:</strong> {new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
                  <p><strong>Endereço:</strong> {order.delivery_address}</p>
                  <p><strong>Total:</strong> R$ {parseFloat(order.total).toFixed(2)}</p>
                  <p>
                    <strong>Pagamento:</strong>{' '}
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: payment.bg,
                      color: payment.color
                    }}>
                      {payment.icon} {payment.label}
                    </span>
                  </p>
                </div>

                {canPayPix && (
                  <button
                    onClick={() => openPix(order)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      margin: '6px 0 12px',
                      background: 'linear-gradient(135deg, #C41E3A 0%, #a01830 100%)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '15px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    📱 Pagar com PIX — R$ {parseFloat(order.total).toFixed(2)}
                  </button>
                )}

                <div className="order-timeline">
                  <div className={`timeline-step ${order.status !== 'Pendente' ? 'completed' : 'active'}`}>
                    <div className="timeline-dot">1</div>
                    <p>Pedido</p>
                  </div>
                  <div className={`timeline-step ${['Preparando', 'Saído', 'Entregue'].includes(order.status) ? 'completed' : ''} ${order.status === 'Preparando' ? 'active' : ''}`}>
                    <div className="timeline-dot">2</div>
                    <p>Preparando</p>
                  </div>
                  <div className={`timeline-step ${['Saído', 'Entregue'].includes(order.status) ? 'completed' : ''} ${order.status === 'Saído' ? 'active' : ''}`}>
                    <div className="timeline-dot">3</div>
                    <p>Saído</p>
                  </div>
                  <div className={`timeline-step ${order.status === 'Entregue' ? 'completed' : ''}`}>
                    <div className="timeline-dot">4</div>
                    <p>Entregue</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 📱 JANELA DO PIX */}
      {pixOrder && (
        <div
          onClick={() => setPixOrder(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '400px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '20px',
              textAlign: 'center',
              position: 'relative',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}
          >
            <button
              onClick={() => setPixOrder(null)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '34px',
                height: '34px',
                border: 'none',
                borderRadius: '50%',
                background: '#f0f0f0',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <h3 style={{ margin: '0 0 6px' }}>📱 Pagar Pedido #{pixOrder.id}</h3>
            <p style={{ fontSize: '18px', fontWeight: 800, color: '#C41E3A', margin: '0 0 10px' }}>
              R$ {parseFloat(pixOrder.total).toFixed(2)}
            </p>

            <div style={{
              display: 'inline-block',
              padding: '14px',
              background: '#fff',
              border: '2px solid #e0e0e0',
              borderRadius: '12px'
            }}>
              <QRCodeSVG value={pixCode} size={220} />
            </div>

            <p style={{ fontSize: '13px', color: '#666', margin: '10px 0 12px' }}>
              Abra o app do seu banco → PIX → Ler QR Code
            </p>

            <button
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
            <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0' }}>
              Seu pedido será separado assim que confirmarmos o pagamento.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyOrders;