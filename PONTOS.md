# Sistema de pontos

Situação em **13/10/2026**: implementado. Falta aplicar a migration [`0034_pontos.sql`](db/migrations/0034_pontos.sql) no Neon; sem ela nada quebra, mas nenhum ponto é contado.

## Decisões tomadas

- **Os pontos só se acumulam.** Ainda não são trocados por créditos nem por nada. A troca pode ser ligada depois.
- **Créditos gastos rendem 1 ponto por crédito.** Estorno e reembolso tiram os pontos que aquele gasto rendeu.
- **Check-in por botão**, no indicador da barra do topo.
- **Em teste, só admin** ([lib/em-teste.ts](lib/em-teste.ts), recurso `pontos`): fechado, só as contas admin veem o indicador, fazem check-in e abrem a página. **Os pontos já contam para todas as contas** (créditos gastos, primeiros passos, posts e indicação) e aparecem quando o recurso for liberado na área admin → Em teste.

## Check-in diário

Um a cada 24 horas, contadas do momento do clique: depois do check-in, o botão vira uma contagem regressiva de 24 horas até o próximo. O ciclo tem 7 dias e recomeça. A sequência se mantém se o próximo check-in vier em até 48 horas depois do anterior (24 de espera mais 24 de folga); passando disso, volta para o dia 1.

| Dia    | 1 | 2 | 3  | 4  | 5  | 6  | 7  |
| ------ | - | - | -- | -- | -- | -- | -- |
| Pontos | 5 | 5 | 10 | 10 | 15 | 15 | 40 |

São 100 pontos por semana.

## O que dá pontos

### Recorrentes

| Ação                                | Pontos        | Limite                             |
| ----------------------------------- | ------------- | ---------------------------------- |
| Check-in diário                     | 5 a 40        | 1 a cada 24 horas                  |
| Créditos gastos em qualquer geração | 1 por crédito | Sem limite; estorno tira os pontos |
| Post publicado nas redes            | 10            | 3 por dia                          |
| Indicado assina um plano            | 1.000         | Uma vez por indicado               |

### Uma vez por conta (primeiros passos)

| Ação                                     | Pontos | Quando conta                                                   |
| ---------------------------------------- | ------ | -------------------------------------------------------------- |
| Completar a ficha do primeiro personagem | 50     | Personagem salvo com nome e uma referência de imagem           |
| Gerar a primeira imagem                  | 30     | Imagem gerada com sucesso                                      |
| Criar o primeiro vídeo                   | 50     | Vídeo gerado pronto (troca, criado, falado, legenda com IA)    |
| Criar a voz do personagem                | 50     | Voz criada ou clonada                                          |
| Conectar a primeira rede social          | 50     | Ao abrir Estúdio → Publicar com uma conta conectada            |
| Publicar o primeiro post                 | 100    | Post confirmado como publicado pela rede                       |
| Treinar a primeira persona               | 100    | Treino concluído                                               |
| Assinar um plano pela primeira vez       | 500    | Compra de plano paga (plano liberado à mão pelo admin não conta) |

### Regras por trás dos valores

- Nada gratuito e repetível rende pontos (editar ficha, exportar, ações manuais).
- Geração que falhou e foi estornada não fica com os pontos.
- Indicação só pontua quando o indicado assina um plano, porque cadastro é fácil de falsificar.

## Onde aparece

- **Barra do topo:** o saldo de pontos, com um sinal quando o check-in do dia está disponível. Clicar abre os 7 dias e o botão de check-in.
- **Página `/app/pontos`:** saldo, check-in e duas abas: **Ganhar** (o que rende pontos e os primeiros passos, com o que já foi feito) e **Histórico** (os últimos 50 lançamentos).

## Como funciona por dentro

- **Valores e regras:** [lib/pontos.ts](lib/pontos.ts), compartilhado entre a tela e o servidor. Para mudar um valor, é ali.
- **Banco e lançamentos:** [lib/pontos-server.ts](lib/pontos-server.ts), tabelas `pontos_conta` (saldo e sequência do check-in) e `pontos_mov` (histórico). Cada coisa que só pontua uma vez tem uma chave única por conta.
- **Créditos gastos:** o ponto entra junto do débito e sai junto do estorno, em [lib/creditos.ts](lib/creditos.ts). O mint do NFT debita por outro caminho e ainda não rende pontos.
- **Nunca derruba a ação:** se o ponto não puder ser lançado, a geração, o pagamento ou o post seguem normalmente.
- **Testes:** [lib/pontos.test.ts](lib/pontos.test.ts), com banco de verdade (PGlite).

## Fica para depois

- Trocar pontos por créditos (a proposta original era 10 pontos = 1 crédito, com teto de 50 créditos por mês no plano grátis).
- Ranking entre contas e níveis por total de pontos.
- Pontos por marcas de views, curtidas e afins: dependem da área de métricas do NFT, que ainda está em teste.
