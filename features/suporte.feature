# language: pt
Funcionalidade: Suporte para internet lenta ou sem conexão
  Como cliente sem internet
  Quero uma orientação rápida antes de esperar o suporte técnico
  Para resolver sozinho os casos simples

  Contexto:
    Dado que estou conversando pelo canal "telegram"
    E que já escolhi a opção "2" no menu

  Cenário: Reiniciar o modem resolve
    Quando envio "sim"
    Então o bot responde "Que bom que a conexão voltou!"
    E a conversa continua com o bot

  Cenário: O problema continua e o cliente vai para o suporte técnico
    Quando envio "Não"
    Então o bot responde "Vou chamar o suporte técnico para verificar sua conexão."
    E a conversa vai para a fila com o motivo "suporte_tecnico"

  Cenário: Resposta fora do esperado
    Quando envio "talvez"
    Então o bot responde "Responda SIM ou NÃO, por favor."
