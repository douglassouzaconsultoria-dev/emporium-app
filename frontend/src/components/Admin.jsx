import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';
import './Admin.css';
import AdminProducts from './AdminProducts';
import AdminOrders from './AdminOrders';
import AdminDashboard from './AdminDashboard';
import AdminCategories from './AdminCategories';
import AdminStockConfig from './AdminStockConfig';
import AdminMotoboys from './AdminMotoboys';
import AdminDeliveryFees from './AdminDeliveryFees';
import AdminCustomers from './AdminCustomers';
import AdminStore from './AdminStore';
import AdminCoupons from './AdminCoupons';
import { getAutoPrint, printOrderById } from '../utils/printOrder';

// 🔔 Dois bipes curtos (não precisa de arquivo de som)
const playBeep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.3].forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.15);
    });
  } catch (err) {
    console.error('Sem som:', err);
  }
};

function Admin() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [newOrders, setNewOrders] = useState(0);
  const knownIds = useRef(null);

  // 🔔 Confere pedidos novos a cada 20 segundos (em qualquer aba)
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/orders`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
        });
        if (!res.ok) return;
        const ids = (await res.json()).map(o => o.id);
        if (knownIds.current) {
          const fresh = ids.filter(id => !knownIds.current.has(id));
          knownIds.current = new Set(ids); // antes de imprimir: nunca imprime o mesmo pedido duas vezes
          if (fresh.length > 0) {
            playBeep();
            setNewOrders(n => n + fresh.length);
            // 🖨️ Impressão automática (ligada na aba Loja, vale só neste computador)
            if (getAutoPrint()) {
              for (const id of [...fresh].sort((a, b) => a - b)) {
                await printOrderById(id).catch(err => console.error('Erro ao imprimir:', err));
              }
            }
          }
        }
        knownIds.current = new Set(ids);
      } catch (err) {
        console.error('Erro ao checar pedidos:', err);
      }
    };
    check();
    const timer = setInterval(check, 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.title = newOrders > 0 ? `(${newOrders}) Novo pedido! - Empório` : 'EMPÓRIO BRUMADO - Delivery De Supermercado';
  }, [newOrders]);

  const openNewOrders = () => {
    setNewOrders(0);
    setActiveTab('orders');
  };

  useEffect(() => {
    // Verificar se é admin
    const token = localStorage.getItem('authToken');
    if (!token) {
      window.location.href = '/';
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role !== 'admin') {
        window.location.href = '/';
        return;
      }
      setUser(payload);
    } catch (error) {
      window.location.href = '/';
    }
  }, []);

  if (!user) {
    return <div>Carregando...</div>;
  }

  const tabs = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'orders', label: '📦 Pedidos' },
    { id: 'store', label: '🏪 Loja' },
    { id: 'coupons', label: '🎟️ Cupons' },
    { id: 'motoboys', label: '🛵 Motoboys' },
    { id: 'customers', label: '👥 Clientes' },
    { id: 'fees', label: '🏘️ Taxas de entrega' },
    { id: 'categories', label: '📁 Categorias' },
    { id: 'products', label: '🛍️ Produtos' },
    { id: 'stock', label: '⚙️ Estoque' }
  ];

  return (
    <div className="admin-panel">
      <div className="admin-header-top">
        <h1>🔧 Painel de Administração</h1>
        <p className="admin-welcome">Bem-vindo, {user.username || user.email} (Admin)</p>
      </div>

      {newOrders > 0 && (
        <button className="admin-new-orders" onClick={openNewOrders}>
          🔔 {newOrders} {newOrders === 1 ? 'pedido novo' : 'pedidos novos'} — clique para ver
        </button>
      )}

      {/* MENU DE ABAS */}
      <div className="admin-tabs-container">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTEÚDO DAS ABAS */}
      <div className="admin-content">
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'orders' && <AdminOrders />}
        {activeTab === 'store' && <AdminStore />}
        {activeTab === 'coupons' && <AdminCoupons />}
        {activeTab === 'motoboys' && <AdminMotoboys />}
        {activeTab === 'customers' && <AdminCustomers />}
        {activeTab === 'fees' && <AdminDeliveryFees />}
        {activeTab === 'categories' && <AdminCategories />}
        {activeTab === 'products' && <AdminProducts />}
        {activeTab === 'stock' && <AdminStockConfig />}
      </div>
    </div>
  );
}

export default Admin;