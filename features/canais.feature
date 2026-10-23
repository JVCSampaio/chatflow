# language: pt
Funcionalidade: Atendimento omnichannel
  Como empresa
  Quero o mesmo atendimento no WhatsApp, no Telegram e no site
  Para que o cliente escolha o canal sem perder qualidade

  Esquema do Cenário: O mesmo fluxo no canal <canal>
    Dado que estou conversando pelo canal "<canal>"
    Quando envio "oi"
    Então o bot responde "Sou o assistente virtual do atendimento."
    E o bot responde "1 - Segunda via da fatura"

    Exemplos:
      | canal    |
      | whatsapp |
      | telegram |
      | webchat  |

  Cenário: Áudio no WhatsApp
    Dado que estou conversando pelo canal "whatsapp"
    Quando envio um áudio
    Então o bot responde "só consigo ler mensagens de texto"

  Cenário: O WhatsApp entrega a mesma mensagem mais de uma vez
    Dado que estou conversando pelo canal "whatsapp"
    Quando o WhatsApp entrega a mensagem "oi" 3 vezes
    Então a mensagem é processada uma única vez

  Cenário: "Sair" encerra a conversa em qualquer etapa
    Dado que estou conversando pelo canal "telegram"
    E que já escolhi a opção "1" no menu
    Quando envio "SAIR"
    Então o bot responde "Atendimento encerrado. Obrigado pelo contato!"
