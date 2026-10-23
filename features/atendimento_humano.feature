# language: pt
Funcionalidade: Transferência para um atendente humano
  Como cliente
  Quero falar com uma pessoa quando o bot não resolver
  Para não ficar sem resposta

  Esquema do Cenário: Pedido de atendente <quando>
    Dado que agora é "<momento>" no horário de Brasília
    E que estou conversando pelo canal "webchat"
    Quando envio "atendente"
    Então o bot responde "<resposta>"
    E a conversa vai para a fila com o motivo "pedido_do_cliente"

    Exemplos:
      | quando                       | momento          | resposta                           |
      | no meio do expediente        | 2026-10-23 10:00 | Você está na fila                  |
      | no último minuto             | 2026-10-23 17:59 | Você está na fila                  |
      | no horário de fechamento     | 2026-10-23 18:00 | de segunda a sexta, das 08h às 18h |
      | no sábado                    | 2026-10-24 10:00 | de segunda a sexta, das 08h às 18h |

  Cenário: Três respostas fora do menu levam a um atendente
    Dado que estou conversando pelo canal "whatsapp"
    Quando envio "oi"
    E envio "quero cancelar"
    E envio "cancelamento"
    E envio "CANCELAR!"
    Então o bot responde "Vou chamar um atendente para ajudar você."
    E a conversa vai para a fila com o motivo "nao_entendeu"

  Cenário: A atendente assume, conversa e encerra
    Dado que estou conversando pelo canal "webchat"
    E que pedi para falar com um atendente
    Quando a atendente "Marina" assume a conversa
    E a atendente "Marina" responde "Oi, sou a Marina. Como posso ajudar?"
    Então recebo a mensagem "Oi, sou a Marina. Como posso ajudar?"
    Quando envio "Minha internet caiu de novo"
    Então o bot não responde
    Quando a atendente "Marina" encerra a conversa
    Então recebo a mensagem "O atendente encerrou a conversa"

  Cenário: Duas atendentes tentam assumir a mesma conversa
    Dado que estou conversando pelo canal "whatsapp"
    E que pedi para falar com um atendente
    Quando "Marina" e "Paula" tentam assumir a conversa ao mesmo tempo
    Então só uma delas fica com a conversa
    E a outra recebe o aviso "Esta conversa já está com"
