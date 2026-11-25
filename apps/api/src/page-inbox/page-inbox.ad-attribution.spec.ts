// jsdom não carrega no Jest; o chat das páginas importa o sanitizador.
jest.mock('isomorphic-dompurify', () => {
  const sanitize = (v: string) => v.replace(/<[^>]+>/g, '')
  return { __esModule: true, default: { sanitize }, sanitize }
})

import { OrgType } from '@prisma/client'
import { PageInboxController } from './page-inbox.controller'

const ORG_ID = '7f1c2f1e-6c1d-4a56-9d3a-2c7f0f4a9b11'
const CLICK = 'AbCdEfGhIjKlMnOpQrStUv'
const user = { id: 'user-1', emailVerified: true }

function build() {
  const service = {
    sendAsCitizen: jest.fn().mockResolvedValue({ conversationId: 'conv-1', message: { id: 'm1' } }),
    sendMediaAsCitizen: jest.fn().mockResolvedValue({ conversationId: 'conv-1', message: { id: 'm2' } }),
  }
  const ads = { recordMessageStarted: jest.fn().mockResolvedValue('RECORDED') }
  return { service, ads, controller: new PageInboxController(service as never, ads as never) }
}

describe('chat das páginas: conversa iniciada por anúncio', () => {
  it('entrega ao serviço de anúncios SÓ quem, para qual empresa e o clique: nunca o texto', async () => {
    const { ads, controller } = build()
    await controller.send(user, OrgType.COMPANY, ORG_ID, { text: 'Oi, quero saber o preço. Meu CPF é 123', adClickId: CLICK })
    expect(ads.recordMessageStarted).toHaveBeenCalledTimes(1)
    const [argument] = ads.recordMessageStarted.mock.calls[0]
    expect(argument).toEqual({ userId: 'user-1', companyId: ORG_ID, clickId: CLICK })
    expect(JSON.stringify(ads.recordMessageStarted.mock.calls)).not.toContain('preço')
    expect(JSON.stringify(ads.recordMessageStarted.mock.calls)).not.toContain('CPF')
  })

  it('mídia enviada também conta, sem mandar a legenda nem o arquivo', async () => {
    const { ads, controller } = build()
    await controller.sendMedia(user, OrgType.COMPANY, ORG_ID, { buffer: Buffer.from('x'), originalname: 'foto.jpg' }, { caption: 'segredo', adClickId: CLICK })
    expect(ads.recordMessageStarted).toHaveBeenCalledWith({ userId: 'user-1', companyId: ORG_ID, clickId: CLICK })
    expect(JSON.stringify(ads.recordMessageStarted.mock.calls)).not.toContain('segredo')
  })

  it('sem identificador de anúncio, o serviço de anúncios nem é chamado', async () => {
    const { ads, controller } = build()
    await controller.send(user, OrgType.COMPANY, ORG_ID, { text: 'Oi' })
    expect(ads.recordMessageStarted).not.toHaveBeenCalled()
  })

  it('página que não é de empresa (político, entidade) não conta', async () => {
    const { ads, controller } = build()
    await controller.send(user, OrgType.POLITICIAN, ORG_ID, { text: 'Oi', adClickId: CLICK })
    await controller.send(user, OrgType.ENTITY, ORG_ID, { text: 'Oi', adClickId: CLICK })
    expect(ads.recordMessageStarted).not.toHaveBeenCalled()
  })

  it('se a mensagem for recusada (bloqueada, e-mail, limite), nada é contado', async () => {
    const { service, ads, controller } = build()
    service.sendAsCitizen.mockRejectedValue(new Error('Esta página não está recebendo mensagens suas.'))
    await expect(controller.send(user, OrgType.COMPANY, ORG_ID, { text: 'Oi', adClickId: CLICK })).rejects.toThrow('não está recebendo')
    expect(ads.recordMessageStarted).not.toHaveBeenCalled()
  })

  it('e-mail não confirmado: recusa antes de enviar e de contar', async () => {
    const { service, ads, controller } = build()
    await expect(controller.send({ id: 'user-1', emailVerified: false }, OrgType.COMPANY, ORG_ID, { text: 'Oi', adClickId: CLICK })).rejects.toThrow('Confirme seu e-mail')
    expect(service.sendAsCitizen).not.toHaveBeenCalled()
    expect(ads.recordMessageStarted).not.toHaveBeenCalled()
  })

  it('a mensagem volta igual, tenha ou não vindo de anúncio', async () => {
    const { controller } = build()
    await expect(controller.send(user, OrgType.COMPANY, ORG_ID, { text: 'Oi', adClickId: CLICK })).resolves.toEqual({ conversationId: 'conv-1', message: { id: 'm1' } })
  })
})
