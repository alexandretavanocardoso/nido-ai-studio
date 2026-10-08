# O que falta

Situação em **07/10/2026**. Esta é a lista atual; a seção "Status e pendências" do [TECNICO.md](TECNICO.md) é o histórico de 06/10 e tem itens que já foram resolvidos.

Ordem: o que mais trava primeiro.

## 1. Troca de pessoa em vídeo (o ponto mais fraco hoje)

A versão no código usa Kling O1 **Pro** + quadro de referência + close do rosto + descrição das outras pessoas ([lib/video/troca.ts](lib/video/troca.ts), [lib/video/ancora.ts](lib/video/ancora.ts)). Na amostra de 10s ficou perto de 7 de 10. O objetivo é 10 de 10.

**Ainda não foi feito**

- [ ] **Gerar o vídeo completo de 30s** com a versão nova. Só 10 dos 30 segundos foram testados; as emendas em 10s e 20s e a passagem da outra pessoa em 26s nunca foram vistas. Custa 510 créditos pelo app.
- [ ] **Emenda com continuidade.** Hoje cada trecho de 10s é gerado sozinho e há um tranco na emenda (pose e paletó mudam de um quadro para o outro). Plano: gerar os trechos em sequência, cada um recebendo o último quadro do anterior como ponto de partida, com meio segundo de sobreposição e transição suave. Fica mais lento (um trecho por vez). **Não implementado nem testado.**
- [ ] **Corpo de referência com a luz da cena.** O personagem tem cara de "recorte" porque a imagem dele é um render de estúdio. Plano: usar como referência o personagem recortado do quadro de referência, já com a luz do vídeo. **Não implementado nem testado.**
- [ ] **Opção "manter a roupa do vídeo".** Existe na troca em foto, não existe na troca em vídeo (hoje o personagem sempre entra com a própria roupa).

**Defeitos conhecidos sem solução garantida** (limite do modelo)

- Mãos borradas ou com dedos deformados em movimento rápido.
- O volume do corpo e o formato do bigode variam um pouco ao longo do vídeo.
- Chapéus e acessórios grandes mudam de formato e às vezes "flutuam".
- A roupa das outras pessoas pode mudar de cor (blusa rosa virou branca no teste).
- Os gestos seguem o original de perto, mas não ficam idênticos.

**Para chegar mais perto do 10, também ajuda**

- Usar uma imagem do personagem em estilo **Realista**, de corpo inteiro e de frente (render 3D de estúdio se integra pior em vídeo de celular).
- Marcar a pessoa no vídeo num quadro em que o rosto aparece bem.

**Sobre custo de teste:** cada trecho de 5s no Kling Pro custa cerca de US$ 0,85. Validar as duas melhorias acima custa em torno de US$ 2. Nenhum teste pago deve rodar sem autorização.

**Outros motores:** o Seedance 2.5 (Premium) dá o melhor resultado, mas recusa vídeos com rosto real. O Wan 2.2 foi descartado em dois testes (borra o rosto e perde o personagem).

## Radar (novo em 07/10)

O Radar está no ar em Estúdio → Radar: o Claude Haiku 4.5 pesquisa as notícias pela busca na web, o Sonnet refaz as notas com rigor e marca conteúdo promocional; há ideia de post, sino de avisos na barra e tarefa diária às 6h de Brasília. Custo medido: US$ 0,074 por radar; cobra 8 créditos. A página de planos já lista o custo.

- [ ] **Parte do X (Grok) — testada de ponta a ponta em 07/10:** radar completo com 3 temas custou **US$ 0,165** (xAI US$ 0,087 + Anthropic US$ 0,078) e cobra 26 créditos. Usa `grok-4.3`, uma busca por tema, no máximo 3 temas no X. Falta: trocar `XAI_MODEL` para `grok-4.3` na Vercel (ou apagar a variável). **Qualidade a melhorar:** com uma busca por tema o X rendeu só 1 item entre 7, e o radar chamou de "dia fraco" um dia em que saíram dois lançamentos grandes de IA (a versão cara do Grok tinha achado os dois).
- [ ] **Histórico do Radar:** a tela mostra até 30 dias (7 em abas, o resto num seletor). Radares mais antigos que isso ficam no banco, sem tela.
- [ ] **Tarefa diária em produção com fila cheia:** o encadeamento (5 ao mesmo tempo, 20 por rodada, chama a si mesma se sobrar) passou em teste simulado com 45 e 100 pendentes (`lib/radar/cron.test.ts`), mas ainda não rodou na Vercel com mais de 20 radares de verdade. Olhar o log na primeira vez que isso acontecer.
- [ ] **Releitura da resposta fora do formato:** quando a pesquisa volta sem JSON legível, o código pede só o JSON de novo. Esse caminho nunca foi acionado numa geração real.
- [ ] **Tela vista só com dados simulados:** Radar e sino foram conferidos no navegador (desktop e celular) com respostas do servidor simuladas, não com um login real.

### Radar global (novo em 07/10)

Página `/app/radar` (atalho na barra do topo): um radar por dia para cada nicho — Tecnologia, IA, Startups, Influencer IA — igual para todos os usuários, sem gastar créditos. A tarefa diária `/api/cron/radar-global` monta às 5h30 de Brasília. Custo medido: **US$ 0,15 por radar** (Anthropic US$ 0,09 + xAI US$ 0,06); 4 nichos × 2 idiomas = **~US$ 1,20 por dia (~US$ 36/mês)**, pago pela plataforma.

- [ ] **Só o nicho IA em português foi gerado de verdade.** Os outros 7 (3 nichos em PT e os 4 em EN) entram na primeira execução da tarefa diária, ou pelo botão "Montar agora" (só admins veem).
- [ ] **A tarefa diária do radar global nunca rodou** (nem local, nem na Vercel). Conferir o log `[cron] radar global` depois do primeiro deploy.
- [ ] **Custo:** para gastar menos, `RADAR_GLOBAL_IDIOMAS=pt` corta pela metade e `RADAR_GLOBAL_X=0` tira o X (~US$ 0,09 por radar).
- [ ] **Tela vista só com dados simulados** (desktop e celular), com o radar de IA real dentro.
- [ ] **Sem aviso no sino** para o radar global: o sino continua só para os radares dos personagens.

## Indicações (novo em 07/10)

Programa de indicação em Conta → Indique e ganhe (`/app/indicacoes`): link com código (`/?ref=codigo`), 10% em dinheiro sobre a primeira assinatura de plano do indicado, saque pelo Stripe Connect. Regras em [lib/indicacao/regras.ts](lib/indicacao/regras.ts).

- [x] Migration `db/migrations/0016_indicacoes.sql` aplicada no Neon em 07/10. O SQL do programa foi validado no banco (as instruções que escrevem, só analisadas, sem gravar nada).
- [ ] **Ligar o Stripe Connect** (contas Express, com transferências) no Dashboard do Stripe. Sem isso "Conectar Stripe" falha. Passos no [DEPLOY.md](DEPLOY.md), seção 5, item 4.
- [ ] **Nunca testado de verdade:** vínculo pelo link, comissão gerada por um pagamento, cadastro no Stripe e saque. Só as regras (código, cálculo dos 10%) têm teste, e a tela foi vista com dados simulados.
- [ ] **Decidir:** 10% só da primeira assinatura (como está) ou também das renovações; carência de 7 dias; saque mínimo de R$ 20 / US$ 5.
- [ ] **Comissão em dólar no cartão** (indicado que pagou em USD pelo Stripe): o Stripe só transfere se a conta da plataforma tiver saldo em dólar e a conta do indicador aceitar. Pode falhar; o saldo volta para "disponível".
- [ ] **Saque em USDC on-chain (feito em 07/10, envio nunca testado):** plano pago em USDC gera comissão em USDC, sacada da carteira de saques da NIDO para a carteira do usuário (Solana, Base, Arbitrum, BNB Chain ou Ethereum). Para ligar:
  - Migration `db/migrations/0017_indicacao_usdc.sql` aplicada no Neon em 07/10.
  - Criar uma carteira só para saques e pôr a chave no ambiente: `USDC_SAQUE_EVM_PRIVATE_KEY` e/ou `USDC_SAQUE_SOLANA_SECRET_KEY` (ver `.env.example`). Abastecer com USDC e com a moeda da taxa em cada rede.
  - Teto por saque: `USDC_SAQUE_TETO` (padrão 200 USDC).
  - Só a parte de leitura foi conferida nas redes reais (saldo, endereço, situação de uma transação). **Assinar e transmitir nunca rodou**: fazer um saque pequeno de teste antes de divulgar.
  - Dois saques EVM no mesmo instante podem disputar a mesma vez na fila da carteira; o segundo fica "processando" e o admin resolve com "Conferir".
- [ ] **Estorno desfaz a comissão (feito em 07/10), mas falta ligar no Stripe:** adicionar os eventos `charge.refunded` e `charge.dispute.created` ao webhook no Dashboard. Sem eles o estorno não chega ao app. Vale só para estorno total; estorno parcial não mexe na comissão. Se a comissão já tinha sido sacada, vira dívida descontada do próximo saque. Nunca testado com um estorno de verdade.
- [ ] **Aba Indicações no admin (feita em 07/10), nunca vista no navegador:** totais por moeda, quem indica, comissões (com "Estornar" à mão, para USDC devolvido) e saques (com "Conferir" para saque parado em "processando").
- [x] Tela de indicações em inglês (07/10), junto com o menu lateral, a Home e o diálogo de criar. A aba do admin segue só em português, como o resto do admin.

## Auditoria de segurança e pagamentos (07/10)

Corrigido no código em 07/10 (testes e typecheck passam; nada disso rodou em produção):

- [x] **USDC nas redes EVM:** cada cobrança em aberto tem um valor único (preço + 0 a 99 centavos) e só vale a transação com o valor exato. O hash do pagamento de outra pessoa não confirma mais a cobrança de ninguém.
- [x] **Estorno total ou contestação no Stripe** tira o plano (ou os créditos comprados que ainda restarem), cancela a assinatura e desfaz a comissão. Estorno parcial mantém a compra e encolhe a comissão ainda não sacada na mesma proporção.
- [x] **Teto diário de saque em USDC** (`USDC_SAQUE_TETO_DIA`, padrão 1000, somando todos os usuários), além do teto por saque. Ao bater, grava `ALERTA` no log.
- [x] **Vídeo por link:** o servidor só baixa de endereço público (cada redirecionamento é conferido) e corta o download em 300 MB mesmo sem tamanho informado.
- [x] **Dependências:** de 11 falhas (1 crítica, 3 altas) para 4 moderadas. `jspdf` atualizado para a versão 4; `@solana/spl-token` removido (as instruções são montadas no código, idênticas byte a byte às da biblioteca).
- [x] **Cabeçalhos de segurança** em todas as respostas (não deixa embutir o app em outro site, entre outros).
- [x] **Auto-indicação:** não vincula quem entrou pelo mesmo endereço de rede (IP) que o dono do código.
- [x] `public/video_teste/` movido para `video_teste/` (fora de `public/`, e no `.gitignore`).
- [x] Pagamento na Solana só é aceito quando a rede o dá como definitivo ("finalized").
- [x] Limite de frequência para criar cobrança, abrir checkout, colar hash e pedir saque.
- [x] Admin exige e-mail verificado pelo login.

Ainda em aberto:

- [ ] **Conferir no navegador:** exportar a ficha em PDF (o `jspdf` mudou de versão) e pagar em USDC numa rede EVM (o valor agora pode vir com centavos a mais).
- [ ] **Estorno:** depende dos eventos `charge.refunded` e `charge.dispute.created` no webhook do Stripe. Nunca testado com um estorno de verdade. Pagamento em USDC não tem estorno automático (só o botão "Estornar" da comissão, no admin).
- [ ] **Regra do mesmo IP nas indicações** também barra duas pessoas da mesma casa ou escritório. Para desligar, é o trecho comentado em `vincularIndicacao` ([lib/indicacao/server.ts](lib/indicacao/server.ts)).
- [ ] **Bônus de 50 créditos por conta Google** continua podendo ser repetido com várias contas. Não mexi: fechar isso pede uma decisão (ex.: verificar telefone, ou dar o bônus só uma vez por IP).
- [ ] **4 falhas moderadas** vêm do cliente de rede do `@solana/web3.js` (versão 1, a última da linha). Só saem migrando para a biblioteca nova da Solana.
- [x] Vídeo por link: o endereço é conferido na própria conexão (o IP conferido é o que conecta), então um DNS que troque de resposta no meio não engana mais (07/10).
- [ ] Não auditado: fluxos de vídeo (Runway, fal), voz e persona linha a linha; configuração fora do repositório (Stripe, Vercel, bucket S3, Neon).

## 2. Decisões que dependem de você

- [ ] **Preço do Starter em reais.** Em 07/10 o Starter passou para **US$ 18 / R$ 95, com 800 créditos** (antes US$ 15 / R$ 79, 600 créditos), para caber 3 vídeos de troca de 15s. O valor em dólar é o mínimo que mantém a margem; o valor em reais (R$ 95) é uma conversão — confirmar se fica R$ 95 ou R$ 99. O Creator passou de 1.600 para 1.720 créditos, no mesmo preço.
- [ ] **Preço da troca em vídeo.** Subiu de 13 para **17 créditos por segundo** porque o Kling Pro custa US$ 0,168/s (o padrão custava US$ 0,126/s). Se quiser manter 13 e absorver a diferença, é a constante `TROCA_POR_SEGUNDO` em [lib/planos.ts](lib/planos.ts).
- [x] USDC nas redes EVM: o hash de outra pessoa não serve mais (valor único por cobrança, 07/10).
- [ ] **USDC na Solana: transferência manual não é reconhecida.** Só funciona pelo QR (Solana Pay). Dá para adicionar o campo "cole o hash" como plano B.
- [ ] **Título da aba do navegador.** Troquei para "NIDO AI Studio — Crie seu Influenciador Sintético" sem você pedir. Confirmar ou voltar.
- [ ] **Assinante em real que muda para inglês.** O Stripe não mistura moedas no mesmo cliente; a nova assinatura em dólar pode ser recusada. Decidir se bloqueia a troca de moeda para quem já assina.

## 3. Configurar (fora do código)

- [ ] **Ankr:** os 4 RPCs do `.env` respondem "Origin not allowed" (o projeto na Ankr tem allowlist). Hoje o app usa RPCs públicos de reserva, que têm limite de uso. Desligar a allowlist ou trocar de provedor antes de ter volume.
- [ ] **Carteira EVM exclusiva.** `EVM_MERCHANT_WALLET` deve ser usada só para receber pagamentos do app.
- [ ] **Stripe:** webhook e produtos criados, mas a conta de produção ainda não está ativada — sem isso não há cartão, Pix nem boleto. Falta ativar a conta, as formas de pagamento, o portal do cliente e o Connect, e pôr as chaves na Vercel. Passo a passo no [DEPLOY.md](DEPLOY.md), seção 5.
- [ ] **Deploy na Vercel** seguindo o [DEPLOY.md](DEPLOY.md).
- [x] `public/video_teste/` movido para `video_teste/` em 07/10 (fora de `public/`).
- [ ] **Encerrar as ~30 cobranças USDC pendentes** de teste (Admin → Pagamentos). Nenhuma foi paga.

## 4. Feito, mas nunca visto no navegador

- [ ] **Área admin** (`/app/admin`): as quatro abas, a ficha lateral do usuário, as ações (liberar plano, créditos, aprovar pagamento) e se as tabelas cabem sem cortar texto.
- [ ] **Barra do topo em todas as telas** e o botão "+ Novo" fora da tela inicial.
- [ ] **Vídeo por link** em três passos (carregar, conferir, substituir).
- [ ] **Trocar pessoa em foto** (Estúdio → Imagens → Trocar pessoa).
- [ ] **Modal de pagamento USDC** com seletor de rede e o campo para colar o hash.
- [ ] **Página de planos em inglês** (preços em dólar).
- [ ] **Ícones das redes** no calendário de agendamentos.
- [ ] **Ícone da aba** (favicon com o logo).

## 5. Nunca testado de verdade

- [ ] **Pagamento USDC real**, do começo ao fim, em qualquer rede. Só a conferência da transação foi testada (com uma transferência real de terceiros na Base).
- [ ] **Cobrança em dólar no Stripe** (depende das chaves).
- [ ] **IA escrevendo em inglês.** A regra está no código; nenhuma geração em EN foi conferida.
- [ ] **Post publicado de verdade** numa rede pelo bundle.social.
- [ ] **Troca Premium (Seedance)** em vídeo de 20–30s pela tela.

## 6. Tradução (EN)

- [x] **Mensagens de erro vindas do servidor** em inglês (07/10): o servidor segue respondendo em português e a tela traduz na hora de mostrar ([lib/i18n/erros.ts](lib/i18n/erros.ts)). Ficam em português: o admin, erros que ninguém cadastrou e o trecho que vem pronto de um serviço externo (fal, Runway, bundle.social). Nunca visto no navegador.
- [ ] **Landing page** de marketing continua só em português.
- [ ] Ao carregar, quem escolheu EN vê a tela em português por um instante. Trocar de idioma recarrega a tela e perde o que estiver digitado e não salvo.

## 7. Menores

- [ ] O teste que gasta créditos da Anthropic para conferir o "Preencher etapa com IA" foi removido de propósito; ficou só o teste offline.
- [ ] Em janela com menos de ~1050px, as tabelas do admin não cabem inteiras (dá para arrastar para o lado).
- [ ] "Usar outro link" no vídeo por link cobra os 3 créditos de novo; o botão não avisa.
