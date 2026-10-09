import React, { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { API_URL } from '../config';
import { qtyText } from '../utils/units';
import { brl, int, pct, dateBR, shortDateBR, isoLocal, delta } from '../utils/format';
import DashboardReport from './DashboardReport';
// O CSS antigo continua carregado: outras abas do admin usam classes dele (stat-value, orders-table…)
import './AdminDashboard.css';
import './Dashboard.css';

const PRESETS = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'month', label: 'Este mês' },
  { id: 'lastMonth', label: 'Mês anterior' },
  { id: 'custom', label: 'Personalizado' }
];

const rangeFor = (preset) => {
  const now = new Date();
  const back = (n) => isoLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
  switch (preset) {
    case 'today': return { from: back(0), to: back(0) };
    case '7d': return { from: back(6), to: back(0) };
    case 'month': return { from: isoLocal(new Date(now.getFullYear(), now.getMonth(), 1)), to: back(0) };
    case 'lastMonth': return {
      from: isoLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: isoLocal(new Date(now.getFullYear(), now.getMonth(), 0))
    };
    default: return { from: back(29), to: back(0) };
  }
};

const METRICS = [
  { id: 'revenue', label: 'Faturamento', format: brl },
  { id: 'orders', label: 'Pedidos', format: int },
  { id: 'customers', label: 'Clientes novos', format: int }
];

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const bucketLabel = (key, granularity) => {
  if (granularity === 'hour') return `${key.slice(11, 13)}h`;
  if (granularity === 'month') return `${MONTHS[Number(key.slice(5, 7)) - 1]}/${key.slice(2, 4)}`;
  return shortDateBR(key);
};
const bucketTitle = (key, granularity) => {
  if (granularity === 'hour') return `${dateBR(key)} às ${key.slice(11, 13)}h`;
  if (granularity === 'week') return `Semana de ${dateBR(key)}`;
  if (granularity === 'month') return `${MONTHS[Number(key.slice(5, 7)) - 1]}/${key.slice(0, 4)}`;
  return dateBR(key);
};

const PAYMENT_LABEL = { pix: 'PIX', dinheiro: 'Dinheiro', cartao: 'Cartão' };
const STATUS_ICON = { Pendente: '⏳', Preparando: '👨‍🍳', 'Saído': '🛵', Entregue: '✅', Cancelado: '❌' };
const PRIORITY_LABEL = { alta: 'Prioridade alta', media: 'Prioridade média', baixa: 'Prioridade baixa' };
const TYPE_LABEL = { alerta: '⚠️ Alerta', oportunidade: '💡 Oportunidade', operacao: '🛵 Operação', tendencia: '📈 Tendência' };

// Cartão de indicador: valor + variação contra o período anterior
function Kpi({ label, value, change, note, hint, hero }) {
  return (
    <div className={`db-kpi ${hero ? 'db-kpi-hero' : ''}`} title={hint}>
      <span className="db-kpi-label">{label}{hint && <span className="db-hint" aria-label={hint}>ⓘ</span>}</span>
      <span className="db-kpi-value">{value}</span>
      {change && <span className={`db-delta db-${change.tone}`}>{change.text}</span>}
      {note && <span className="db-kpi-note">{note}</span>}
    </div>
  );
}

// Lista com barrinhas proporcionais (lê melhor que pizza para comparar valores)
function BarList({ rows, empty }) {
  if (!rows.length) return <p className="db-empty">{empty}</p>;
  const max = Math.max(...rows.map(r => r.value), 0) || 1;
  return (
    <ul className="db-barlist">
      {rows.map(r => (
        <li key={r.key}>
          <div className="db-bar-head">
            <span className="db-bar-name">{r.name}{r.tag && <span className="db-tag">{r.tag}</span>}</span>
            <span className="db-bar-value">{r.valueText}</span>
          </div>
          <div className="db-bar-track">
            <div className="db-bar" style={{ width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%` }} />
          </div>
          {r.sub && <span className="db-bar-sub">{r.sub}</span>}
        </li>
      ))}
    </ul>
  );
}

function StockList({ title, items, empty, render }) {
  return (
    <div className="db-stock-col">
      <h4>{title} <span className="db-count">{items.length}</span></h4>
      {items.length === 0 ? <p className="db-empty">{empty}</p> : (
        <ul>
          {items.slice(0, 8).map(p => <li key={p.id}>{p.name}<span>{render(p)}</span></li>)}
          {items.length > 8 && <li className="db-more">e mais {items.length - 8}</li>}
        </ul>
      )}
    </div>
  );
}

const AdminDashboard = () => {
  const [preset, setPreset] = useState('30d');
  const [range, setRange] = useState(rangeFor('30d'));
  const [custom, setCustom] = useState(rangeFor('30d'));
  const [metric, setMetric] = useState('revenue');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReport, setShowReport] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${API_URL}/dashboard?from=${range.from}&to=${range.to}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar o dashboard');
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const choosePreset = (id) => {
    setPreset(id);
    if (id !== 'custom') setRange(rangeFor(id));
  };

  const applyCustom = () => {
    if (custom.from && custom.to && custom.from <= custom.to) setRange({ ...custom });
  };

  if (showReport && data) {
    return <DashboardReport data={data} onClose={() => setShowReport(false)} />;
  }

  const cur = data?.current;
  const prev = data?.previous;
  const g = data?.period.granularity;
  const metricDef = METRICS.find(m => m.id === metric);
  const openNow = data ? data.open_orders.reduce((acc, o) => ({ ...acc, [o.status]: (acc[o.status] || 0) + 1 }), {}) : {};

  return (
    <div className="db-root">
      {/* TOPO */}
      <div className="db-header">
        <div>
          <h2>📊 Dashboard</h2>
          {data && (
            <p className="db-sub">
              {dateBR(data.period.from)}{data.period.from !== data.period.to && ` a ${dateBR(data.period.to)}`}
              {' · comparado com '}
              {dateBR(data.period.previous.from)}{data.period.days > 1 && ` a ${dateBR(data.period.previous.to)}`}
            </p>
          )}
        </div>
        <div className="db-actions">
          <button className="db-btn" onClick={load} disabled={loading}>🔄 Atualizar</button>
          <button className="db-btn db-btn-primary" onClick={() => setShowReport(true)} disabled={!data || loading}>
            📄 Gerar relatório
          </button>
        </div>
      </div>

      {/* FILTRO DE PERÍODO */}
      <div className="db-filters">
        <div className="db-segmented" role="group" aria-label="Período">
          {PRESETS.map(p => (
            <button key={p.id} className={preset === p.id ? 'active' : ''} onClick={() => choosePreset(p.id)}>{p.label}</button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="db-custom">
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            <span>até</span>
            <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            <button className="db-btn" onClick={applyCustom}>Aplicar</button>
          </div>
        )}
      </div>

      {error && (
        <div className="db-error">❌ {error} <button className="db-btn" onClick={load}>Tentar de novo</button></div>
      )}

      {!data ? (
        !error && <div className="db-loading">⏳ Carregando dashboard...</div>
      ) : (
        <div className={loading ? 'db-body db-refreshing' : 'db-body'}>
          {/* AGORA */}
          <div className="db-now">
            <strong>Agora:</strong>
            <span>⏳ {openNow.Pendente || 0} pendentes</span>
            <span>👨‍🍳 {openNow.Preparando || 0} preparando</span>
            <span>🛵 {openNow['Saído'] || 0} em entrega</span>
            <span className={data.stock.out.length ? 'db-now-bad' : ''}>🔴 {data.stock.out.length} sem estoque</span>
            <span>🟡 {data.stock.low.length} com estoque baixo</span>
          </div>

          {/* INDICADORES */}
          <div className="db-kpis">
            <Kpi hero label="Faturamento em produtos" value={brl(cur.revenue)} change={delta(cur.revenue, prev.revenue)}
              hint="Soma dos produtos dos pedidos não cancelados, sem a taxa de entrega." />
            <Kpi label="Pedidos" value={int(cur.orders_valid)} change={delta(cur.orders_valid, prev.orders_valid)}
              hint="Pedidos do período, sem contar os cancelados." />
            <Kpi label="Ticket médio" value={brl(cur.avg_ticket)} change={delta(cur.avg_ticket, prev.avg_ticket)}
              hint="Faturamento em produtos dividido pelo número de pedidos." />
            <Kpi label="Clientes novos" value={int(cur.new_customers)} change={delta(cur.new_customers, prev.new_customers)}
              note={cur.new_without_orders > 0 ? `${int(cur.new_without_orders)} ainda sem pedido` : null}
              hint="Contas de cliente criadas no período." />
            <Kpi label="Total de clientes" value={int(cur.total_customers)}
              note={`${int(cur.buyers)} ${cur.buyers === 1 ? 'comprou' : 'compraram'} no período · ${int(cur.returning_buyers)} ${cur.returning_buyers === 1 ? 'voltou' : 'voltaram'}`}
              hint="Clientes cadastrados até o fim do período. 'Voltaram' = já tinham comprado antes do período." />
            <Kpi label="Cancelamentos" value={pct(cur.cancel_rate)} change={delta(cur.cancel_rate, prev.cancel_rate, { invert: true })}
              note={`${int(cur.status.Cancelado)} de ${int(cur.orders_total)} pedidos`}
              hint="Pedidos cancelados divididos por todos os pedidos do período." />
            <Kpi label="Taxas de entrega" value={brl(cur.fees)} change={delta(cur.fees, prev.fees)}
              hint="Soma das taxas de entrega dos pedidos não cancelados." />
          </div>

          {/* INTELIGÊNCIA */}
          <section className="db-card">
            <div className="db-card-head">
              <h3>💡 Inteligência do negócio</h3>
              <span className="db-muted">Calculado com regras fixas a partir dos seus dados</span>
            </div>
            {data.insights.length === 0 ? (
              <p className="db-empty">Nenhum alerta no período. Tudo certo por aqui.</p>
            ) : (
              <div className="db-insights">
                {data.insights.map(i => (
                  <article key={i.id} className={`db-insight db-p-${i.priority}`}>
                    <div className="db-insight-meta">
                      <span>{TYPE_LABEL[i.type]}</span>
                      <span className={`db-badge db-badge-${i.priority}`}>{PRIORITY_LABEL[i.priority]}</span>
                    </div>
                    <h4>{i.title}</h4>
                    <p>{i.fact}</p>
                    <p className="db-reco">→ {i.recommendation}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* EVOLUÇÃO */}
          <section className="db-card">
            <div className="db-card-head">
              <h3>📈 Evolução {g === 'hour' ? 'por hora' : g === 'week' ? 'por semana' : g === 'month' ? 'por mês' : 'por dia'}</h3>
              <div className="db-segmented db-small" role="group" aria-label="Indicador do gráfico">
                {METRICS.map(m => (
                  <button key={m.id} className={metric === m.id ? 'active' : ''} onClick={() => setMetric(m.id)}>{m.label}</button>
                ))}
              </div>
            </div>
            <div className="db-chart">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barCategoryGap="20%">
                  <CartesianGrid vertical={false} stroke="var(--db-grid)" />
                  <XAxis dataKey="key" tickFormatter={(k) => bucketLabel(k, g)} stroke="var(--db-axis)"
                    tick={{ fill: 'var(--db-muted)', fontSize: 12 }} tickLine={false} minTickGap={16} />
                  <YAxis allowDecimals={metric === 'revenue'} stroke="var(--db-axis)" axisLine={false} tickLine={false} width={64}
                    tick={{ fill: 'var(--db-muted)', fontSize: 12 }}
                    tickFormatter={(v) => (metric === 'revenue' ? `R$ ${int(v)}` : int(v))} />
                  <Tooltip
                    cursor={{ fill: 'rgba(42, 120, 214, 0.08)' }}
                    content={({ active, payload }) => (active && payload?.length ? (
                      <div className="db-tooltip">
                        <span>{bucketTitle(payload[0].payload.key, g)}</span>
                        <strong>{metricDef.label}: {metricDef.format(payload[0].value)}</strong>
                      </div>
                    ) : null)}
                  />
                  <Bar dataKey={metric} fill="var(--db-series)" maxBarSize={24} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* PRODUTOS E CATEGORIAS */}
          <div className="db-grid-2">
            <section className="db-card">
              <div className="db-card-head"><h3>🏆 Produtos que mais faturaram</h3></div>
              <BarList
                empty="Nenhuma venda no período."
                rows={data.top_products.map((p, idx) => ({
                  key: p.id ?? idx,
                  name: `${idx + 1}. ${p.name}`,
                  value: p.revenue,
                  valueText: brl(p.revenue),
                  sub: `${qtyText(p.quantity, p.unit)} · ${int(p.orders)} ${p.orders === 1 ? 'pedido' : 'pedidos'}`
                }))}
              />
            </section>
            <section className="db-card">
              <div className="db-card-head"><h3>📁 Vendas por categoria</h3></div>
              <BarList
                empty="Nenhuma venda no período."
                rows={data.categories.map(c => {
                  const share = cur.revenue > 0 ? (c.revenue / cur.revenue) * 100 : 0;
                  return {
                    key: c.name,
                    name: c.name,
                    value: c.revenue,
                    valueText: `${brl(c.revenue)} · ${pct(share, 0)}`,
                    sub: delta(c.revenue, c.previous).text
                  };
                })}
              />
            </section>
          </div>

          {/* PAGAMENTOS E BAIRROS */}
          <div className="db-grid-2">
            <section className="db-card">
              <div className="db-card-head"><h3>💳 Formas de pagamento</h3></div>
              <BarList
                empty="Nenhum pedido no período."
                rows={data.payments.map(p => ({
                  key: p.method,
                  name: PAYMENT_LABEL[p.method] || p.method,
                  value: p.orders,
                  valueText: `${int(p.orders)} ${p.orders === 1 ? 'pedido' : 'pedidos'} · ${pct(cur.orders_valid ? (p.orders / cur.orders_valid) * 100 : 0, 0)}`,
                  sub: `${brl(p.total)} recebidos (com taxa)`
                }))}
              />
            </section>
            <section className="db-card">
              <div className="db-card-head"><h3>🏘️ Pedidos por bairro</h3></div>
              <BarList
                empty="Nenhum pedido no período."
                rows={data.neighborhoods.slice(0, 8).map(n => ({
                  key: n.name,
                  name: n.name,
                  tag: !n.in_list && n.name !== 'Não informado' ? 'fora da lista de taxas' : null,
                  value: n.orders,
                  valueText: `${int(n.orders)} ${n.orders === 1 ? 'pedido' : 'pedidos'}`,
                  sub: `${brl(n.revenue)} em produtos · ${brl(n.fees)} em taxas`
                }))}
              />
              {data.neighborhoods.length > 8 && <p className="db-muted">e mais {data.neighborhoods.length - 8} bairros</p>}
            </section>
          </div>

          {/* ESTOQUE */}
          <section className="db-card">
            <div className="db-card-head">
              <h3>📦 Estoque</h3>
              <span className="db-muted">{int(data.stock.total_products)} produtos cadastrados</span>
            </div>
            <div className="db-stock">
              <StockList title="🔴 Sem estoque" items={data.stock.out} empty="Nenhum produto zerado."
                render={p => (p.sold_30d > 0 ? `vendeu ${qtyText(p.sold_30d, p.unit)} em 30 dias` : '')} />
              <StockList title="🟡 Estoque baixo" items={data.stock.low} empty="Nenhum produto com estoque baixo."
                render={p => `restam ${qtyText(p.estoque, p.unit)}`} />
              <StockList title="💤 Sem venda no período" items={data.stock.no_sales} empty="Todos os produtos com estoque venderam."
                render={p => `${qtyText(p.estoque, p.unit)} em estoque`} />
            </div>
          </section>

          {/* STATUS */}
          <section className="db-card">
            <div className="db-card-head"><h3>🚦 Pedidos do período por status</h3></div>
            <div className="db-status">
              {Object.entries(cur.status).map(([s, n]) => (
                <div key={s} className="db-status-item">
                  <span>{STATUS_ICON[s]} {s}</span>
                  <strong>{int(n)}</strong>
                </div>
              ))}
            </div>
          </section>

          <p className="db-footnote">
            Faturamento = produtos dos pedidos não cancelados, sem a taxa de entrega. O lucro não é calculado porque o app
            ainda não registra o custo dos produtos. Datas no horário de Brasília.
          </p>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
