import { Test, TestingModule } from '@nestjs/testing'
import { getQueueToken } from '@nestjs/bullmq'
import { PoliticianStatus } from '@prisma/client'
import AdmZip from 'adm-zip'
import {
  deriveElectionYearFromTerm,
  filterTseElectedRows,
  getLatestConcludedElectionYear,
  getTermDatesForCargo,
  normalizePartyAbbreviation,
  normalizePersonName,
  parseTseCsvLine,
} from '@votz/shared-types'
import { TseSyncService, TSE_SYNC_QUEUE } from './tse-sync.service'
import { PrismaService } from '../prisma/prisma.service'

const mockQueue = { add: jest.fn() }
const mockPrisma = {
  party: { findMany: jest.fn(), upsert: jest.fn() },
  politician: { findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
}

function buildZipBuffer(csvContent: string, filename = 'consulta_cand_2026_BRASIL.csv'): Buffer {
  const zip = new AdmZip()
  zip.addFile(filename, Buffer.from(csvContent, 'latin1'))
  return zip.toBuffer()
}

describe('Election helpers (@votz/shared-types)', () => {
  it('detects 2026 as latest general election in November 2026', () => {
    expect(getLatestConcludedElectionYear('general', new Date('2026-11-14T12:00:00Z'))).toBe(2026)
    expect(getLatestConcludedElectionYear('general', new Date('2026-06-01T12:00:00Z'))).toBe(2022)
    expect(getLatestConcludedElectionYear('municipal', new Date('2026-11-14T12:00:00Z'))).toBe(2024)
  })

  it('computes Brazilian mandate dates accurately by office', () => {
    const gov = getTermDatesForCargo('GOVERNADOR', 2026)
    expect(gov.termStart.toISOString()).toBe('2027-01-01T00:00:00.000Z')
    expect(gov.termEnd.toISOString()).toBe('2030-12-31T23:59:59.999Z')

    const dep = getTermDatesForCargo('DEPUTADO ESTADUAL', 2026)
    expect(dep.termStart.toISOString()).toBe('2027-02-01T00:00:00.000Z')
    expect(dep.termEnd.toISOString()).toBe('2031-01-31T23:59:59.999Z')

    const sen = getTermDatesForCargo('SENADOR', 2026)
    expect(sen.termStart.toISOString()).toBe('2027-02-01T00:00:00.000Z')
    expect(sen.termEnd.toISOString()).toBe('2035-01-31T23:59:59.999Z')
  })

  it('derives photo election year from termEnd for 2022, 2024 and 2026', () => {
    expect(
      deriveElectionYearFromTerm(
        'Governador',
        new Date('2023-01-01T00:00:00Z'),
        new Date('2030-12-31T23:59:59Z'),
      ),
    ).toBe(2026)
    expect(
      deriveElectionYearFromTerm(
        'Deputado Estadual',
        new Date('2027-02-01T00:00:00Z'),
        new Date('2031-01-31T23:59:59Z'),
      ),
    ).toBe(2026)
    expect(
      deriveElectionYearFromTerm(
        'Prefeito',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2028-12-31T23:59:59Z'),
      ),
    ).toBe(2024)
  })

  it('parses quoted CSV fields containing semicolons and normalizes names/parties', () => {
    const cols = parseTseCsvLine('"123";"SILVA; JR";"ELEITO"')
    expect(cols).toEqual(['123', 'SILVA; JR', 'ELEITO'])
    expect(normalizePersonName('João da Silva-Neto')).toBe('JOAO DA SILVA NETO')
    expect(normalizePartyAbbreviation('PODEMOS')).toBe('PODE')
    expect(normalizePartyAbbreviation('PC do B')).toBe('PCdoB')
  })

  it('filters elected rows and deduplicates by SQ_CANDIDATO keeping latest round', () => {
    const csv = [
      '"NR_TURNO";"SQ_CANDIDATO";"DS_CARGO";"DS_SIT_TOT_TURNO";"NM_URNA_CANDIDATO"',
      '"1";"100";"GOVERNADOR";"2º TURNO";"FULANO"',
      '"2";"100";"GOVERNADOR";"ELEITO";"FULANO"',
      '"1";"101";"GOVERNADOR";"NÃO ELEITO";"BELTRANO"',
    ].join('\n')

    const rows = filterTseElectedRows(csv, ['GOVERNADOR'])
    expect(rows).toHaveLength(1)
    expect(rows[0]['SQ_CANDIDATO']).toBe('100')
    expect(rows[0]['NR_TURNO']).toBe('2')
  })
})

describe('TseSyncService', () => {
  let service: TseSyncService
  const originalFetch = global.fetch

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TseSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(TSE_SYNC_QUEUE), useValue: mockQueue },
      ],
    }).compile()

    service = module.get(TseSyncService)
    jest.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('enqueues sync job with election year', async () => {
    mockQueue.add.mockResolvedValue({})
    const res = await service.triggerSync('geral', 2026)
    expect(res.message).toContain('2026')
    expect(mockQueue.add).toHaveBeenCalledWith(
      'geral',
      { year: 2026 },
      expect.objectContaining({ jobId: 'tse-geral-2026' }),
    )
  })

  it('reconciles re-elected 2026 politicians without duplicating and preserves avatarUrl & Câmara tseId', async () => {
    const csv = [
      '"NR_TURNO";"SQ_CANDIDATO";"DS_CARGO";"DS_SIT_TOT_TURNO";"SG_UF";"NM_UE";"SG_PARTIDO";"NR_PARTIDO";"NM_PARTIDO";"NM_CANDIDATO";"NM_URNA_CANDIDATO"',
      '"1";"900001";"DEPUTADO FEDERAL";"ELEITO POR QP";"SP";"SP";"PT";"13";"PARTIDO DOS TRABALHADORES";"MARIA SILVA";"MARIA SILVA"',
      '"1";"900002";"GOVERNADOR";"ELEITO";"MG";"MG";"NOVO";"30";"PARTIDO NOVO";"JOAO SOUZA";"JOÃO SOUZA"',
      '"1";"900003";"DEPUTADO ESTADUAL";"ELEITO POR MÉDIA";"BA";"BA";"MISSAO";"14";"PARTIDO MISSÃO";"CARLOS LIMA";"CARLOS LIMA"',
    ].join('\n')

    const zipBuffer = buildZipBuffer(csv)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => zipBuffer,
    }) as any

    mockPrisma.party.findMany.mockResolvedValue([
      { id: 'p-pt', abbreviation: 'PT', number: 13 },
      { id: 'p-novo', abbreviation: 'NOVO', number: 30 },
    ])
    mockPrisma.party.upsert.mockResolvedValue({
      id: 'p-missao',
      abbreviation: 'MISSAO',
      number: 14,
    })

    // Maria já existe vinda da Câmara (tseId numérico), João existe como ENCERRADO de 2022
    mockPrisma.politician.findMany.mockResolvedValue([
      {
        id: 'pol-maria',
        tseId: '204534',
        name: 'Maria Silva',
        office: 'Deputado Federal',
        state: 'SP',
        city: null,
        status: PoliticianStatus.ATIVO,
        termStart: new Date('2023-02-01T00:00:00Z'),
        termEnd: new Date('2027-01-31T23:59:59Z'),
        avatarUrl: 'https://camara.leg.br/foto.jpg',
      },
      {
        id: 'pol-joao',
        tseId: 'TSE-2022-555',
        name: 'João Souza',
        office: 'Governador',
        state: 'MG',
        city: null,
        status: PoliticianStatus.ENCERRADO,
        termStart: new Date('2023-01-01T00:00:00Z'),
        termEnd: new Date('2026-12-31T23:59:59Z'),
        avatarUrl: 'https://r2.dev/avatars/joao.jpg',
      },
    ])

    mockPrisma.politician.update.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      ...data,
      avatarUrl: 'https://preserved',
    }))
    mockPrisma.politician.create.mockImplementation(async ({ data }: any) => ({
      id: 'pol-carlos',
      ...data,
    }))

    const result = await service.syncEleicaoGeral(2026)

    expect(result.electionYear).toBe(2026)
    expect(result.updated).toBe(1) // Maria
    expect(result.reactivated).toBe(1) // João
    expect(result.created).toBe(1) // Carlos (partido novo auto-criado!)
    expect(result.skipped).toBe(0)

    // Maria mantém o tseId da Câmara ('204534') e não recebe avatarUrl: null
    const mariaUpdate = mockPrisma.politician.update.mock.calls[0][0].data
    expect(mariaUpdate.tseId).toBeUndefined()
    expect(mariaUpdate.avatarUrl).toBeUndefined()
    expect(mariaUpdate.termEnd).toEqual(new Date('2031-01-31T23:59:59.999Z'))

    // João é reativado com o novo SQ_CANDIDATO e termEnd 2030
    const joaoUpdate = mockPrisma.politician.update.mock.calls[1][0].data
    expect(joaoUpdate.status).toBe(PoliticianStatus.ATIVO)
    expect(joaoUpdate.tseId).toBe('TSE-900002')
    expect(joaoUpdate.termEnd).toEqual(new Date('2030-12-31T23:59:59.999Z'))
  })

  it('falls back to previous cycle when TSE returns 404 without explicit year', async () => {
    const csv = [
      '"SQ_CANDIDATO";"DS_CARGO";"DS_SIT_TOT_TURNO";"SG_UF";"NM_UE";"SG_PARTIDO";"NR_PARTIDO";"NM_PARTIDO";"NM_CANDIDATO";"NM_URNA_CANDIDATO"',
    ].join('\n')
    const zipBuffer = buildZipBuffer(csv)

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => zipBuffer }) as any

    mockPrisma.party.findMany.mockResolvedValue([])
    mockPrisma.politician.findMany.mockResolvedValue([])

    const res = await service.syncPresidenteGovernadores()
    expect(res.electionYear).toBeLessThanOrEqual(2026)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
})
