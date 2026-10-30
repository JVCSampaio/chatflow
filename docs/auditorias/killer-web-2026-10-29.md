# Killer: webchat e console do atendente

**Nível** T2 (duas telas, com uma ação sem volta: encerrar o atendimento) · **Nota** 90/100 · **Veredito** portão aberto; os testes passam

Método: skill `visant-killer` (github.com/pedrojaques99/visant-skills-public) com `visant-frontend` e o `slop-catalog`. Rodaram de verdade:

- `killer-scan` nos quatro detectores: impeccable, tokens, copy e ruído;
- `impeccable` nas telas renderizadas, em 24 estados;
- `corta-scan` e `ritmo-scan` no navegador;
- o teste com o servidor fora do ar;
- `npm test`, os cenários BDD, o Postman e o Selenium.

## Superfícies

| Arquivo               | Superfície (A/B/C) | Variável de negócio                                                     | Notas                                                                                                   |
| --------------------- | ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| web/src/atendente.tsx | B                  | conversas atendidas por hora, sem encerrar a conversa errada            | console do atendente: fila, conversa aberta e resposta; "Encerrar atendimento" é a única ação sem volta |
| web/src/webchat.tsx   | A                  | % de visitantes que mandam a primeira mensagem e chegam ao fim do fluxo | widget do cliente: situação da conversa e campo de mensagem                                             |

## Tela vista

- `/` (webchat), 390 e 1280 px, claro e escuro: vazio, menu do bot, na fila e com resposta da atendente. 0 px de estouro.
- `/atendente` (console), 390 e 1280 px, claro e escuro: fila com WhatsApp, Telegram e site; conversa aberta com resposta enviada. 0 px de estouro.
- Servidor `node src/server.ts --teste` (MongoDB em memória). Os dados vieram dos webhooks, com os segredos de desenvolvimento do próprio repositório.
- Com a API bloqueada, o envio mostra "Sem conexão com o servidor. Verifique a internet e tente de novo."

## Portão

| Detector                             | Antes                                               | Depois                                               |
| ------------------------------------ | --------------------------------------------------- | ---------------------------------------------------- |
| impeccable (24 estados renderizados) | 20 problemas e 4 avisos                             | 0 e 0                                                |
| botão secundário no hover            | texto índigo sobre índigo escuro, 1,6:1 (ilegível)  | fundo neutro, texto da marca a 7:1                   |
| texto cinza na bolha do cliente      | 4,3:1                                               | 5,7:1                                                |
| copy-lint                            | 3 (separador `·` nos metadados)                     | 0                                                    |
| noise-scan                           | 2 (um "Abrir" repetido em cada conversa)            | 0                                                    |
| cores                                | 17 cores cruas (16 distintas) da paleta do Tailwind | tokens HSL, tema claro e escuro                      |
| corta-scan e ritmo-scan (390 e 1280) | não medido                                          | 0                                                    |
| `npm test`, BDD, Postman             | 166, 24 cenários, 26 requisições e 82 asserções     | iguais, passam                                       |
| Selenium (3 testes)                  | passam                                              | passam a qualquer hora (ver "Achado fora do visual") |

## Slop corrigido

| #   | Catálogo                                             | Onde estava                                                    | Correção                                                      |
| --- | ---------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Cor crua da paleta (15)                              | índigo e verde do Tailwind escritos à mão                      | tokens HSL e uma cor de marca própria (azul-petróleo)         |
| 2   | Contraste quebrado no hover                          | `button:hover` pintava também o secundário                     | cada variante tem o seu hover                                 |
| 3   | Ação destrutiva colada na frequente (`work-surface`) | "Encerrar atendimento" ao lado de "Enviar"                     | no topo da conversa, em vermelho só no texto                  |
| 4   | Caixa dentro de caixa (53)                           | cada conversa da fila em um cartão com borda, dentro do painel | linhas de uma lista, separadas por divisória                  |
| 5   | Verbo repetido em cada item (noise-scan)             | um botão "Abrir" por conversa                                  | a linha inteira abre a conversa, com `aria-current` na aberta |
| 6   | Separador `·` (copy-lint)                            | "Suporte técnico · desde 22:50 · fora do expediente"           | vírgulas; o título da conversa ganhou uma linha de detalhe    |
| 7   | Sem tema escuro                                      | só claro                                                       | segue o sistema                                               |

## Mantido de propósito

| O quê                                                         | Por quê                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selo do canal (WhatsApp, Telegram, Site) em cada item da fila | a fila mistura canais, e o canal muda como o atendente responde                                                                                   |
| "Assumir" em cada item da fila                                | é a decisão da tela; o Selenium usa `aria-label="Assumir #…"`                                                                                     |
| Classes e textos que o Selenium usa                           | `form.envio` (o XPath exige a classe exata), `#mensagem`, `#resposta`, `li.mensagem[data-autor]`, `data-testid`, "Enviar", "Encerrar atendimento" |

## Interrogatório (T2)

- **Q2. O que decide em cada tela?** No console: quem está esperando e há quanto tempo. No webchat: em que pé está a conversa (o selo de situação).
- **Q4. Qual ação é rara?** Encerrar o atendimento. Saiu de perto do Enviar e não tem confirmação extra, porque o teste de ponta a ponta encerra com um clique e o atendente encerra de propósito.
- **Q6. O que decide é o mais pesado?** Sim. Antes, os botões índigo cheios de cada item da fila eram o que mais pesava; agora pesa o nome e o motivo.
- **Q9. Estado vazio?** "Ninguém aguardando." e "Envie uma mensagem para começar" (mantidos).
- **Q12. Backend fora?** O envio avisa sem conexão. A consulta periódica falha em silêncio, mas o próximo envio avisa.
- **Q14. Teclado?** Anel de foco em botões e campos. A conversa aberta é um botão de verdade, com `aria-current`.
- **Q17. Onde vai faltar?** Motivo longo quebra a linha ao lado do "Assumir", sem estouro (medido a 390 px).
- **Q18. O que ensinava errado?** O índigo cheio em todo "Assumir" dizia que tudo era urgente.
- **Q26. Quem mantém?** Tokens no topo do `estilo.css`; os testes de ponta a ponta travam os ganchos do HTML.

### Bloco fixo

- **F1 Reuso:** os mesmos componentes; nenhuma dependência nova.
- **F2 Consistência:** uma cor de marca, dois raios (8 e 14 px), botões em três variantes (cheio, secundário, perigo).
- **F3 Responsivo:** 0 px de estouro em 24 fotos (390 e 1280, claro e escuro).
- **F4 Fluxo:** o cliente escreve, o bot responde, o cliente pede atendente e entra na fila. A atendente assume, responde e encerra. O ponto de queda é o cliente esperando fora do expediente; a mensagem do bot já diz quando volta.
- **F5 Escondido ou compactado:** os botões "Abrir" e as caixas da fila.
- **F6 Nível Vale do Silício:** atalho de teclado para assumir o próximo da fila, tempo de espera em destaque quando passa de um limite e prévia da última mensagem na fila. Nenhum dos três existe hoje.

## Achado fora do visual (corrigido)

O teste de ponta a ponta "cliente pede atendente…" falhava fora do expediente (segunda a sexta, das 08h às 18h): o bot respondia com a mensagem de fora do expediente, e não "Você está na fila". O CI só passava porque rodava em horário comercial.

- **Causa:** o repositório já tinha `config/teste.env` com o atendimento sempre aberto, mas o script `start:teste` nunca carregava esse arquivo.
- **Correção:** `start:teste` passou a ser `node --env-file=config/teste.env src/server.ts`.
- **Verificação:** às 23:28, sem variável nenhuma, o Postman (26 requisições) e o Selenium (3 testes) passam.

## Não verificado

- Leitor de tela real (NVDA ou VoiceOver).
- Navegadores além do Chromium.
