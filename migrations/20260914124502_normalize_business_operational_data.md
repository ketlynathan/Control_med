# Migração `normalize_business_operational_data`

Aplicada no Supabase `Control box` em 14/09/2026.

## Estratégia de segurança

A migração foi **aditiva**: não removeu, alterou ou apagou `businesses`, `business_state` ou qualquer registro histórico. A tabela `business_state` permanece como fonte legada e de compatibilidade.

Os dados foram copiados com `ON CONFLICT DO NOTHING`, preservando identificadores legados em `legacy_id` e o registro original em `source_record` (`jsonb`). A migração pode ser reaplicada sem duplicar registros.

## Tabelas normalizadas

- `business_profiles`: dados cadastrais do negócio.
- `collaborators`: colaboradores e códigos de fechamento.
- `cash_registers`: caixas.
- `financial_transactions`: movimentações financeiras.
- `attachments`: notas fiscais, imagens e PDFs anexados aos lançamentos.
- `cash_openings`: fundos de caixa.
- `cash_closings`: fechamentos de caixa.
- `cash_closing_expenses`: despesas detalhadas dos fechamentos.
- `payable_accounts`: contas a pagar.
- `pharmacy_products`: produtos/estoque da drogaria.
- `convenio_entries`: retiradas do convênio.
- `cash_audit_log`: auditoria de alterações nos fechamentos.

## Estado da migração

A estrutura foi criada e o histórico disponível foi copiado. A aplicação ainda mantém o fluxo legado para evitar uma troca abrupta; a próxima etapa é migrar a API para leitura e escrita dual, validar os relatórios e somente depois tornar as tabelas normalizadas a fonte principal.

A tabela `payable_accounts` foi criada, mas recebeu zero registros porque o estado atualmente salvo em `business_state` não continha contas a pagar no momento da migração. Os demais registros históricos foram preservados e copiados.

## Contagens verificadas após a migração

| Tabela | Registros |
|---|---:|
| `business_profiles` | 3 |
| `collaborators` | 4 |
| `cash_registers` | 4 |
| `attachments` | 6 |
| `financial_transactions` | 6 |
| `cash_openings` | 4 |
| `cash_closings` | 9 |
| `cash_closing_expenses` | 29 |
| `payable_accounts` | 0 |
| `pharmacy_products` | 43 |
| `convenio_entries` | 5 |
| `cash_audit_log` | 4 |

A migração **não deve ser revertida com `DROP TABLE`**, pois as novas tabelas constituem a camada histórica normalizada.
