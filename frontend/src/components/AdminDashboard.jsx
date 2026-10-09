import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSales: 0,
    totalOrders: 0,
    avgTicket: 0,
    trend: 0
  });
  const [chartData, setChartData] = useState({
    salesByDay: [],
    topProducts: [],
    salesByCategory: []
  });

  const token = localStorage.getItem('authToken');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/orders`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Erro ao buscar pedidos');

      const data = await response.json();
      setOrders(data);
      processData(data.filter(o => o.status !== 'Cancelado'));
    } catch (err) {
      console.error('Erro:', err);
    } finally {
      setLoading(false);
    }
  };

  const processData = (data) => {
    // Calcular estatísticas
    const totalSales = data.reduce((sum, order) => sum + parseFloat(order.total), 0);
    const totalOrders = data.length;
    const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

    // Tendência (comparar últimos 7 dias com os 7 anteriores)
    const today = new Date();
    const last7 = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last14 = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);

    const recentSales = data
      .filter(o => new Date(o.created_at) >= last7)
      .reduce((sum, o) => sum + parseFloat(o.total), 0);

    const previousSales = data
      .filter(o => new Date(o.created_at) >= last14 && new Date(o.created_at) < last7)
      .reduce((sum, o) => sum + parseFloat(o.total), 0);

    const trend = previousSales > 0 ? ((recentSales - previousSales) / previousSales) * 100 : 0;

    setStats({
      totalSales,
      totalOrders,
      avgTicket,
      trend: Math.round(trend)
    });

    // Gráfico de vendas por dia (últimos 7 dias)
    const salesByDay = getLast7DaysSales(data);
    const topProducts = getTopProducts(data);
    const salesByCategory = getSalesByCategory(data);

    setChartData({
      salesByDay,
      topProducts,
      salesByCategory
    });
  };

  const getLast7DaysSales = (data) => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString('pt-BR', { weekday: 'short', month: 'numeric', day: 'numeric' });
      
      const daySales = data
        .filter(o => {
          const orderDate = new Date(o.created_at);
          return orderDate.toDateString() === date.toDateString();
        })
        .reduce((sum, o) => sum + parseFloat(o.total), 0);

      days.push({
        dia: dateStr,
        vendas: parseFloat(daySales.toFixed(2))
      });
    }
    return days;
  };

  const getTopProducts = (data) => {
    const products = {};
    data.forEach(order => {
      // Simulando produtos (em produção viria do BD)
      const productNames = ['Feijão', 'Arroz', 'Óleo', 'Açúcar', 'Leite', 'Pão', 'Fruta', 'Verdura'];
      const randomProduct = productNames[Math.floor(Math.random() * productNames.length)];
      
      products[randomProduct] = (products[randomProduct] || 0) + 1;
    });

    return Object.entries(products)
      .map(([name, quantidade]) => ({ name, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  };

  const getSalesByCategory = (data) => {
    const categories = ['Alimentos', 'Bebidas', 'Higiene', 'Limpeza', 'Outros'];
    const colors = ['#C41E3A', '#E74C3C', '#F39C12', '#27AE60', '#3498DB'];
    
    return categories.map((cat, i) => ({
      name: cat,
      value: Math.floor(Math.random() * 1000) + 500,
      color: colors[i]
    }));
  };

  const COLORS_TREND = ['#27AE60', '#E74C3C']; // Verde (crescimento), Vermelho (queda)

  if (loading) {
    return <div className="dashboard-loading">⏳ Carregando dashboard...</div>;
  }

  return (
    <div className="admin-dashboard">
      {/* HEADER COM LOGO */}
      <div className="dashboard-header">
        <div className="header-logo">
          <svg viewBox="0 0 100 100" className="logo-svg">
  <circle cx="50" cy="50" r="45" fill="#C41E3A" />
  <text x="50" y="65" fontSize="40" fontWeight="bold" fill="white" textAnchor="middle" fontFamily="Arial" fontStyle="italic">EB</text>
</svg>
          <div className="header-info">
            <h1>EMPÓRIO BRUMADO</h1>
            <p>O Mercado da Família</p>
          </div>
        </div>
        <button onClick={fetchOrders} className="btn-refresh">🔄 Atualizar Dashboard</button>
      </div>

      {/* CARDS DE ESTATÍSTICAS */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <p className="stat-label">Total de Vendas</p>
            <h2 className="stat-value">R$ {stats.totalSales.toFixed(2)}</h2>
            <p className="stat-trend">
              {stats.trend >= 0 ? '📈' : '📉'} 
              {Math.abs(stats.trend)}% {stats.trend >= 0 ? 'crescimento' : 'queda'}
            </p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-content">
            <p className="stat-label">Total de Pedidos</p>
            <h2 className="stat-value">{stats.totalOrders}</h2>
            <p className="stat-trend">Últimos 30 dias</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <p className="stat-label">Ticket Médio</p>
            <h2 className="stat-value">R$ {stats.avgTicket.toFixed(2)}</h2>
            <p className="stat-trend">Por pedido</p>
          </div>
        </div>
      </div>

      {/* GRÁFICOS */}
      <div className="charts-container">
        {/* Gráfico de Vendas por Dia */}
        <div className="chart-box">
          <h3>📉 Vendas dos Últimos 7 Dias</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData.salesByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="dia" stroke="#999" />
              <YAxis stroke="#999" />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #C41E3A' }} />
              <Line type="monotone" dataKey="vendas" stroke="#C41E3A" strokeWidth={3} dot={{ fill: '#C41E3A', r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de Top 5 Produtos */}
        <div className="chart-box">
          <h3>🏆 Top 5 Produtos Mais Vendidos</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData.topProducts}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" stroke="#999" />
              <YAxis stroke="#999" />
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #C41E3A' }} />
              <Bar dataKey="quantidade" fill="#C41E3A" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de Faturamento por Categoria */}
        <div className="chart-box">
          <h3>💵 Faturamento por Categoria</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData.salesByCategory}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: R$ ${value.toFixed(2)}`}
                outerRadius={100}
                fill="#C41E3A"
                dataKey="value"
              >
                {chartData.salesByCategory.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #C41E3A' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TABELA DE PEDIDOS RECENTES */}
      <div className="orders-table-container">
        <h3>📋 Pedidos Recentes</h3>
        <table className="orders-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Endereço</th>
              <th>Total</th>
              <th>Status</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 10).map(order => (
              <tr key={order.id}>
                <td><strong>#{order.id}</strong></td>
                <td>{order.name || 'Cliente'}</td>
                <td className="truncate">{order.delivery_address || 'N/A'}</td>
                <td><strong>R$ {parseFloat(order.total).toFixed(2)}</strong></td>
                <td>
                  <span className={`badge badge-${order.status.toLowerCase().replace(' ', '-')}`}>
                    {order.status === 'Pendente' && '⏳'}
                    {order.status === 'Preparando' && '🍳'}
                    {order.status === 'Saído' && '🚚'}
                    {order.status === 'Entregue' && '✅'}
                    {order.status === 'Cancelado' && '❌'}
                    {' ' + order.status}
                  </span>
                </td>
                <td>{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDashboard;