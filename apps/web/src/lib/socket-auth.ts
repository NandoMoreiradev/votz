import type { Socket } from 'socket.io-client'
import { getToken } from './token'
import { refreshSession } from './api'

/**
 * Credencial do socket lida A CADA conexão e reconexão. O token de acesso dura 15 minutos: se o
 * socket guardasse o valor da primeira conexão, qualquer queda de rede depois disso reconectaria
 * com token vencido e seria recusada.
 */
export function socketAuth(cb: (data: { token: string }) => void): void {
  cb({ token: `Bearer ${getToken() ?? ''}` })
}

const MAX_REFRESH_ATTEMPTS = 3

/**
 * Quando o servidor encerra a conexão (token vencido, por exemplo), o socket.io NÃO tenta
 * reconectar sozinho. Aqui renovamos a sessão e conectamos de novo, no máximo algumas vezes
 * seguidas: se a renovação falha (sessão encerrada, conta banida), paramos.
 */
export function reconnectWithFreshToken(socket: Socket): void {
  let attempts = 0

  socket.on('connect', () => {
    attempts = 0
  })

  socket.on('disconnect', (reason) => {
    if (reason !== 'io server disconnect') return
    if (attempts >= MAX_REFRESH_ATTEMPTS) return
    attempts += 1
    void refreshSession()
      .then(() => {
        socket.connect()
      })
      .catch(() => undefined)
  })
}
