import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { SenadoSyncService, SENADO_SYNC_QUEUE } from './senado-sync.service'
import { PrismaService } from '../prisma/prisma.service'

const mockQueue = { add: jest.fn() }
const mockPrisma = {
  party: { findMany: jest.fn() },
  politician: { findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
}

describe('SenadoSyncService', () => {
  let service: SenadoSyncService
  const originalFetch = global.fetch

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SenadoSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(SENADO_SYNC_QUEUE), useValue: mockQueue },
      ],
    }).compile()

    service = module.get(SenadoSyncService)
    jest.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('parses XML titulares, maps PODEMOS -> PODE, and ignores suplentes', async () => {
    const xml = `
      <ListaParlamentarEmExercicio>
        <Parlamentares>
          <Parlamentar>
            <IdentificacaoParlamentar>
              <CodigoParlamentar>5988</CodigoParlamentar>
              <NomeParlamentar>Marcos Silva</NomeParlamentar>
              <FormaTratamento>Senador</FormaTratamento>
              <SiglaPartidoParlamentar>PODEMOS</SiglaPartidoParlamentar>
              <UfParlamentar>PR</UfParlamentar>
            </IdentificacaoParlamentar>
            <Mandatos>
              <Mandato>
                <DescricaoParticipacao>Titular</DescricaoParticipacao>
                <PrimeiraLegislatura><DataInicio>2023-02-01</DataInicio><DataFim>2027-01-31</DataFim></PrimeiraLegislatura>
                <SegundaLegislatura><DataInicio>2027-02-01</DataInicio><DataFim>2031-01-31</DataFim></SegundaLegislatura>
              </Mandato>
            </Mandatos>
          </Parlamentar>
          <Parlamentar>
            <IdentificacaoParlamentar>
              <CodigoParlamentar>9999</CodigoParlamentar>
              <NomeParlamentar>Suplente Ignorado</NomeParlamentar>
              <FormaTratamento>Senador</FormaTratamento>
              <SiglaPartidoParlamentar>PT</SiglaPartidoParlamentar>
              <UfParlamentar>SP</UfParlamentar>
            </IdentificacaoParlamentar>
            <Mandatos>
              <Mandato><DescricaoParticipacao>1º Suplente</DescricaoParticipacao></Mandato>
            </Mandatos>
          </Parlamentar>
        </Parlamentares>
      </ListaParlamentarEmExercicio>
    `

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => xml,
    }) as any

    mockPrisma.party.findMany.mockResolvedValue([{ id: 'p-pode', abbreviation: 'PODE' }])
    mockPrisma.politician.findMany.mockResolvedValue([])
    mockPrisma.politician.create.mockResolvedValue({ id: 'pol-1', tseId: 'SEN-5988' })

    const res = await service.runSync()

    expect(res.created).toBe(1)
    expect(res.updated).toBe(0)
    expect(res.skipped).toBe(0)
    expect(mockPrisma.politician.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tseId: 'SEN-5988', partyId: 'p-pode', state: 'PR' }),
      }),
    )
  })
})
