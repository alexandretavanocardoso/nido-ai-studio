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

## NFT do influencer (novo em 10/10)

Mint do influencer como NFT intransferível na Solana (Metaplex Core), com badges gravados no NFT para as marcas de views, curtidas, comentários, reposts, quotes e salvos. Aba **NFT** do personagem (ao lado do Radar), **só para admin** por enquanto (área admin → Em teste → NFT do influencer). Como funciona e como ligar: [TECNICO.md](TECNICO.md), seção "NFT do influencer". Desenho, pesquisa das escadas e auditoria: https://claude.ai/artifact/AFqUwmxx3WgZGdo7MKugJc

**Conferido em 10/10**

- [x] Regras da rede contra o programa Core de verdade, por simulação, em **devnet e mainnet** (`node scripts/nft-simular.mjs`): a chave de mint delegada minta para a carteira do usuário; o dono não transfere nem queima; chave qualquer não minta nem escreve badges; a chave de mint não escreve badges nem descongela; a raiz descongela e revoga; o catálogo inteiro de badges (o pior caso, 6 métricas × 10 degraus) cabe numa transação (895 de 1232 bytes). Custo medido: **0,0040 SOL por mint**.
- [x] O código que monta e assina as transações ([lib/nft/core.ts](lib/nft/core.ts)) e o que consulta a rede ([lib/nft/rede.ts](lib/nft/rede.ts)) rodaram contra a devnet sem enviar nada: a rede aceitou as assinaturas e recusou só por falta de saldo.
- [x] Testes automáticos com Postgres de verdade (PGlite, todas as migrations aplicadas) em [lib/nft/banco.test.ts](lib/nft/banco.test.ts): carteira, mint com créditos reais, estorno uma vez só, 20 pedidos simultâneos, devnet e mainnet no mesmo banco, números e badges de todas as métricas, conta tomada por conexão, leitura de autores, aprovação, metadados públicos, limpeza do S3, rotas e cron. Mais [lib/nft/mint.test.ts](lib/nft/mint.test.ts) (ordem do mint e 100 pedidos simultâneos) e os testes das regras puras.
- [x] **Revisão do código em quatro frentes (dinheiro, acesso, rede e tela), com cada achado conferido por um segundo revisor.** De 16 achados, 1 foi descartado (o texto que a carteira assina não leva a conta do app: é endurecimento, não defeito) e os outros eram 13 problemas, todos corrigidos:
  - devnet e mainnet no mesmo banco: o app só julga os mints da rede em que está, e o NFT de teste não trava o mint do mesmo personagem na mainnet (migration `0030`). Sem isso, um app em devnet podia dar como falho, e estornar, um mint da mainnet;
  - o estorno do mint e a cobrança passaram a mexer em saldo e extrato num comando só (acabou a janela de estorno em dobro e a de débito sem extrato);
  - só o Retrato gerado vira a imagem pública do NFT; sem retrato, não minta. Antes, um personagem só com referência enviada publicava a referência;
  - uma transação que a rede só "processou" não decide mais nada (estorno, badge dado como gravado): só a partir de bloco confirmado;
  - conta em que o recurso está fechado não recebe aviso de badge no sino;
  - a aba não fica mais em "Lendo quem publicou…" para sempre (acontecia com post do LinkedIn), volta sozinha para tentar de novo, mostra erro com "Tentar de novo" se não carregar, e para de perguntar se a gravação de um badge não sai;
  - a rota da aba tinha 60 s para uma leitura do Apify que pode levar 100 s: agora tem 300 s, e o que já foi lido entra na conta mesmo se a rodada parar no meio;
  - a imagem do NFT na tela usava um contador que zerava a cada visita e mostrava a imagem antiga do cache;
  - `nft-colecao.mjs conferir` passou a acusar quando quem descongela a coleção não é a raiz.
- [x] **Três ajustes na regra do primeiro link**, vindos da mesma revisão: conexão ganha do link (quem conecta a conta fica com ela, mesmo que outro personagem a tivesse pelo primeiro link); o "primeiro link" é o primeiro cadastrado, não o primeiro cujo autor foi lido; e cada post tem no máximo três tentativas de leitura do autor (antes, um post apagado custava uma execução do Apify a cada 10 minutos, para sempre).

**Nunca aconteceu de verdade**

- [x] **Coleção criada em devnet em 10/10:** `FeP3duLN5DNhQmahaVP6TsSnUQaymvoFnWiFZh9w9ENU`, congelada, com a chave de mint delegada e ~5 SOL de teste. A raiz é a própria chave de mint (aceitável só em devnet).
- [x] **NFTs mintados em devnet em 10/10, pela tela, com a Phantom:** "Tanjirão" (`4U2iY8fYChF1QqeidwAyJvtmbmx84wxz5y8wCGHWqdTw`) e "Lula" (`FDaKmkZEWfaXiHAx9YPtvmkAyCY1SXPSnfcbffnxCciB`). O primeiro confirmou em ~4 s, com 10 créditos debitados e a declaração registrada.
- [ ] **No explorer, os NFTs aparecem sem imagem, sem traços e sem site até o deploy.** O endereço gravado no NFT aponta para produção (`NFT_BASE_URL`), que ainda responde 404 em `/api/nft/meta/...`. No app local, o JSON e a imagem saem certos (conferido com o NFT da Lula).
- [x] Migrations `0028_nft.sql`, `0029_nft_metricas.sql` e `0030_nft_rede_autor.sql` aplicadas no Neon em 10/10. Os posts que já existiam ficaram sem `autor`: os cadastrados por link têm o autor lido quando o dono abre a aba NFT, e até lá não contam para os badges.
- [ ] **Solflare, Backpack e MetaMask** nunca foram testadas com as extensões de verdade (a Phantom foi: conectar, assinar a mensagem e mintar). A MetaMask entrou em 10/10: ela se anuncia pelo mesmo padrão (Wallet Standard, nome `MetaMask`, com `solana:signMessage`), conferido no código dela, não na extensão. No celular ela só tem Solana mainnet.
- [ ] **Aba NFT do admin** (saldo, badges esperando, mints): nunca vista no navegador.
- [x] **Autor do post por link, com leitura de verdade (10/10):** os 6 posts do "Tanjirão" tiveram o autor lido pelo Apify no Instagram (`tanjirao_l2g` + id), no YouTube (`tanjirao-l2g` + id do canal), no TikTok (`web3clipes` + id) e no X (`tavano_dev` + id). LinkedIn não informa autor por link.
- [x] **Regra do primeiro link com dados de verdade (10/10):** no "Tanjirão" a conta de cada rede saiu do primeiro link (Instagram, YouTube e TikTok); 5 dos 6 posts contam, somando 5.472 views e 104 curtidas; os badges de 5 mil views e de 100 curtidas foram concedidos e **gravados no NFT de devnet**. O post do X (1.103 views) ficou de fora porque a conta `tavano_dev` está conectada a outro personagem ("Gru musculoso"): cada conta serve a um personagem só. O mesmo vale para o único post da "Lula".
- [ ] **O que o bundle.social devolve em `externalId` e `username`:** no X, o `externalId` é o id numérico da conta, o mesmo que o Apify devolve como autor (por isso a conta conectada e o link se reconhecem); o `username` veio vazio. No LinkedIn veio `urn:li:person:…`. Falta ver Instagram, TikTok e YouTube com conta conectada, e se chegam compartilhamentos e salvos do Instagram e os reposts e quotes do X em separado (na leitura normal do bundle.social, "shares" do X junta os dois).
- [ ] Roteiro de devnet antes da mainnet (Portão 3 do desenho): mint pelas quatro carteiras; tentar transferir o NFT pela carteira (tem de falhar); derrubar o servidor entre assinar e enviar e entre enviar e confirmar; bater as marcas com posts de verdade; conectar uma conta que outro personagem tinha pelo link; revogar a chave de mint pela raiz.

**Arte do NFT (12/10)**

- [x] A imagem do NFT é uma arte gerada a partir do Retrato, pelo GPT Image, com o prompt da coleção em [lib/nft/arte.ts](lib/nft/arte.ts). Antes do mint a pessoa gera **5 opções** (30 créditos pelas cinco), **escolhe uma** e minta; pode gerar outras cinco enquanto não mintou. **Depois do mint a imagem não muda mais.** Migrations `0031` e `0032` aplicadas no Neon. Testado com o gerador simulado (cobrança, estorno, escolha, cópia no mint, trava depois do mint, limpeza do S3).
- [x] O prompt não cita mais nome de marca e proíbe texto na imagem: uma arte de teste saiu com uma etiqueta "MAD LADS" na roupa porque o prompt dizia "inspired by Mad Lads".
- [x] A tela avisa, antes de gerar, que a arte mantém o rosto do retrato e que depois do mint não dá para trocar (personagem parecido com pessoa real).
- [ ] **O fluxo de 5 opções nunca rodou com o gerador de verdade** (é geração paga): gerar pela tela e ver se saem cinco, sem texto, no padrão da coleção, e quanto tempo leva.
- [ ] Os NFTs já mintados em devnet ficam com a imagem que tinham no mint; agora não há mais como trocar pela tela.
- [ ] Preço: 30 créditos por geração (6 por imagem). Decidir se fica assim ou se a primeira geração entra no preço do mint (`CREDITOS_ARTE_NFT`).
- [ ] Qualidade da imagem em "média". Se o resultado ficar abaixo do padrão desejado, subir para "alta" custa bem mais por imagem e pede rever o preço.

**Decisões**

- [ ] **Custo:** os 10 créditos (US$ 0,10 de custo) só cobrem os 0,0040 SOL do mint com o SOL abaixo de ~US$ 25. Acima disso a NIDO subsidia a diferença. Subir o preço é a constante `CREDITOS_MINT_NFT` em [lib/planos.ts](lib/planos.ts). O valor fica preso na conta do NFT como aluguel e não volta enquanto o NFT existir.
- [ ] **Raiz da coleção na mainnet:** precisa ser um multisig (ex.: Squads) ou carteira fria. O script recusa criar a coleção na mainnet sem `--raiz`.
- [ ] **Apagar um NFT específico não dá** com a trava na coleção: a raiz teria de descongelar a coleção inteira por um instante para o dono queimar. Se isso for necessário (pedido de exclusão), a alternativa é pôr a trava em cada NFT, o que muda o mint antes do lançamento.
- [ ] **Personagem apagado ou pagamento estornado depois do mint:** o NFT continua existindo e aparece como arquivado. Não há queima.
- [ ] **Trocar a carteira de um NFT já mintado:** não implementado. O NFT fica na carteira em que nasceu.
- [ ] **Soltar uma conta de rede presa a um personagem:** não há tela. Quem conecta a conta ganha de quem só a tinha pelo link; nos outros casos (link contra link, conexão contra conexão) vale quem chegou primeiro, e desfazer é apagar a linha em `nft_contas_rede`.
- [ ] **Escadas dos badges (55 badges em 6 métricas):** saíram de uma pesquisa de quanto cada métrica rende por view (resumo e fontes no desenho do fluxo). Os degraus já gravados não mudam, porque o NFT guarda a posição do degrau; dá para acrescentar degraus no fim de uma escada e criar escadas novas. Rever os tetos quando houver dados dos próprios influencers: a referência é o influencer mediano perto do 3º ou 4º degrau e cerca de 1% no 8º ou acima.
- [ ] **Página de planos** não lista o mint (entra quando o recurso for aberto a todos). **Termos de uso** não falam do NFT.

**Limites conhecidos**

- A chave de mint consegue trocar nome e endereço dos metadados dos NFTs enquanto for delegada (o programa Core dá esse poder ao delegado). Por isso ela tem pouco saldo, teto diário e a raiz fica fora do servidor.
- A chave de badges não pode ser trocada: cada NFT guarda quem escreve os badges dele. Chave nova só valeria para NFTs novos.
- Nem toda rede dá todo número. Quotes só existem no X. Salvos: por link vêm os do TikTok e do X; com a conta conectada, os do Instagram e do X (o bundle.social não traz os do TikTok); YouTube e LinkedIn não informam. Reposts: no X são reposts; no TikTok e no LinkedIn, compartilhamentos. Quem só posta no YouTube acumula views e curtidas, mas não esses badges.
- Posts por link não são relidos pelo cron (cada leitura custa uma execução no Apify): os números deles só sobem quando o dono abre o Dashboard.
- Os autores dos posts por link só são lidos com a aba NFT aberta. Depois de três leituras sem sucesso o post fica de fora, até o Dashboard conseguir relê-lo.
- Cron diário no plano Hobby: um mint que ficou "confirmando" com a página fechada só fecha no dia seguinte. Com a página aberta, fecha em segundos. Para fechar em minutos, cron externo a cada 5 min em `/api/cron/nft`.
- Sem taxa de prioridade na transação: em dia de rede congestionada o mint pode vencer sem entrar (os créditos voltam).
- Phantom com Ledger pode não assinar mensagem de texto: quem usa Ledger talvez não consiga vincular a carteira.
- A Phantom às vezes responde "Unexpected error" ao conectar (aconteceu no primeiro teste, em 10/10, logo depois de ligar o Modo Testnet). O erro nasce dentro da extensão; costuma passar recarregando a página ou reabrindo o navegador. A tela mostra a resposta da carteira e essa orientação.
- `npm audit`: de 11 para 16 avisos, todos pela mesma causa que já existia (o cliente de rede do `@solana/web3.js` versão 1, agora contado também nos pacotes da Metaplex que dependem dele). Nenhuma falha nova; o `bigint-buffer` não voltou.

## LinkedIn e X vinculados no Perfil (novo em 11/10)

Em Conta → Perfil → Contas vinculadas, ao lado do Discord e da carteira Solana, dá para ligar o LinkedIn e o X à conta. Não é login (o login segue só pelo Google) e não é a conexão das redes do personagem para publicar (essa continua no bundle.social). Mesmo caminho do Discord: o vínculo é do Better Auth, o estado e o desvincular ficam em `/api/conta/vinculo/[provedor]` ([lib/auth/vinculos.ts](lib/auth/vinculos.ts), [components/auth/ContaVinculada.tsx](components/auth/ContaVinculada.tsx)).

- [x] **Vinculados de verdade em 11/10, pela tela, no app local:** X e LinkedIn. No banco, a conta do X ficou com os escopos `users.read`, `tweet.read` e `offline.access`, com renovação de acesso (o acesso do X vence em 2 h e se renova sozinho); a do LinkedIn, com `openid`, `profile` e `email`, sem renovação (vence em 10/12/2026). O login do Google da mesma conta não foi tocado. O X não informa e-mail e mesmo assim vinculou.
- [x] **Apps criados em 11/10.** O do LinkedIn só funcionou depois de adicionar o produto **Sign In with LinkedIn using OpenID Connect** (sem ele, a tela do LinkedIn dá "Bummer, something went wrong"). Os endereços de retorno local e de produção do LinkedIn estão cadastrados (conferido na tela de autorização do LinkedIn).
- [ ] **Produção:** pôr os dois pares de chaves na Vercel (`LINKEDIN_CLIENT_ID/SECRET`, `TWITTER_CLIENT_ID/SECRET`) e conferir que o app do X tem o endereço de retorno de produção. Sem o par, o cartão da rede não aparece. Passo a passo no [DEPLOY.md](DEPLOY.md), seção 2.
- [ ] **Ainda não testado:** desvincular pela tela; o aviso quando a conta da rede já é de outro usuário do app; e o Discord, que passou a usar a mesma rota e o mesmo cartão (conferir que continua aparecendo como vinculado no Perfil e no menu da conta).
- [x] **X pelo twitterapi.io (decidido em 11/10): não.** Ele só lê dados públicos e não prova de quem é a conta; a alternativa seria um código colado na bio. Ficou o OAuth do X.
- [ ] **O nome e a foto são lidos da rede cada vez que o Perfil abre** (como no Discord). No X cada leitura conta no limite da API; se a rede não responder, o cartão mostra só "Conta vinculada". O acesso do LinkedIn vence em 60 dias: depois disso o nome some até vincular de novo, mas o vínculo continua.
- [ ] **O que fazer com o vínculo:** por ora só fica registrado na conta (tabela `account`, com o id da pessoa na rede). Nada no app usa ainda.

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

Programa de indicação em Conta → Indique e ganhe (`/app/indicacoes`): link com código (`/?ref=codigo`), 10% em dinheiro sobre cada assinatura de plano do indicado, por até 12 meses, saque pelo Stripe Connect. Regras em [lib/indicacao/regras.ts](lib/indicacao/regras.ts).

- [x] Migration `db/migrations/0016_indicacoes.sql` aplicada no Neon em 07/10. O SQL do programa foi validado no banco (as instruções que escrevem, só analisadas, sem gravar nada).
- [ ] **Ligar o Stripe Connect** (contas Express, com transferências) no Dashboard do Stripe. Sem isso "Conectar Stripe" falha. Passos no [DEPLOY.md](DEPLOY.md), seção 5, item 5.
- [ ] **Nunca testado de verdade:** vínculo pelo link, comissão gerada por um pagamento, cadastro no Stripe e saque. Só as regras (código, cálculo dos 10%) têm teste, e a tela foi vista com dados simulados.
- [ ] **Comissão recorrente (07/10):** passou a ser 10% de cada pagamento de plano do indicado (primeira assinatura e renovações), por até 12 meses a partir da primeira comissão. Migration `db/migrations/0018_indicacao_recorrente.sql` aplicada no Neon em 07/10. Nunca testado com uma renovação de verdade.
- [ ] **Decidir:** carência de 7 dias; saque mínimo de R$ 20 / US$ 5.
- [ ] **Comissão em dólar no cartão** (indicado que pagou em USD pelo Stripe): o Stripe só transfere se a conta da plataforma tiver saldo em dólar e a conta do indicador aceitar. Pode falhar; o saldo volta para "disponível".
- [ ] **Saque em USDC on-chain (feito em 07/10, envio nunca testado):** plano pago em USDC gera comissão em USDC, sacada da carteira de saques da NIDO para a carteira do usuário (Solana, Base, Arbitrum, BNB Chain ou Ethereum). Para ligar:
  - Migration `db/migrations/0017_indicacao_usdc.sql` aplicada no Neon em 07/10.
  - Criar uma carteira só para saques e pôr a chave no ambiente: `USDC_SAQUE_EVM_PRIVATE_KEY` e/ou `USDC_SAQUE_SOLANA_SECRET_KEY` (ver `.env.example`). Abastecer com USDC e com a moeda da taxa em cada rede.
  - Teto por saque: `USDC_SAQUE_TETO` (padrão 200 USDC).
  - Só a parte de leitura foi conferida nas redes reais (saldo, endereço, situação de uma transação). **Assinar e transmitir nunca rodou**: fazer um saque pequeno de teste antes de divulgar.
  - Dois saques EVM no mesmo instante podem disputar a mesma vez na fila da carteira; o segundo fica "processando" e o admin resolve com "Conferir".
- [x] **Estorno desfaz a comissão (feito em 07/10):** os eventos `charge.refunded` e `charge.dispute.created` estão no webhook da conta nova (15/10). Vale só para estorno total; estorno parcial não mexe na comissão. Se a comissão já tinha sido sacada, vira dívida descontada do próximo saque. Nunca testado com um estorno de verdade.
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
- [ ] **Estorno:** os eventos `charge.refunded` e `charge.dispute.created` já estão no webhook (15/10). Nunca testado com um estorno de verdade. Pagamento em USDC não tem estorno automático (só o botão "Estornar" da comissão, no admin).
- [ ] **Regra do mesmo IP nas indicações** também barra duas pessoas da mesma casa ou escritório. Para desligar, é o trecho comentado em `vincularIndicacao` ([lib/indicacao/server.ts](lib/indicacao/server.ts)).
- [ ] **Bônus de 50 créditos por conta Google** continua podendo ser repetido com várias contas. Não mexi: fechar isso pede uma decisão (ex.: verificar telefone, ou dar o bônus só uma vez por IP).
- [ ] **4 falhas moderadas** vêm do cliente de rede do `@solana/web3.js` (versão 1, a última da linha). Só saem migrando para a biblioteca nova da Solana.
- [x] Vídeo por link: o endereço é conferido na própria conexão (o IP conferido é o que conecta), então um DNS que troque de resposta no meio não engana mais (07/10).
- [ ] Não auditado: fluxos de vídeo (Runway, fal), voz e persona linha a linha; configuração fora do repositório (Stripe, Vercel, bucket S3, Neon).

## 2. Decisões que dependem de você

- [ ] **Preço do Starter em reais.** Em 07/10 o Starter passou para **US$ 18 / R$ 95, com 800 créditos** (antes US$ 15 / R$ 79, 600 créditos), para caber 3 vídeos de troca de 15s. O valor em dólar é o mínimo que mantém a margem; o valor em reais (R$ 95) é uma conversão — confirmar se fica R$ 95 ou R$ 99. O Creator passou de 1.600 para 1.720 créditos, no mesmo preço.
- [ ] **Preço da troca em vídeo.** Subiu de 13 para **17 créditos por segundo** porque o Kling Pro custa US$ 0,168/s (o padrão custava US$ 0,126/s). Se quiser manter 13 e absorver a diferença, é a constante `TROCA_POR_SEGUNDO` em [lib/planos.ts](lib/planos.ts).
- [x] USDC nas redes EVM: o hash de outra pessoa não serve mais (valor único por cobrança, 07/10).
- [x] USDC na Solana: transferência manual passou a ser reconhecida (12/10). O modal mostra valor e endereço e aceita o link/hash colado, como nas EVM; o QR continua confirmando sozinho. Por isso a cobrança na Solana também tem valor único (preço + 0 a 99 centavos). Reabrir o modal devolve a cobrança em aberto da mesma compra e rede (até 12h) em vez de criar outra, e a criação roda com trava: dois pedidos no mesmo instante não pegam mais o mesmo valor (era o erro "Valor da cobrança em disputa").
- [ ] **Título da aba do navegador.** Troquei para "NIDO AI Studio — Crie seu Influenciador Sintético" sem você pedir. Confirmar ou voltar.
- [x] **Assinante em real que muda para inglês.** Resolvido em 15/10: o Stripe cobra só em dólar, então não há mais troca de moeda no mesmo cliente.

## 3. Configurar (fora do código)

- [ ] **Ankr:** os 4 RPCs do `.env` respondem "Origin not allowed" (o projeto na Ankr tem allowlist). Hoje o app usa RPCs públicos de reserva, que têm limite de uso. Desligar a allowlist ou trocar de provedor antes de ter volume. O `SOLANA_RPC_URL` também é da Ankr e também é recusado: o pagamento em USDC na Solana passou a cair no RPC público (12/10; antes nem o QR confirmava), mas o **saque em USDC na Solana** ([lib/indicacao/onchain.ts](lib/indicacao/onchain.ts)) ainda usa só o do `.env` e falha enquanto a allowlist estiver ligada.
- [ ] **Carteiras de recebimento exclusivas.** `EVM_MERCHANT_WALLET` e `SOLANA_MERCHANT_WALLET` devem ser usadas só para receber pagamentos do app (o hash colado vale pelo valor recebido na carteira).
- [ ] **Stripe:** conta nova (Pessoa Jurídica) ativada, com webhook e preços em US$; checkout testado. Falta salvar o portal do cliente, pôr as chaves da conta nova na Vercel, fazer o deploy, liberar no admin (Em teste) e uma compra real. Passo a passo no [DEPLOY.md](DEPLOY.md), seção 5.
- [ ] **Deploy na Vercel** seguindo o [DEPLOY.md](DEPLOY.md).
- [x] `public/video_teste/` movido para `video_teste/` em 07/10 (fora de `public/`).
- [ ] **Encerrar as ~30 cobranças USDC pendentes** de teste (Admin → Pagamentos). Nenhuma foi paga.

## 4. Feito, mas nunca visto no navegador

- [ ] **Área admin** (`/app/admin`): as quatro abas, a ficha lateral do usuário, as ações (liberar plano, créditos, aprovar pagamento) e se as tabelas cabem sem cortar texto.
- [ ] **Barra do topo em todas as telas** e o botão "+ Novo" fora da tela inicial.
- [ ] **Vídeo por link** em três passos (carregar, conferir, substituir).
- [ ] **Trocar pessoa em foto** (Estúdio → Imagens → Trocar pessoa).
- [ ] **Modal de pagamento USDC** com seletor de rede e o campo para colar o hash.
- [ ] **Pagar com a carteira conectada (12/10)** e o botão da carteira ao lado do sino: nunca vistos no navegador nem usados com uma carteira de verdade (Phantom, MetaMask, Rabby…). Só o que não depende da carteira tem teste: a transação Solana montada, a chamada `transfer` das EVM e a conferência do hash. Fazer um pagamento pequeno em cada rede antes de divulgar.
- [ ] **Página de planos em inglês** (preços em dólar).
- [ ] **Ícones das redes** no calendário de agendamentos.
- [ ] **Ícone da aba** (favicon com o logo).

## 5. Nunca testado de verdade

- [ ] **Pagamento USDC real**, do começo ao fim, em qualquer rede. Só a conferência da transação foi testada (com uma transferência real de terceiros na Base). Na Solana, o hash colado (12/10) só tem teste com transações simuladas.
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
