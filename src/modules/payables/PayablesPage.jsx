import { useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import {
  createId,
  formatCurrency,
  formatDate,
  withinRange,
} from "../../shared/format.js";
import {
  DataTable,
  Field,
  FormActions,
  PageHeading,
  Panel,
  StatCard,
} from "../../shared/components.jsx";
import {
  getInstallmentProgress,
  isInstallmentPayment,
  parseInstallment,
} from "../../shared/installments.js";

function emptyPayable() {
  return {
    id: "",
    supplier: "",
    description: "",
    category: "Fornecedor",
    costType: "variavel",
    amount: "",
    dueDate: "",
    paid: false,
    paidAt: "",
    notes: "",
    installmentCurrent: "",
    installmentTotal: "",
  };
}

export default function PayablesPage({ state, updateState }) {
  const [editor, setEditor] = useState(null);
  const [filter, setFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const range = useMemo(
    () =>
      window.AccountingPeriod.range(state.currentMonth, {
        initialStart: state.business.accountingFirstCycleStart,
      }),
    [state.currentMonth, state.business.accountingFirstCycleStart],
  );
  const entries = state.payables.entries || [];
  const open = entries.filter((row) => !row.paid);
  const paidInRange = entries.filter(
    (row) =>
      row.paid &&
      withinRange(String(row.paidAt || row.dueDate || "").slice(0, 10), range),
  );
  const overdue = open.filter(
    (row) => row.dueDate && row.dueDate < new Date().toISOString().slice(0, 10),
  );
  const installmentEntries = entries
    .map((row) => ({ row, progress: getInstallmentProgress(row) }))
    .filter(({ progress }) => progress);
  const remainingInstallments = installmentEntries.reduce(
    (sum, { progress }) => sum + progress.remaining,
    0,
  );
  const filtered = entries
    .filter(
      (row) =>
        (filter === "open" ? !row.paid : filter === "paid" ? row.paid : true) &&
        `${row.supplier || ""} ${row.description || ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(query.toLocaleLowerCase("pt-BR")),
    )
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  function submit(event) {
    event.preventDefault();
    const installment = getInstallmentProgress(editor);
    const hasInstallmentData = editor.installmentCurrent || editor.installmentTotal || parseInstallment(editor.description);
    if (hasInstallmentData && !installment) {
      setNotice("Confira a parcela atual e o total de parcelas.");
      return;
    }
    const previous = entries.find((row) => row.id === editor.id);
    const now = new Date().toISOString();
    const saved = {
      ...previous,
      ...editor,
      id: previous?.id || createId(),
      amount: Number(editor.amount) || 0,
      installmentCurrent: installment?.current || null,
      installmentTotal: installment?.total || null,
      updatedAt: now,
      createdAt: previous?.createdAt || now,
    };
    updateState((current) => ({
      ...current,
      payables: {
        ...current.payables,
        entries: previous
          ? current.payables.entries.map((row) =>
              row.id === previous.id ? saved : row,
            )
          : [saved, ...current.payables.entries],
      },
    }));
    setEditor(null);
    setNotice(
      previous
        ? "Conta atualizada e sincronizando."
        : "Conta adicionada e sincronizando.",
    );
  }

  function togglePaid(row) {
    const paid = !row.paid;
    updateState((current) => ({
      ...current,
      payables: {
        ...current.payables,
        entries: current.payables.entries.map((item) =>
          item.id === row.id
            ? {
                ...item,
                paid,
                paidAt: paid ? new Date().toISOString() : null,
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      },
    }));
  }

  function remove(row) {
    if (
      !window.confirm(
        `Excluir a conta “${row.supplier || row.description || "sem descrição"}”?`,
      )
    )
      return;
    updateState((current) => ({
      ...current,
      payables: {
        ...current.payables,
        entries: current.payables.entries.filter((item) => item.id !== row.id),
      },
    }));
  }

  return (
    <div className="module-page">
      <PageHeading
        eyebrow="Operação"
        title="Contas a pagar"
        description="Vencimentos, pagamentos e classificação de custos."
        actions={
          <button
            className="button button-primary"
            onClick={() => setEditor(emptyPayable())}
          >
            <Plus size={16} />
            Nova conta
          </button>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="Em aberto"
          value={formatCurrency(
            open.reduce((sum, row) => sum + Number(row.amount || 0), 0),
          )}
          detail={`${open.length} conta(s)`}
          tone="warning"
        />
        <StatCard
          label="Vencidas"
          value={String(overdue.length)}
          detail={formatCurrency(
            overdue.reduce((sum, row) => sum + Number(row.amount || 0), 0),
          )}
          tone="negative"
        />
        <StatCard
          label="Pagas no ciclo"
          value={formatCurrency(
            paidInRange.reduce((sum, row) => sum + Number(row.amount || 0), 0),
          )}
          detail={`${paidInRange.length} pagamento(s)`}
          tone="positive"
        />
        <StatCard
          label="Parcelas restantes"
          value={String(remainingInstallments)}
          detail={`${installmentEntries.length} obrigação(ões) parcelada(s)`}
          tone="warning"
        />
      </div>
      {notice && (
        <div className="inline-message" role="status">
          {notice}
          <button className="text-action" onClick={() => setNotice("")}>
            Fechar
          </button>
        </div>
      )}
      {editor && (
        <Panel
          title={editor.id ? "Editar conta" : "Nova conta"}
          description="Os dados são sincronizados para a conta do negócio."
          className="editor-panel"
        >
          <form className="form-stack" onSubmit={submit}>
            <div className="form-grid">
              <Field label="Fornecedor / favorecido">
                <input
                  required
                  maxLength={120}
                  value={editor.supplier}
                  onChange={(event) =>
                    setEditor({ ...editor, supplier: event.target.value })
                  }
                />
              </Field>
              <Field label="Descrição">
                <input
                  maxLength={160}
                  value={editor.description}
                  onChange={(event) => {
                    const description = event.target.value;
                    const installment = parseInstallment(description);
                    setEditor((current) => ({
                      ...current,
                      description,
                      ...(installment
                        ? {
                            installmentCurrent: String(installment.current),
                            installmentTotal: String(installment.total),
                            ...(isInstallmentPayment(description)
                              ? { category: "Empréstimos" }
                              : {}),
                          }
                        : {}),
                    }));
                  }}
                />
              </Field>
              <Field label="Categoria">
                <select
                  value={editor.category}
                  onChange={(event) =>
                    setEditor({ ...editor, category: event.target.value })
                  }
                >
                  {[
                    "Fornecedor",
                    "Empréstimos",
                    "Aluguel",
                    "Contas e serviços",
                    "Impostos",
                    "Folha e pró-labore",
                    "Outros",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </Field>
              <Field label="Natureza do custo">
                <select
                  value={editor.costType || "variavel"}
                  onChange={(event) =>
                    setEditor({ ...editor, costType: event.target.value })
                  }
                >
                  <option value="fixo">Fixo</option>
                  <option value="variavel">Variável</option>
                </select>
              </Field>
              <Field label="Parcela atual">
                <input
                  type="number"
                  min="1"
                  max={editor.installmentTotal || undefined}
                  step="1"
                  inputMode="numeric"
                  placeholder="Ex.: 1"
                  value={editor.installmentCurrent || ""}
                  onChange={(event) =>
                    setEditor({ ...editor, installmentCurrent: event.target.value })
                  }
                />
              </Field>
              <Field label="Total de parcelas">
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder="Ex.: 16"
                  value={editor.installmentTotal || ""}
                  onChange={(event) =>
                    setEditor({ ...editor, installmentTotal: event.target.value })
                  }
                />
              </Field>
              <Field label="Valor">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={editor.amount}
                  onChange={(event) =>
                    setEditor({ ...editor, amount: event.target.value })
                  }
                />
              </Field>
              <Field label="Vencimento">
                <input
                  type="date"
                  required
                  value={editor.dueDate}
                  onChange={(event) =>
                    setEditor({ ...editor, dueDate: event.target.value })
                  }
                />
              </Field>
              <Field label="Observações">
                <input
                  value={editor.notes || ""}
                  onChange={(event) =>
                    setEditor({ ...editor, notes: event.target.value })
                  }
                />
              </Field>
              <Field label="Status">
                <select
                  value={editor.paid ? "paid" : "open"}
                  onChange={(event) =>
                    setEditor({
                      ...editor,
                      paid: event.target.value === "paid",
                      paidAt:
                        event.target.value === "paid"
                          ? editor.paidAt || new Date().toISOString()
                          : null,
                    })
                  }
                >
                  <option value="open">Em aberto</option>
                  <option value="paid">Paga</option>
                </select>
              </Field>
            </div>
            <FormActions
              onCancel={() => setEditor(null)}
              submitLabel="Salvar conta"
            />
          </form>
        </Panel>
      )}
      <Panel
        title="Obrigações"
        description="Pesquise por fornecedor e alterne entre contas abertas e pagas."
      >
        <div className="toolbar-row">
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Buscar contas"
              placeholder="Buscar fornecedor ou descrição"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="segmented-control">
            <button
              className={filter === "open" ? "selected" : ""}
              onClick={() => setFilter("open")}
            >
              Em aberto
            </button>
            <button
              className={filter === "paid" ? "selected" : ""}
              onClick={() => setFilter("paid")}
            >
              Pagas
            </button>
            <button
              className={filter === "all" ? "selected" : ""}
              onClick={() => setFilter("all")}
            >
              Todas
            </button>
          </div>
        </div>
        <DataTable
          rows={filtered}
          emptyTitle="Nenhuma conta encontrada"
          emptyDescription="Adicione uma obrigação ou ajuste a busca."
          columns={[
            {
              key: "supplier",
              label: "Favorecido",
              render: (row) => (
                <span className="cell-stack">
                  <strong>{row.supplier || row.description}</strong>
                  <small>{row.description || row.category}</small>
                </span>
              ),
            },
            { key: "category", label: "Categoria" },
            {
              key: "installments",
              label: "Parcelas",
              render: (row) => {
                const progress = getInstallmentProgress(row);
                return progress ? (
                  <span className="installment-cell">
                    <span>{progress.current}/{progress.total}</span>
                    <span
                      className="installment-track"
                      role="progressbar"
                      aria-label={`Progresso das parcelas: ${progress.completed} de ${progress.total} pagas`}
                      aria-valuemin="0"
                      aria-valuemax={progress.total}
                      aria-valuenow={progress.completed}
                    >
                      <span style={{ width: `${progress.percentage}%` }} />
                    </span>
                    <small>{progress.remaining} restante(s)</small>
                  </span>
                ) : (
                  "—"
                );
              },
            },
            {
              key: "dueDate",
              label: "Vencimento",
              render: (row) => formatDate(row.dueDate),
            },
            {
              key: "amount",
              label: "Valor",
              numeric: true,
              render: (row) => formatCurrency(row.amount),
            },
            {
              key: "paid",
              label: "Status",
              render: (row) => (
                <span
                  className={`status-tag ${row.paid ? "positive" : row.dueDate < new Date().toISOString().slice(0, 10) ? "negative" : "warning"}`}
                >
                  {row.paid
                    ? "Paga"
                    : row.dueDate < new Date().toISOString().slice(0, 10)
                      ? "Vencida"
                      : "Em aberto"}
                </span>
              ),
            },
            {
              key: "actions",
              label: "",
              render: (row) => (
                <span className="row-actions">
                  <button
                    className="icon-button"
                    title={row.paid ? "Reabrir conta" : "Marcar como paga"}
                    aria-label={row.paid ? "Reabrir conta" : "Marcar como paga"}
                    onClick={() => togglePaid(row)}
                  >
                    <Check size={16} />
                  </button>
                  <button
                    className="button button-quiet button-small"
                    onClick={() =>
                      setEditor({ ...row, amount: String(row.amount) })
                    }
                  >
                    Editar
                  </button>
                  <button
                    className="button button-quiet button-small danger-text"
                    onClick={() => remove(row)}
                  >
                    Excluir
                  </button>
                </span>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
