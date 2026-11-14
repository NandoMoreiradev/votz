import { Test, TestingModule } from '@nestjs/testing'
import { MapService } from './map.service'
import { PrismaService } from '../prisma/prisma.service'

const mockPrisma = {
  report: { findMany: jest.fn() },
}

describe('MapService', () => {
  let service: MapService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MapService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get(MapService)
    jest.clearAllMocks()
  })

  it('formats reports as GeoJSON FeatureCollection', async () => {
    mockPrisma.report.findMany.mockResolvedValue([
      {
        id: 'r1',
        title: 'Buraco',
        category: 'MOBILITY',
        status: 'OPEN',
        pressureScore: 50,
        latitude: -23.56,
        longitude: -46.65,
        city: 'São Paulo',
        _count: { votes: 10, comments: 2 },
      },
    ])

    const res = await service.getMapReports({ swLat: -24, neLat: -23, swLng: -47, neLng: -46 } as any)
    expect(res.type).toBe('FeatureCollection')
    expect(res.features).toHaveLength(1)
    expect(res.features[0].geometry.coordinates).toEqual([-46.65, -23.56])
    expect(res.features[0].properties.votes).toBe(10)
  })
})
