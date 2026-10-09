import React, { useState, useEffect } from 'react';
import './Admin.css';
import AdminProducts from './AdminProducts';
import AdminOrders from './AdminOrders';
import AdminDashboard from './AdminDashboard';
import AdminCategories from './AdminCategories';
import AdminStockConfig from './AdminStockConfig';
import AdminMotoboys from './AdminMotoboys';
import AdminDeliveryFees from './AdminDeliveryFees';

function Admin() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState(null);

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
    { id: 'motoboys', label: '🛵 Motoboys' },
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
        {activeTab === 'motoboys' && <AdminMotoboys />}
        {activeTab === 'fees' && <AdminDeliveryFees />}
        {activeTab === 'categories' && <AdminCategories />}
        {activeTab === 'products' && <AdminProducts />}
        {activeTab === 'stock' && <AdminStockConfig />}
      </div>
    </div>
  );
}

export default Admin;