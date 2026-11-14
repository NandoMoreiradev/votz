import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { AlertsService, ALERTS_QUEUE } from './alerts.service'
import { AlertsRepository } from './alerts.repository'
import { NotificationsService } from '../notifications/notifications.service'
import { MailService } from '../mail/mail.service'

const mockRepo = {
  countRecentReports: jest.fn(),
  upsertSurto: jest.fn(),
  linkReportsToSurto: jest.fn(),
  findTopEntityUserForSurto: jest.fn(),
  findVerifiedPressUsers: jest.fn(),
  reassessAll: jest.fn(),
  findActive: jest.fn(),
  findOneWithReports: jest.fn(),
}

const mockNotifications = { notify: jest.fn().mockResolvedValue(undefined) }
const mockMail = { sendSurtoAlert: jest.fn().mockResolvedValue(undefined) }
const mockQueue = { add: jest.fn() }

describe('AlertsService', () => {
  let service: AlertsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: AlertsRepository, useValue: mockRepo },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: MailService, useValue: mockMail },
        { provide: getQueueToken(ALERTS_QUEUE), useValue: mockQueue },
      ],
    }).compile()

    service = module.get(AlertsService)
    jest.clearAllMocks()
    mockNotifications.notify.mockResolvedValue(undefined)
    mockMail.sendSurtoAlert.mockResolvedValue(undefined)
  })

  it('skips enqueueCheck when city is empty', async () => {
    await service.enqueueCheck('HEALTH', '', 'SP')
    expect(mockQueue.add).not.toHaveBeenCalled()
  })

  it('activates surto and notifies entity & verified press when threshold >= 5 is reached', async () => {
    mockRepo.countRecentReports.mockResolvedValue(6)
    mockRepo.upsertSurto.mockResolvedValue({ surto: { id: 'surto-1' }, justActivated: true })
    mockRepo.linkReportsToSurto.mockResolvedValue(6)
    mockRepo.findTopEntityUserForSurto.mockResolvedValue('ent-user-1')
    mockRepo.findVerifiedPressUsers.mockResolvedValue([
      { email: 'jornal@ex.com', name: 'Jornalista' },
    ])

    await service.checkSurto('HEALTH', 'São Paulo', 'SP')
    await new Promise((r) => setImmediate(r))

    expect(mockRepo.linkReportsToSurto).toHaveBeenCalled()
    expect(mockNotifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'ent-user-1', type: 'SURTO_DETECTED' }),
    )
    expect(mockMail.sendSurtoAlert).toHaveBeenCalledWith(
      'jornal@ex.com',
      'Jornalista',
      expect.objectContaining({ surtoId: 'surto-1', count: 6 }),
    )
  })
})
