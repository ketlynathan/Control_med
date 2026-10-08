# Plano de migração da API para o modelo normalizado

## Objetivo

Permitir que a aplicação deixe de depender do JSON completo em `business_state` sem apagar histórico e sem quebrar usuários existentes.

## Regra de segurança
Durante toda a migração, `business_state` permanece preservado como legado, backup lógico e plano de rollback. Nenhuma tabela será apagada e nenhum registro será removido automaticamente.

## Migração estrutural aditiva

A estrutura normalizada já está aplicada no Supabase `Control box` pela migração `20260914124502_normalize_business_operational_data`. O SQL [`20261008101500_add_normalized_tables.sql`](./20261008101500_add_normalized_tables.sql) permanece como referência histórica do desenho inicial, mas **não deve ser executado novamente no banco atual**, pois o schema real já existe e possui colunas diferentes.

As próximas alterações devem usar o schema real verificado no banco. A cópia do legado para as tabelas normalizadas é uma etapa separada, auditável e reaplicável.

## Fases

### Fase 1 — leitura dual e validação

- API continua lendo `business_state`.
- Criar funções de leitura nas tabelas normalizadas.
- Usar `src/migration/integrity-comparator.js` para comparar contagens, IDs e valores.
- Registrar divergências por `business_id`.

### Verificação atual do banco

A primeira verificação somente leitura encontrou divergências que bloqueiam a troca da fonte:

- um negócio possui 8 lançamentos legados e 4 normalizados;
- o mesmo negócio possui 34 fechamentos legados e 9 normalizados;
- existem 28 aberturas legadas e 4 normalizadas;
- existem 22 registros de convênio legados e 5 normalizados;
- em 6 lançamentos normalizados, 3 valores estão multiplicados por 100, 2 coincidem e 1 possui outra divergência;
- `payable_accounts` possui zero registros.

Enquanto essas divergências existirem, `business_state` continua sendo a fonte principal. Nenhuma correção automática de valores ou registros deve ser feita sem uma reconciliação por `legacy_id`.

### Fase 2 — escrita dual

Toda alteração autenticada grava:

1. `business_state`, para compatibilidade imediata.
2. Tabela normalizada correspondente, usando `legacy_id` e `ON CONFLICT DO UPDATE`.

Exemplos:

- Lançamento → `financial_transactions`.
- Anexo → `attachments`.
- Fechamento → `cash_closings` e `cash_closing_expenses`.
- Conta a pagar → `payable_accounts`.
- Produto → `pharmacy_products`.
- Convênio → `convenio_entries`.

### Fase 3 — relatórios pela fonte normalizada

- Analíticos lê `financial_transactions`, `cash_closings`, `cash_closing_expenses` e `payable_accounts`.
- Relatórios gerenciais usam agregações SQL por categoria, período, caixa e colaborador.
- Anexos deixam de ser carregados em todas as respostas de estado; serão buscados sob demanda.

### Fase 4 — leitura primária normalizada

Após validação de pelo menos um ciclo operacional completo:

- API passa a ler as tabelas normalizadas.
- `business_state` continua recebendo uma projeção de compatibilidade temporária.
- Ativar métricas de divergência e logs de sincronização.

### Fase 5 — retenção legada

- Manter `business_state` como histórico/backup por período definido.
- Só considerar arquivamento após backup externo, validação e aprovação explícita.
- Não executar `DROP`, `DELETE` em massa ou migração destrutiva.

## Contratos sugeridos da API

- `GET /api/analytics` — filtros de período, usuário, caixa, módulo, tipo e categoria.
- `GET /api/transactions` — paginação, sem carregar anexos por padrão.
- `GET /api/transactions/:id/attachment` — anexo sob demanda.
- `GET /api/payables/aging` — aging e parcelamentos.
- `GET /api/reports/management` — despesas por categoria e indicadores gerenciais.

## Critérios de aceite

- Totais do Caixa não misturam Lançamentos.
- Vendas de dois turnos são somadas por data e detalhadas por caixa.
- Saídas do Caixa geral não reduzem automaticamente o dinheiro contado de um turno.
- Nenhum total muda ao alternar entre a fonte legada e normalizada.
- Falha na tabela nova não impede o backup legado durante a transição.
- Todas as escritas são idempotentes por `business_id + legacy_id`.
