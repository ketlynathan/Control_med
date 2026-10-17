import { Inbox } from 'lucide-react';

export function PageHeading({ eyebrow, title, description, actions }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

export function StatCard({ label, value, detail, tone = 'neutral', icon: Icon }) {
  return <article className={`stat-card tone-${tone}`}><div className="stat-top"><span>{label}</span>{Icon && <Icon size={17} strokeWidth={1.8} />}</div><strong className="stat-value">{value}</strong>{detail && <span className="stat-foot">{detail}</span>}</article>;
}

export function Panel({ title, description, action, children, className = '' }) {
  return <section className={`panel ${className}`}><header className="panel-header"><div>{title && <h3>{title}</h3>}{description && <p>{description}</p>}</div>{action}</header>{children}</section>;
}

export function EmptyState({ title = 'Nenhum registro', description = 'Os registros aparecerão aqui.' }) {
  return <div className="empty-state"><Inbox size={22} strokeWidth={1.6} /><strong>{title}</strong><span>{description}</span></div>;
}

export function DataTable({ columns, rows, emptyTitle, emptyDescription, rowKey = row => row.id }) {
  if (!rows.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return <div className="table-wrap"><table><thead><tr>{columns.map((column, index) => <th key={column.key || `column-${index}`} className={column.numeric ? 'numeric' : ''}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={rowKey(row, index) ?? `row-${index}`}>{columns.map((column, columnIndex) => <td key={column.key || `cell-${columnIndex}`} className={`${column.numeric ? 'numeric' : ''} ${column.className || ''}`}>{column.render ? column.render(row, index) : row[column.key]}</td>)}</tr>)}</tbody></table></div>;
}

export function Field({ label, children, className = '' }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}</label>;
}

export function SectionTitle({ children, detail }) {
  return <div className="section-title"><h3>{children}</h3>{detail && <span>{detail}</span>}</div>;
}

export function FormActions({ onCancel, submitLabel = 'Salvar', busy = false }) {
  return <div className="form-actions">{onCancel && <button className="button button-quiet" type="button" onClick={onCancel}>Cancelar</button>}<button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : submitLabel}</button></div>;
}