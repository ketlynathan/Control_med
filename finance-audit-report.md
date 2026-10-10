# Relatório de reconciliação financeira — Caixa separado dos demais módulos

**Projeto:** Control_med / Fluxo de Caixa  
**Data:** 26/09/2026  
**Fonte de valores:** `business_state.state` no Supabase (estado JSON ativo).  
**Versão observada:** `xmin=1776` na última leitura. O estado mudou durante a auditoria; os valores abaixo são a fotografia mais recente consultada.  
**Regra aprovada pela usuária:** o módulo **Caixa** contém somente fechamentos, fundos e despesas registradas nele. **Lançamentos, Contas a pagar, Estoque e Convênio não alteram os totais nem o histórico da tela Caixa.**

## Resumo executivo

A aba **Caixa** foi ajustada para exibir somente os dados desse módulo: total de entradas dos fechamentos, total de despesas próprias, saldo aritmético `entradas − despesas` e último fundo. Removi da tela Caixa o resumo por usuário de Lançamentos e o antigo histórico consolidado que misturava Lançamentos com fechamentos.

A aba **Analíticos** conserva a comparação entre módulos, mas exibe origens, resumos por dia/usuário, categorias e gráficos em linhas/colunas separadas. Um candidato a duplicidade continua visível e sinalizado; não apaga, oculta nem subtrai registros de uma origem com base em semelhança.

## Antes vs. depois

| Indicador | Antes | Depois |
|---|---|---|
| Cards e totais da aba Caixa | O resumo do ledger podia incluir valores de Lançamentos na mesma soma do fechamento. | Somente `cash_closings` e despesas associadas aos fechamentos; fundos são apresentados separadamente. Nenhum total de Lançamentos é incluído. |
| Página Caixa | Exibia resumo por usuário e histórico consolidado de movimentos de Caixa e Lançamentos. | Exibe apenas cartões de Caixa, formulário/histórico de fechamentos, fundos e auditoria de Caixa. |
| Esperado físico | O recálculo podia incluir linhas de Lançamentos com mesmo caixa/data. | Usa contagem anterior do mesmo caixa, fundo adicional somente quando confirmado, recebimento em espécie reportado no fechamento e despesa do fechamento identificada como dinheiro. PIX/débito/crédito não são numerário contado. |
| Analíticos | Totais/categorias/gráficos podiam ser lidos como um fluxo combinado. | Caixa e Lançamentos separados em comparação, resumo diário/usuário, categorias e séries de gráfico. Estoque, Contas e Convênio continuam como métricas próprias e não entram no saldo de Caixa. |
| Histórico | Despesas detalhadas e dados legados podiam ser misturados a registros externos ou perder contexto de origem. | Mantém arrays, IDs, valores, detalhes e esperados originais. Metadados de classificação ficam aditivos e com trilha de confirmação; o ledger é derivado e traz vínculo com a origem. |

## Totais reais consultados — origens não combinadas

A soma das entradas por Pix, débito, crédito e dinheiro coincide exatamente com `entryTotal`: **R$ 9.355,66**, sem residual não classificado. A soma dos 83 itens de despesas coincide com `exitTotal`: **R$ 4.152,65**, diferença **R$ 0,00**.


| Origem | Registros | Valor observado | Uso no sistema |
|---|---:|---:|---|
| **Caixa — entradas em fechamentos** | 23 fechamentos (22 históricos + 26/09) | **R$ 9.355,66** | Total de entradas próprio do Caixa (vendas/recebimentos informados nos fechamentos, por todos os meios). |
| Pix (Caixa) | 23 fechamentos | R$ 3.062,12 | Subtotal de entradas por meio. |
| Débito (Caixa) | 23 fechamentos | R$ 2.564,56 | Subtotal de entradas por meio. |
| Crédito (Caixa) | 23 fechamentos | R$ 616,97 | Subtotal de entradas por meio. |
| Dinheiro (Caixa) | 23 fechamentos | R$ 3.112,01 | Subtotal de entradas em espécie informadas. |
| **Caixa — despesas dos fechamentos** | 83 itens no total | **R$ 4.152,65** | Soma dos detalhes; coincide exatamente com a soma do `exitTotal` gravado nos 23 fechamentos. |
| Saldo aritmético do Caixa | — | **R$ 5.203,01** | `R$ 9.355,66 − R$ 4.152,65`; não é saldo físico contado, porque as entradas incluem Pix/cartões. |
| **Lançamentos — entradas diretas** | 0 | R$ 0,00 | Permanece em Lançamentos, nunca incorporado ao Caixa. |
| **Lançamentos — saídas diretas** | 8 | **R$ 4.166,39** | Permanece exclusivamente no módulo Lançamentos; não altera total de saídas, saldo ou esperado físico do Caixa. |
| Fundos de Caixa | 16 eventos | R$ 1.387,25 | Eventos de abertura exibidos separadamente; não somados cumulativamente como receita. O fundo de 26/09 é R$ 115,75 e ainda precisa ser classificado como reforço ou valor já refletido na base. |
| Caixa — última contagem por caixa | Caixa 1: 26/09; Caixa 2: 25/09 | Caixa 1: R$ 264,50; Caixa 2: R$ 230,00 | O fechamento de 26/09 é o mais recente do Caixa 1; o valor não afirma saldo atual após esse turno. |
| Contas a pagar | 11 contas | 5 pagas: R$ 1.606,00; 6 abertas: R$ 3.060,00 | Métrica própria, não entra no Caixa. |
| Estoque | 43 produtos | 40 no/abaixo do mínimo; 0/43 com custo cadastrado | Valor do inventário não estimável; não entra no Caixa. |
| Convênio | 22 retiradas | R$ 333,91 | Retiradas registradas; o módulo não tem estado pago/recebido. Não tratar como dinheiro recebido nem incluir no Caixa. |

## Fechamento confirmado pela usuária — 26/09/2026

O registro fornecido foi localizado na fonte de produção: Caixa 01, Dra. Suelem, entrada R$ 418,18 (Pix R$ 127,99; débito R$ 133,45; crédito R$ 7,99; dinheiro R$ 148,75), duas despesas detalhadas (Compras chiclete R$ 15,00 e Almoço R$ 20,00), total de saídas R$ 35,00, esperado original R$ 228,50, contado R$ 264,50 e diferença +R$ 36,00. O usuário e os valores foram mantidos como informados. Este fechamento é o 23º ativo e está incluído nos números acima; não foi apagado nem regravado.

Há um fundo de abertura de R$ 115,75 na manhã de 26/09. A última contagem anterior do Caixa 01 era R$ 114,75 em 24/09. O esperado salvo de R$ 228,50 corresponde a `R$ 114,75 + R$ 148,75 − R$ 35,00`, assumindo ambas as despesas como espécie e sem acrescentar o fundo de R$ 115,75. Como o método das despesas de R$ 15,00 e R$ 20,00 ainda não foi confirmado, o domínio subtrai **R$ 0,00 confirmado em espécie** e mostra esperado físico provisório de **R$ 263,50**, contado de R$ 264,50 e diferença provisória **+R$ 1,00**. O fundo permanece pendente. Se a usuária confirmar ambas como dinheiro, o esperado proposto volta a R$ 228,50; nada foi sobrescrito.

## Fechamento crítico de 21/09/2026

Registro original preservado: Caixa 1; entradas R$ 312,74 (Pix R$ 120,99, débito R$ 54,00, crédito R$ 92,00 e dinheiro R$ 45,75); despesas R$ 1.779,99 em nove itens; contado R$ 21,75; esperado salvo originalmente **−R$ 1.651,49**.

A usuária confirmou que **“Compras (multirão), R$ 1.145,00”** foi paga com dinheiro do caixa. O metadado foi salvo no banco como `cash` para o item `closing-expense:id-mubyrqfj-u3q9ae:5`, com motivo e timestamp. Ela também confirmou que o fundo de 22/09 de **R$ 21,75** é o mesmo saldo contado em 21/09; o evento `id-muddqy42-u5iqib` está marcado `carry-forward` e **não é contado de novo**.

**Recálculo de conferência, ainda provisório:**

`última contagem anterior confirmada (19/09) R$ 153,75 + espécie recebida em 21/09 R$ 45,75 − compra confirmada em espécie R$ 1.145,00 = esperado provisório −R$ 945,50`.

Com o contado original de R$ 21,75, a diferença proposta é **+R$ 967,25** (`contado − esperado provisório`). Este recálculo **não foi gravado sobre o fechamento original**, pois oito despesas totalizando R$ 634,99 ainda não têm método confirmado e fundos registrados em 20/09 (R$ 100,00) e 21/09 (R$ 82,75) ainda não foram classificados como aporte novo ou valor já incluído na contagem. A interface os marca como pendências. O cartão “total de despesas do Caixa” continua contando as nove despesas, pois todas pertencem ao registro do Caixa, independentemente de a forma ter sido dinheiro ou Pix.

## Fonte central e sincronização

O estado original dos módulos continua preservado. O domínio produz `financialMovements` como uma projeção com ID, data, tipo, valor em centavos, origem, módulo e vínculos para fechamento/lançamento; o endpoint autenticado `/api/state` recalcula a projeção na leitura e antes de cada gravação. A gravação continua atômica no JSONB existente e protegida por compare-and-swap de `xmin`, preservando detecção de conflito entre dispositivos.

**Limite importante:** as tabelas relacionais normalizadas já existentes não são a fonte ativa da interface e não foram atualizadas nesta mudança. A consulta atual mostrou **9 fechamentos e 29 itens de despesa** nessas tabelas, enquanto o JSON ativo tinha 22 históricos e passou a **23 fechamentos**, após a inclusão do fechamento de 26/09. Não fiz backfill dessas tabelas porque substituir/inserir dados sem uma migração idempotente e trilha apropriada poderia criar cópias ou apagar proveniência. O JSON ativo segue como fonte autoritativa até uma migração relacional versionada, revisada e reconciliada.

## Integridade e riscos remanescentes

- 8 dos 22 fechamentos históricos têm esperado original negativo, somando −R$ 2.121,37; o 23º fechamento (26/09) tem esperado original positivo. Permanecem preservados; o painel apresenta original e recálculo separadamente.
- As 15 aberturas restantes não têm origem classificada; só o fundo de 22/09 foi confirmado como carregamento. Nenhuma abertura desconhecida foi presumida como aporte novo.
- A coincidência potencial entre lançamento e despesa de fechamento é alerta de revisão, não prova de identidade. Nenhum par foi apagado nem vinculado automaticamente.
- A soma de entradas do Caixa abrange todos os meios e não é uma contagem de espécie. Para o esperado físico, só dinheiro identificado entra.
- O recálculo histórico depende de método de pagamento e proveniência dos fundos. Não substituir os esperados/diferenças originais até classificar as pendências.
- O fechamento de 26/09 já existe no JSON ativo e foi incluído nos totais; suas despesas de R$ 35,00 têm método de pagamento não informado. Por isso o esperado recalculado fica provisório em R$ 263,50 (diferença +R$ 1,00), enquanto o valor salvo de R$ 228,50 pressupõe que ambos os itens foram pagos em espécie.
- Código integrado pelo PR [#7](https://github.com/ketlynathan/Control_med/pull/7), commit de merge `660cb915a2ff19ff12b0d6189a6faedb7bf01e99`. A implantação Vercel de produção desse commit concluiu com sucesso; URL: https://control-49i2lm14z-forme10.vercel.app. Homepage respondeu HTTP 200 e `/api/state` sem sessão respondeu HTTP 401. A API recalcula a projeção central na leitura e antes de cada gravação. A migração das tabelas normalizadas não está incluída nesta versão.

## Validação técnica

- `npm run check`: **20 testes passaram**, incluindo isolamento de Lançamentos nos cards da página inicial e da aba Caixa, recálculo físico de 21/09, projeção canônica na API e conflito otimista `xmin`.
- Chromium headless com estado sintético autenticado verificou o registro de Caixa e suas despesas, ausência de valores/descrições do módulo Lançamentos na tela Caixa e ausência de erros JavaScript.
- `npm run build`, `node --check` do JavaScript inline e `git diff --check`: passaram.
- A prévia HTTP local e pública retornou HTTP 200. Chromium headless renderizou a tela de autenticação e, separadamente, executou o QA com estado sintético local; nenhuma sessão real autenticada de produção foi usada.
- Nenhum fechamento, lançamento, conta, produto ou registro de Convênio foi removido ou teve valor original alterado. A ação de apagar fechamento também foi removida da tela e seu listener desativado. As duas classificações confirmadas foram adicionadas como metadados de reconciliação, auditados no estado JSON.

## Próximas verificações recomendadas

1. Classificar as oito despesas restantes de 21/09 e os fundos pendentes apenas após conferir comprovantes/contagem.
2. Validar o esperado físico recalculado com a contagem real do responsável pelo Caixa 1 antes de substituir qualquer valor original.
3. Preparar migração aditiva/idempotente das tabelas normalizadas, com backup e reconciliação por ID — incluindo reconciliação da lacuna 9/22 e 29/81 — antes de declarar aquelas tabelas uma fonte de verdade.
4. Validar a sincronização com dois dispositivos autenticados, sem sobrescrever qualquer estado em conflito.


## Complemento de auditoria — fotografia real de 08/10/2026

**Fonte:** projeto Supabase ativo “Control box”, estado JSON do negócio `DROGARIA CARVALHE`; fotografia consultada em 08/10/2026 às 22:09 UTC. Consulta somente de leitura, agregada, sem alterar registros. A fonte ativa tinha 34 fechamentos, 14 contas a pagar e ciclo selecionado `2026-10`.

### Verificação de ciclos 06–05

| Ciclo | Fechamentos | Entradas do Caixa | Saídas detalhadas do Caixa | Saldo operacional | Contas pagas | Qtd. pagas |
|---|---:|---:|---:|---:|---:|---:|
| 06/10/2026 a 05/11/2026 | 2 | R$ 1.408,87 | R$ 942,00 | R$ 466,87 | R$ 0,00 | 0 |
| 06/09/2026 a 05/10/2026 | 31 | R$ 14.023,91 | R$ 5.909,65 | R$ 8.114,26 | R$ 5.473,59 | 8 |
| 06/08/2026 a 05/09/2026 | 1 | R$ 157,00 | R$ 41,00 | R$ 116,00 | R$ 0,00 | 0 |

No ciclo 06/10–05/11, os 2 fechamentos somam Pix R$ 869,92, débito R$ 326,95, crédito R$ 0,00 e dinheiro R$ 212,00; soma dos meios R$ 1.408,87, sem diferença. As 10 despesas detalhadas totalizam R$ 942,00: Alimentação R$ 13,00; Transporte R$ 40,00; Medicamentos R$ 220,00; Outros / Não classificado R$ 669,00. Soma das categorias = total de saídas.

### Contas a Pagar por categoria (todos os registros)

| Categoria | Qtd. | Total cadastrado | Total pago | Qtd. pagas | Pendente |
|---|---:|---:|---:|---:|---:|
| Aluguel | 1 | R$ 1.700,00 | R$ 1.700,00 | 1 | R$ 0,00 |
| Contas e serviços | 10 | R$ 4.818,04 | R$ 3.427,59 | 5 | R$ 1.390,45 |
| Empréstimos | 1 | R$ 1.300,00 | R$ 0,00 | 0 | R$ 1.300,00 |
| Fornecedor | 2 | R$ 346,00 | R$ 346,00 | 2 | R$ 0,00 |
| **Total geral** | **14** | **R$ 8.164,04** | **R$ 5.473,59** | **8** | **R$ 2.690,45** |

### Observações de integridade e segurança

- O relatório de ciclo usa entradas e despesas dos fechamentos, sem fundos nem transações manuais. O saldo do Caixa é distinto do resultado líquido, que também deduz contas efetivamente pagas; pagamentos só deixam de ser deduzidos como uma segunda despesa quando há vínculo explícito confirmado por igualdade exata de valor.
- As contas pagas antigas sem `paidAt` usam o vencimento como data de referência do ciclo. A interface deixa essa regra explícita; não infere datas de pagamento ausentes.
- **Hardening pendente no Supabase:** as 14 tabelas `public` do projeto ativo estavam com Row Level Security (RLS) desabilitado. Uma checagem agregada adicional confirmou privilégios `SELECT` em 0/14 tabelas para `anon` e 0/14 para `authenticated`; `service_role` tem acesso às 14, conforme esperado para o backend. Não encontrei concessões `PUBLIC` na visão de privilégios consultada. Assim, não há evidência de leitura direta via esses dois papéis no momento da inspeção, mas a ausência de RLS continua sendo uma proteção importante a habilitar com políticas compatíveis, após teste controlado. Nenhuma permissão foi alterada.


## Fechamento da implementação — 09/10/2026

- Removidas as páginas, rotas de navegação, formulários/modais e atalhos visíveis de Lançamentos e Conciliação. Dados `transactions` e outros campos legados seguem preservados no estado local/remoto e no ledger; a tela e o relatório do Caixa não os consultam. Rotas antigas salvas em `currentPage` retornam à Visão geral após carregamento local ou remoto.
- Caixa e Relatórios usam o período selecionado pelo seletor global, com limites gerados pelo `AccountingPeriod` (06–05; respeita o primeiro ciclo configurado). Dashboard preserva resumo por dia recolhido e adiciona resumo por responsável.
- Adicionada edição de fechamentos históricos mediante código do colaborador e motivo obrigatório; cada alteração guarda snapshot anterior/posterior no `auditLog`. Removido o botão de exclusão de fechamento; nenhum registro histórico foi apagado.
- Contas a Pagar exibe separadamente quantidade, total cadastrado, pago e pendente, com linhas por categoria. Relatórios exibem despesas do Caixa em quatro categorias, meios de entrada, resultado líquido com deduplicação apenas por vínculo explícito, e comparativo entre ciclos.
- Validação: `npm run build` concluído; `npm run check` passou em 43/43 testes; sintaxe JavaScript embutida válida; smoke test no Chromium autenticado com estado sintético passou sem exceções e confirmou rotas removidas, relatórios renderizados e movimento legado ausente do Caixa.
- O smoke test foi isolado e descartável; a validação SQL foi somente leitura. Nenhum lançamento, conta, fechamento, anexo, auditoria ou configuração de produção foi alterado pela validação.
- **Status de publicação:** implementação pronta para revisão no branch de trabalho; merge na `main`/deploy de produção fica separado para confirmação explícita após a revisão do PR.
