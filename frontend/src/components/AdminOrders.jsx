import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { formatQty } from '../utils/units';
import { printOrder, printOrderById } from '../utils/printOrder';
import './AdminOrders.css';

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [motoboys, setMotoboys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);
  const [savingMotoboy, setSavingMotoboy] = useState(false);

  const statuses = ['Pendente', 'Preparando', 'Saído', 'Entregue'];

  useEffect(() => {
    fetchOrders();
    fetchMotoboys();
    // 🔄 Atualiza a lista sozinha a cada 20 segundos
    const timer = setInterval(() => fetchOrders(true), 20000);
    return () => clearInterval(timer);
  }, []);

  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  });

  const fetchOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await fetch(`${API_URL}/orders`, {
        headers: getAuthHeaders()
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

  const fetchMotoboys = async () => {
    try {
      const response = await fetch(`${API_URL}/motoboys`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) return;
      const data = await response.json();
      setMotoboys(data.filter(m => m.active));
    } catch (err) {
      console.error('Erro ao buscar motoboys:', err);
    }
  };

  const openOrderDetails = async (order) => {
    try {
      const response = await fetch(`${API_URL}/orders/${order.id}`, {
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Erro ao buscar detalhes');
      const details = await response.json();
      setOrderDetails(details);
      setSelectedOrder(order);
    } catch (err) {
      alert('Erro ao carregar detalhes: ' + err.message);
    }
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setOrderDetails(null);
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const response = await fetch(`${API_URL}/orders/${orderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao atualizar status');

      setOrders(orders.map(order =>
        order.id === orderId ? { ...order, status: newStatus } : order
      ));

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
      if (orderDetails) {
        setOrderDetails({ ...orderDetails, status: newStatus });
      }
    } catch (err) {
      alert('Erro ao atualizar status: ' + err.message);
    }
  };

  // ❌ Cancelar: o backend devolve os itens ao estoque
  const cancelOrder = (order) => {
    if (window.confirm(`Cancelar o pedido #${order.id}? Os itens voltam para o estoque.`)) {
      updateOrderStatus(order.id, 'Cancelado');
    }
  };

  // 🛵 Escolher / remover motoboy
  const assignMotoboy = async (orderId, motoboyId) => {
    try {
      setSavingMotoboy(true);
      const response = await fetch(`${API_URL}/orders/${orderId}/motoboy`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ motoboy_id: motoboyId || null })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao definir motoboy');

      const moto = motoboys.find(m => m.id === parseInt(motoboyId));
      const motoboyName = moto ? moto.name : null;
      const newId = motoboyId ? parseInt(motoboyId) : null;

      setOrders(orders.map(order =>
        order.id === orderId ? { ...order, motoboy_id: newId, motoboy_name: motoboyName } : order
      ));

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, motoboy_id: newId, motoboy_name: motoboyName });
      }
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setSavingMotoboy(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pendente': return '#fbbf24';
      case 'Preparando': return '#60a5fa';
      case 'Saído': return '#8b5cf6';
      case 'Entregue': return '#10b981';
      case 'Cancelado': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getPaymentInfo = (method) => {
    switch (method) {
      case 'pix':
        return { icon: '📱', label: 'PIX', bg: '#e0f2fe', color: '#075985' };
      case 'cartao':
        return { icon: '💳', label: 'Cartão', bg: '#ede9fe', color: '#5b21b6' };
      default:
        return { icon: '💵', label: 'Dinheiro', bg: '#dcfce7', color: '#166534' };
    }
  };

  const PaymentBadge = ({ method }) => {
    const info = getPaymentInfo(method);
    return (
      <span style={{
        display: 'inline-block',
        padding: '4px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 700,
        background: info.bg,
        color: info.color,
        whiteSpace: 'nowrap'
      }}>
        {info.icon} {info.label}
      </span>
    );
  };

  const MotoboyCell = ({ order }) => {
    if (order.motoboy_name) {
      return <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>🛵 {order.motoboy_name}</span>;
    }
    if (order.status === 'Preparando') {
      return (
        <span style={{
          fontSize: '12px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
          background: '#fef3c7', color: '#92400e', whiteSpace: 'nowrap'
        }}>
          ⏳ Aguardando motoboy
        </span>
      );
    }
    return <span style={{ color: '#aaa' }}>—</span>;
  };

  const getDeliveryNote = (order) => {
    const total = parseFloat(order.total).toFixed(2);
    switch (order.payment_method) {
      case 'pix':
        return {
          bg: '#fffbeb',
          border: '#f59e0b',
          text: `⚠️ PIX: confira no app do Sicoob se caiu R$ ${total} antes de despachar. Procure pelo valor e horário (a identificação EMP${order.id} pode aparecer no extrato).`
        };
      case 'cartao':
        return {
          bg: '#f5f3ff',
          border: '#8b5cf6',
          text: `💳 Levar a MAQUININHA. Cobrar R$ ${total} na entrega.`
        };
      default: {
        const changeFor = parseFloat(order.change_for) || 0;
        return {
          bg: '#f0fdf4',
          border: '#22c55e',
          text: changeFor > 0
            ? `💵 DINHEIRO: cobrar R$ ${total}. Cliente vai pagar com R$ ${changeFor.toFixed(2)} → levar R$ ${(changeFor - parseFloat(order.total)).toFixed(2)} de troco.`
            : `💵 DINHEIRO: cobrar R$ ${total}. Cliente disse que tem trocado (não precisa de troco).`
        };
      }
    }
  };

  if (loading) return <div className="admin-orders-loading">Carregando pedidos...</div>;

  return (
    <div className="admin-orders">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h2>📦 Gerenciar Pedidos</h2>
        <button
          onClick={() => { fetchOrders(); fetchMotoboys(); }}
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

      {error && <div className="admin-orders-error">{error}</div>}

      {orders.length === 0 ? (
        <p>Nenhum pedido ainda</p>
      ) : (
        <div className="orders-table-container">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Ação</th>
                <th>ID</th>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Endereço</th>
                <th>Total</th>
                <th>Pagamento</th>
                <th>Status</th>
                <th>Motoboy</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} className="order-row">
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="details-btn"
                      onClick={() => openOrderDetails(order)}
                    >
                      Ver
                    </button>
                    <button
                      className="details-btn"
                      title="Imprimir pedido"
                      style={{ marginLeft: '6px', background: '#1a1a1a' }}
                      onClick={() => printOrderById(order.id).catch(err => alert(err.message))}
                    >
                      🖨️
                    </button>
                  </td>
                  <td>
                    #{order.id}
                    {order.notes && <span title={`Observação: ${order.notes}`}> 📝</span>}
                    {order.rating && <span title={`Avaliação: ${order.rating}/5`}> ⭐{order.rating}</span>}
                  </td>
                  <td>{order.name || 'N/A'}</td>
                  <td>{order.phone_number || 'N/A'}</td>
                  <td>{order.delivery_address}</td>
                  <td>R$ {parseFloat(order.total).toFixed(2)}</td>
                  <td><PaymentBadge method={order.payment_method} /></td>
                  <td>
                    <span
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(order.status) }}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td><MotoboyCell order={order} /></td>
                  <td>{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedOrder && orderDetails && (
        <div className="order-modal">
          <div className="order-modal-content">
            <button className="close-modal-btn" onClick={closeModal}>×</button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h3>Detalhes do Pedido #{selectedOrder.id}</h3>
              <button
                onClick={() => printOrder({ ...selectedOrder, ...orderDetails })}
                style={{
                  padding: '8px 14px', background: '#1a1a1a', color: '#fff', border: 'none',
                  borderRadius: '8px', fontWeight: 700, cursor: 'pointer', marginRight: '30px'
                }}
              >
                🖨️ Imprimir
              </button>
            </div>

            <div className="order-details">
              <p><strong>Cliente:</strong> {selectedOrder.name || 'N/A'}</p>
              <p><strong>Telefone:</strong> {selectedOrder.phone_number || 'N/A'}</p>
              <p><strong>Endereço:</strong> {selectedOrder.delivery_address}</p>
              <p><strong>Data:</strong> {new Date(selectedOrder.created_at).toLocaleString('pt-BR')}</p>
              <p><strong>Pagamento:</strong> <PaymentBadge method={selectedOrder.payment_method} /></p>
            </div>

            {selectedOrder.notes && (
              <div style={{
                background: '#fff7ed', borderLeft: '4px solid #f97316', padding: '12px 14px',
                borderRadius: '8px', margin: '12px 0', fontSize: '15px', fontWeight: 600
              }}>
                📝 Observação do cliente: {selectedOrder.notes}
              </div>
            )}

            {selectedOrder.rating && (
              <div style={{
                background: '#fefce8', borderLeft: '4px solid #eab308', padding: '12px 14px',
                borderRadius: '8px', margin: '12px 0', fontSize: '14px'
              }}>
                <strong>{'⭐'.repeat(selectedOrder.rating)}</strong> Avaliação do cliente ({selectedOrder.rating}/5)
                {selectedOrder.rating_comment && <p style={{ margin: '6px 0 0' }}>"{selectedOrder.rating_comment}"</p>}
              </div>
            )}

            {(() => {
              const note = getDeliveryNote(selectedOrder);
              return (
                <div style={{
                  background: note.bg,
                  borderLeft: `4px solid ${note.border}`,
                  padding: '12px 14px',
                  borderRadius: '8px',
                  margin: '12px 0',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#333'
                }}>
                  {note.text}
                </div>
              );
            })()}

            {/* 🛵 MOTOBOY */}
            <div style={{
              background: '#f8f9fa',
              border: '1px solid #e0e0e0',
              borderRadius: '10px',
              padding: '12px 14px',
              margin: '12px 0'
            }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700 }}>🛵 Motoboy da entrega:</p>

              {['Entregue', 'Cancelado'].includes(selectedOrder.status) ? (
                <p style={{ margin: 0 }}>{selectedOrder.motoboy_name ? `🛵 ${selectedOrder.motoboy_name}` : 'Sem motoboy registrado'}</p>
              ) : (
                <>
                  <select
                    value={selectedOrder.motoboy_id || ''}
                    onChange={(e) => assignMotoboy(selectedOrder.id, e.target.value)}
                    disabled={savingMotoboy}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '2px solid #e0e0e0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      background: '#fff'
                    }}
                  >
                    <option value="">— Nenhum (fica livre para o motoboy pegar) —</option>
                    {motoboys.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} (@{m.username}){m.active_deliveries > 0 ? ` • ${m.active_deliveries} em andamento` : ''}
                      </option>
                    ))}
                  </select>

                  {motoboys.length === 0 && (
                    <small style={{ display: 'block', marginTop: '6px', color: '#888' }}>
                      Nenhum motoboy ativo. Cadastre na aba 🛵 Motoboys.
                    </small>
                  )}

                  {!selectedOrder.motoboy_id && selectedOrder.status !== 'Preparando' && (
                    <small style={{ display: 'block', marginTop: '6px', color: '#888' }}>
                      💡 O pedido só aparece para os motoboys pegarem quando estiver em "Preparando".
                    </small>
                  )}

                  {savingMotoboy && (
                    <small style={{ display: 'block', marginTop: '6px', color: '#666' }}>⏳ Salvando...</small>
                  )}
                </>
              )}
            </div>

            <div className="order-items-section">
              <h4>Itens do Pedido:</h4>
              {orderDetails.items && orderDetails.items.length > 0 ? (
                <div className="items-list">
                  {orderDetails.items.map((item, index) => (
                    <div key={index} className="item-detail">
                      <span className="product-name">
                        {formatQty(item.quantity, item.unit)} {item.product_name}
                      </span>
                      <span>
                        Preço un: R$ {parseFloat(item.price).toFixed(2)}
                        <strong style={{ marginLeft: '20px' }}>
                          Subtotal: R$ {(parseFloat(item.price) * item.quantity).toFixed(2)}
                        </strong>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p>Nenhum item encontrado</p>
              )}
            </div>

            <div className="order-total-section">
              {parseFloat(selectedOrder.discount) > 0 && (
                <p>🎟️ Desconto{selectedOrder.coupon_code ? ` (cupom ${selectedOrder.coupon_code})` : ''}: − R$ {parseFloat(selectedOrder.discount).toFixed(2)}</p>
              )}
              {parseFloat(selectedOrder.delivery_fee) > 0 && (
                <p>🛵 Taxa de entrega{selectedOrder.delivery_neighborhood ? ` (${selectedOrder.delivery_neighborhood})` : ''}: R$ {parseFloat(selectedOrder.delivery_fee).toFixed(2)}</p>
              )}
              <h4>Total do Pedido: R$ {parseFloat(selectedOrder.total).toFixed(2)}</h4>
              <p><strong>Status Atual:</strong>
                <span
                  className="status-badge"
                  style={{
                    backgroundColor: getStatusColor(selectedOrder.status),
                    marginLeft: '10px'
                  }}
                >
                  {selectedOrder.status}
                </span>
              </p>
            </div>

            {selectedOrder.status === 'Cancelado' ? (
              <div className="status-buttons">
                <p>❌ Pedido cancelado — os itens já voltaram para o estoque.</p>
              </div>
            ) : (
            <div className="status-buttons">
              <p><strong>Mudar Status:</strong></p>
              <div className="button-group">
                {statuses.map(status => (
                  <button
                    key={status}
                    className={`status-btn ${selectedOrder.status === status ? 'active' : ''}`}
                    style={{
                      backgroundColor: selectedOrder.status === status ? getStatusColor(status) : '#e0e0e0',
                      color: selectedOrder.status === status ? 'white' : '#666'
                    }}
                    onClick={() => updateOrderStatus(selectedOrder.id, status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
              {selectedOrder.status !== 'Entregue' && (
                <button
                  className="status-btn"
                  style={{ backgroundColor: '#fee2e2', color: '#b91c1c', marginTop: '10px' }}
                  onClick={() => cancelOrder(selectedOrder)}
                >
                  ❌ Cancelar pedido
                </button>
              )}
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;