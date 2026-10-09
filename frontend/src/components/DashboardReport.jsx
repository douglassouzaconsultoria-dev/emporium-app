import React from 'react';
import { createPortal } from 'react-dom';
import { qtyText } from '../utils/units';
import { brl, int, pct, dateBR, delta } from '../utils/format';

const PAYMENT_LABEL = { pix: 'PIX', dinheiro: 'Dinheiro', cartao: 'Cartão' };
const PRIORITY_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

const periodText = (from, to) => (from === to ? dateBR(from) : `${dateBR(from)} a ${dateBR(to)}`);

// 📝 Resumo em frases, montado só com os números calculados (nada inventado)
const summaryLines = (d) => {
  const c = d.current, p = d.previous;
  const lines = [];
  const chg = p.revenue ? ((c.revenue - p.revenue) / p.revenue) * 100 : null;
  const chgText = chg === null ? '' : Math.abs(chg) < 0.05 ? 'o mesmo valor' : `${chg > 0 ? 'alta' : 'queda'} de ${pct(Math.abs(chg))}`;
  lines.push(
    `O Empório vendeu ${brl(c.revenue)} em produtos em ${int(c.orders_valid)} ${c.orders_valid === 1 ? 'pedido' : 'pedidos'}`
    + (chg === null ? ', sem base de comparação com o período anterior.' : ` (${chgText} em relação aos ${brl(p.revenue)} do período anterior).`)
  );
  if (c.orders_valid > 0) {
    lines.push(`O ticket médio foi de ${brl(c.avg_ticket)}. ${int(c.buyers)} ${c.buyers === 1 ? 'cliente comprou' : 'clientes compraram'}, ${int(c.returning_buyers)} já tinham comprado antes.`);
  }
  lines.push(`${int(c.new_customers)} ${c.new_customers === 1 ? 'cliente novo se cadastrou' : 'clientes novos se cadastraram'}, e a base chegou a ${int(c.total_customers)} clientes.`);
  if (c.status.Cancelado > 0) {
    lines.push(`${int(c.status.Cancelado)} ${c.status.Cancelado === 1 ? 'pedido foi cancelado' : 'pedidos foram cancelados'} (${pct(c.cancel_rate)} do total).`);
  }
  if (d.top_products[0]) {
    lines.push(`O produto que mais faturou foi ${d.top_products[0].name} (${brl(d.top_products[0].revenue)})`
      + (d.categories[0] ? ` e a categoria líder foi ${d.categories[0].name} (${brl(d.categories[0].revenue)}).` : '.'));
  }
  if (d.stock.out.length || d.stock.low.length) {
    lines.push(`No momento, ${int(d.stock.out.length)} ${d.stock.out.length === 1 ? 'produto está' : 'produtos estão'} sem estoque e ${int(d.stock.low.length)} com estoque baixo.`);
  }
  return lines;
};

function DashboardReport({ data, onClose }) {
  const c = data.current, p = data.previous;
  const generated = new Date(data.generated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  const rows = [
    ['Faturamento em produtos', brl(c.revenue), brl(p.revenue), delta(c.revenue, p.revenue)],
    ['Pedidos (sem cancelados)', int(c.orders_valid), int(p.orders_valid), delta(c.orders_valid, p.orders_valid)],
    ['Ticket médio', brl(c.avg_ticket), brl(p.avg_ticket), delta(c.avg_ticket, p.avg_ticket)],
    ['Taxas de entrega', brl(c.fees), brl(p.fees), delta(c.fees, p.fees)],
    ['Clientes novos', int(c.new_customers), int(p.new_customers), delta(c.new_customers, p.new_customers)],
    ['Clientes que compraram', int(c.buyers), int(p.buyers), delta(c.buyers, p.buyers)],
    ['Taxa de cancelamento', pct(c.cancel_rate), pct(p.cancel_rate), delta(c.cancel_rate, p.cancel_rate, { invert: true })]
  ];

  const report = (
      <article className="db-report">
        <header className="db-report-head">
          <div>
            <h1>EMPÓRIO BRUMADO</h1>
            <p>Relatório de desempenho</p>
          </div>
          <div className="db-report-meta">
            <strong>Período: {periodText(data.period.from, data.period.to)}</strong>
            <span>Comparado com: {periodText(data.period.previous.from, data.period.previous.to)}</span>
            <span>Gerado em {generated}</span>
          </div>
        </header>

        <section>
          <h2>Resumo</h2>
          {summaryLines(data).map((l, i) => <p key={i}>{l}</p>)}
        </section>

        <section>
          <h2>Indicadores</h2>
          <table>
            <thead><tr><th>Indicador</th><th>Período</th><th>Anterior</th><th>Variação</th></tr></thead>
            <tbody>
              {rows.map(([name, now, before, ch]) => (
                <tr key={name}><td>{name}</td><td>{now}</td><td>{before}</td><td>{ch.text.replace(' vs. anterior', '')}</td></tr>
              ))}
              <tr><td>Total de clientes cadastrados</td><td>{int(c.total_customers)}</td><td>{int(p.total_customers)}</td><td>—</td></tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>Produtos que mais faturaram</h2>
          {data.top_products.length === 0 ? <p>Nenhuma venda no período.</p> : (
            <table>
              <thead><tr><th>#</th><th>Produto</th><th>Quantidade</th><th>Pedidos</th><th>Faturamento</th></tr></thead>
              <tbody>
                {data.top_products.map((t, i) => (
                  <tr key={t.id ?? i}><td>{i + 1}</td><td>{t.name}</td><td>{qtyText(t.quantity, t.unit)}</td><td>{int(t.orders)}</td><td>{brl(t.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="db-report-cols">
          <section>
            <h2>Categorias</h2>
            {data.categories.length === 0 ? <p>Nenhuma venda no período.</p> : (
              <table>
                <thead><tr><th>Categoria</th><th>Faturamento</th><th>Parte</th></tr></thead>
                <tbody>
                  {data.categories.map(cat => (
                    <tr key={cat.name}><td>{cat.name}</td><td>{brl(cat.revenue)}</td><td>{pct(c.revenue ? (cat.revenue / c.revenue) * 100 : 0, 0)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section>
            <h2>Formas de pagamento</h2>
            {data.payments.length === 0 ? <p>Nenhum pedido no período.</p> : (
              <table>
                <thead><tr><th>Forma</th><th>Pedidos</th><th>Valor (com taxa)</th></tr></thead>
                <tbody>
                  {data.payments.map(pay => (
                    <tr key={pay.method}><td>{PAYMENT_LABEL[pay.method] || pay.method}</td><td>{int(pay.orders)}</td><td>{brl(pay.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <section>
          <h2>Bairros</h2>
          {data.neighborhoods.length === 0 ? <p>Nenhum pedido no período.</p> : (
            <table>
              <thead><tr><th>Bairro</th><th>Pedidos</th><th>Produtos</th><th>Taxas</th></tr></thead>
              <tbody>
                {data.neighborhoods.map(n => (
                  <tr key={n.name}><td>{n.name}{!n.in_list && n.name !== 'Não informado' ? ' (fora da lista de taxas)' : ''}</td><td>{int(n.orders)}</td><td>{brl(n.revenue)}</td><td>{brl(n.fees)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2>Pedidos por status</h2>
          <p>{Object.entries(c.status).map(([s, n]) => `${s}: ${int(n)}`).join(' · ')}</p>
        </section>

        <section>
          <h2>Estoque (situação atual)</h2>
          <p><strong>Sem estoque:</strong> {data.stock.out.length ? data.stock.out.map(s => s.name).join(', ') : 'nenhum'}</p>
          <p><strong>Estoque baixo:</strong> {data.stock.low.length ? data.stock.low.map(s => `${s.name} (${qtyText(s.estoque, s.unit)})`).join(', ') : 'nenhum'}</p>
          <p><strong>Sem venda no período:</strong> {data.stock.no_sales.length ? data.stock.no_sales.map(s => s.name).join(', ') : 'nenhum'}</p>
        </section>

        <section>
          <h2>Alertas e recomendações</h2>
          {data.insights.length === 0 ? <p>Nenhum alerta no período.</p> : (
            <ol className="db-report-insights">
              {data.insights.map(i => (
                <li key={i.id}>
                  <strong>{i.title}</strong> <em>(prioridade {PRIORITY_LABEL[i.priority].toLowerCase()})</em>
                  <br />{i.fact}
                  <br />Recomendação: {i.recommendation}
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="db-report-foot">
          Faturamento = produtos dos pedidos não cancelados, sem a taxa de entrega. O lucro não é calculado porque o app
          ainda não registra o custo dos produtos. Datas no horário de Brasília. Valores calculados pelo sistema a partir
          dos pedidos registrados.
        </footer>
      </article>
  );

  return (
    <div className="db-report-wrap">
      <div className="db-report-toolbar">
        <button className="db-btn" onClick={onClose}>← Voltar ao dashboard</button>
        <button className="db-btn db-btn-primary" onClick={() => window.print()}>🖨️ Imprimir / Salvar PDF</button>
        <span className="db-muted">Para PDF, escolha "Salvar como PDF" na janela de impressão.</span>
      </div>
      {report}
      {/* Cópia só para impressão, fora do app: sai sem cabeçalho, menus nem folha em branco */}
      {createPortal(<div className="db-print-root">{report}</div>, document.body)}
    </div>
  );
}

export default DashboardReport;
