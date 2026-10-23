# language: pt
Funcionalidade: Segunda via da fatura pelo chatbot
  Como cliente do provedor de internet
  Quero receber a segunda via da fatura sem esperar um atendente
  Para pagar a conta a qualquer hora

  Contexto:
    Dado que estou conversando pelo canal "whatsapp"
    E que já escolhi a opção "1" no menu

  Cenário: Cliente com fatura em aberto recebe a segunda via
    Quando envio "123.456.789-09"
    Então o bot responde "R$ 99,90, com vencimento em 10/11/2026"
    E o bot responde "Enviei a segunda via para a***@example.com"

  Cenário: Cliente sem fatura em aberto
    Quando envio "111.444.777-35"
    Então o bot responde "Você não tem faturas em aberto."

  Esquema do Cenário: CPF recusado: <caso>
    Quando envio "<cpf>"
    Então o bot responde "<resposta>"
    E a conversa continua com o bot

    Exemplos:
      | caso                      | cpf            | resposta                            |
      | dígito verificador errado | 123.456.789-00 | CPF inválido                        |
      | só 10 dígitos             | 1234567890     | CPF inválido                        |
      | todos os dígitos iguais   | 111.111.111-11 | CPF inválido                        |
      | válido, mas sem contrato  | 987.654.321-00 | Não encontrei contrato com esse CPF |

  Cenário: Três CPFs não confirmados levam a um atendente
    Quando envio "000"
    E envio "123"
    E envio "456"
    Então o bot responde "Não consegui confirmar o CPF"
    E a conversa vai para a fila com o motivo "cpf_invalido"

  @privacidade
  Cenário: O histórico não guarda o CPF completo
    Quando envio "123.456.789-09"
    Então o histórico mostra "***.456.789-**"
    E o histórico não contém "123.456.789-09"
