import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common'
import { createHash, randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { CreateApiKeyDto } from './dto/create-api-key.dto'
import { ApiKeyTier } from '@prisma/client'

const MAX_ACTIVE_KEYS = 10
const KEY_PREFIX       = 'vtz_'
const DISPLAY_PREFIX_LEN = 12 // chars shown to the user e.g. "vtz_abc12345"

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateApiKeyDto) {
    const active = await this.prisma.apiKey.count({
      where: { userId, revokedAt: null },
    })
    if (active >= MAX_ACTIVE_KEYS) {
      throw new ConflictException(`Limite de ${MAX_ACTIVE_KEYS} API keys ativas por usuário`)
    }

    const rawKey = KEY_PREFIX + randomBytes(32).toString('base64url')
    const keyHash = createHash('sha256').update(rawKey).digest('hex')
    const prefix  = rawKey.slice(0, DISPLAY_PREFIX_LEN)

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name:    dto.name,
        keyHash,
        prefix,
        tier:    dto.tier ?? ApiKeyTier.FREE,
        userId,
      },
      select: {
        id: true, name: true, prefix: true, tier: true,
        createdAt: true, lastUsedAt: true, revokedAt: true,
      },
    })

    // The raw key is returned ONCE — never stored in plain text
    return { ...apiKey, key: rawKey }
  }

  async findAllByUser(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, prefix: true, tier: true,
        lastUsedAt: true, revokedAt: true, createdAt: true,
      },
    })
  }

  async revoke(id: string, userId: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } })
    if (!key) throw new NotFoundException('API key não encontrada')
    if (key.userId !== userId) throw new ForbiddenException()
    if (key.revokedAt) throw new ConflictException('API key já foi revogada')

    await this.prisma.apiKey.update({
      where: { id },
      data:  { revokedAt: new Date() },
    })

    return { revoked: true }
  }

  findByHash(keyHash: string) {
    return this.prisma.apiKey.findUnique({ where: { keyHash } })
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id },
      data:  { lastUsedAt: new Date() },
    })
  }
}
