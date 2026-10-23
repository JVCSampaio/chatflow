# Estratégia de testes

## Riscos e onde cada um é coberto

| Risco                                       | Impacto | Camada             | Exemplo                                                                |
| ------------------------------------------- | ------- | ------------------ | ---------------------------------------------------------------------- |
| Bot responde errado ou entra em laço        | Alto    | Unidade e BDD      | Cada transição do fluxo; três respostas inválidas transferem           |
| Webhook reenviado gera resposta duplicada   | Alto    | API e Postman      | Mesmo `wamid` enviado 2 e 5 vezes (inclusive ao mesmo tempo)           |
| Mensagem forjada passa pelo webhook         | Alto    | Unidade e API      | Assinatura HMAC errada, corpo alterado, cabeçalho ausente              |
| Dois atendentes assumem a mesma conversa    | Alto    | API, BDD e Postman | Duas requisições simultâneas: uma recebe 200, a outra 409              |
| Mensagens simultâneas corrompem o estado    | Médio   | API                | Três respostas ao mesmo tempo precisam contar três tentativas          |
| CPF e telefone expostos (LGPD)              | Alto    | API e BDD          | Histórico com `***.456.789-**`; log sem texto e com telefone mascarado |
| Transferência fora do expediente sem aviso  | Médio   | Unidade e BDD      | Limites 07:59, 08:00, 17:59 e 18:00 em Brasília; sábado                |
| Contrato da API muda sem aviso              | Médio   | API e Postman      | Formato das mensagens e conversas; JSON Schema no Postman              |
| Interface quebra no navegador real          | Médio   | Selenium           | Fluxo completo com cliente e atendente em dois navegadores             |
| Falha do banco derruba tudo sem diagnóstico | Médio   | API                | `/health` responde 503; erro 500 genérico com id no log                |

## Camadas

```text
            Selenium (3)            navegador real, cliente + atendente
          Postman/Newman (26)       servidor rodando, de fora para dentro
        Cucumber BDD (24)           regras de negócio em português
      Supertest + MongoDB (70)      rotas, banco, segurança, concorrência
    Unidade (96)                    fluxo do bot, CPF, expediente, canais
```

A maior parte dos testes fica nas camadas rápidas: 166 testes de unidade e API rodam em cerca
de 3 segundos. O Selenium cobre só o que depende do navegador: a tela, o envio, a atualização
periódica e a conversa entre cliente e atendente.

## Técnicas aplicadas

- **Valor-limite:** texto com 1000 e 1001 caracteres; expediente às 07:59, 08:00, 17:59 e 18:00.
- **Partição de equivalência:** CPFs válidos, com dígito errado, com tamanho errado e com todos
  os dígitos iguais.
- **Tabela de estados:** transições do bot (início, menu, CPF, modem, concluído) e da conversa
  (bot, aguardando, em atendimento, encerrada).
- **Testes negativos e de segurança:** assinatura inválida, token errado, campos extras,
  JSON malformado, corpo grande demais, id de correlação malicioso.
- **Concorrência:** `Promise.all` com entregas e ações simultâneas.
- **Teste de mutação manual:** retirando a fila por contato de `Atendimento.receber`, o teste
  "respostas simultâneas do mesmo contato" falha (`expected 'bot' to be 'aguardando'`).
  Isso confirma que ele detecta a condição de corrida que deveria detectar.

## Dados e isolamento

- Cada arquivo de teste de API e cada cenário BDD usa um banco MongoDB próprio, apagado no fim.
- Contatos e sessões são gerados por teste (telefones e UUIDs aleatórios).
- O relógio é injetado: os testes de expediente fixam a data em vez de depender da hora real.
- Sem `MONGO_URL`, os testes sobem um MongoDB em memória; no CI, usam o MongoDB 8 em container.
- O servidor dos testes de ponta a ponta usa `config/teste.env` (atendimento humano sempre aberto).

## Rastreabilidade

| Requisito                                       | Unidade                               | API                               | BDD                          | Postman | Selenium |
| ----------------------------------------------- | ------------------------------------- | --------------------------------- | ---------------------------- | ------- | -------- |
| Menu e segunda via                              | `fluxo.test.ts`                       | `webchat.test.ts`                 | `segunda_via.feature`        | pasta 2 | sim      |
| Suporte de conexão                              | `fluxo.test.ts`                       |                                   | `suporte.feature`            |         |          |
| Transferência e expediente                      | `fluxo.test.ts`, `expediente.test.ts` | `atendimento.test.ts`             | `atendimento_humano.feature` | pasta 4 | sim      |
| Atendente assume, responde e encerra            |                                       | `atendimento.test.ts`             | `atendimento_humano.feature` | pasta 4 | sim      |
| WhatsApp: assinatura, verificação, idempotência | `canais.test.ts`                      | `whatsapp.test.ts`                | `canais.feature`             | pasta 3 |          |
| Telegram: token secreto e update_id             | `canais.test.ts`                      | `telegram.test.ts`                | `canais.feature`             | pasta 5 |          |
| Privacidade (LGPD)                              | `privacidade.test.ts`                 | `privacidade.test.ts`             | `segunda_via.feature`        | pasta 2 | sim      |
| Observabilidade                                 | `config.test.ts`                      | `saude.test.ts`, `falhas.test.ts` |                              | pasta 1 |          |

## Defeitos encontrados pelos testes durante o desenvolvimento

| Onde                 | O que aconteceu                                                                                                                                                                                                                                                      | Correção                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Selenium             | No Chrome 155, `scrollIntoView()` passou a devolver uma Promise. O efeito `useEffect(() => ref.current?.scrollIntoView())` devolvia essa Promise ao React como se fosse a limpeza, e a tela ficava em branco após a primeira mensagem ("destroy is not a function"). | Efeito com corpo em bloco, sem retorno.         |
| Unidade              | O `Intl.NumberFormat` separa "R$" do valor com espaço não separável (U+00A0); a mensagem não batia com o texto esperado.                                                                                                                                             | Normalizar para espaço comum.                   |
| Capturas do Selenium | O selo do canal "Site" recebia a classe `.webchat`, a mesma da página do chat, e ocupava a altura da tela no console.                                                                                                                                                | Classe da página renomeada para `.pagina-chat`. |

## Política para testes instáveis

Não há novas tentativas automáticas. Esperas usam condições (`driver.wait` até o texto
aparecer), nunca pausas fixas. Um teste instável é tratado como defeito do teste.
