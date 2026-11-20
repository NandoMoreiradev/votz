import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { randomBytes } from 'crypto'
import { OrgPermission, OrgType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ActingOrgType, ActingUser, requireActingOrg } from '../auth/acting-org'
import { YoutubeApiService } from './youtube-api.service'
import { YoutubeChannelsRepository } from './youtube-channels.repository'

/** Quem pode ter canal: político (e equipe) e entidade. Imprensa fica para outra etapa. */
const CHANNEL_ORG_TYPES: readonly ActingOrgType[] = ['POLITICIAN', 'ENTITY']

export interface VerifiedStream {
  videoId: string
  channelId: string
  channelTitle: string
}

@Injectable()
export class YoutubeChannelsService {
  constructor(
    private readonly repo: YoutubeChannelsRepository,
    private readonly api: YoutubeApiService,
    private readonly prisma: PrismaService,
  ) {}

  async list(user: ActingUser) {
    const acting = await this.requireActing(user)
    return this.repo.listByOrg(acting.orgType as OrgType, acting.orgId)
  }

  async add(user: ActingUser, input: string) {
    const acting = await this.requireActing(user)
    const orgType = acting.orgType as OrgType

    const ref = this.api.parseChannelRef(input)
    if (!ref) {
      throw new BadRequestException(
        'Não entendi esse canal. Cole o link do canal (youtube.com/@nome) ou o nome com @.',
      )
    }
    const channel = await this.api.getChannel(ref)
    if (!channel) throw new NotFoundException('Não achamos esse canal no YouTube. Confira o link.')

    const existing = await this.repo.findByChannelId(channel.channelId)
    if (existing) {
      if (existing.orgType === orgType && existing.orgId === acting.orgId) return existing
      if (existing.verifiedAt) {
        throw new ConflictException('Esse canal já está ligado a outra conta do Votz.')
      }
      // Pedido de outra conta que nunca provou ser dono: não pode travar o dono de verdade.
      await this.repo.deleteUnverified(existing.id)
    }

    return this.repo.create({
      orgType,
      orgId: acting.orgId,
      channelId: channel.channelId,
      title: channel.title,
      verificationCode: `votz-${randomBytes(6).toString('hex')}`,
      createdByUserId: user.id,
    })
  }

  async verify(user: ActingUser, id: string) {
    const acting = await this.requireActing(user)
    const record = await this.repo.findOwned(id, acting.orgType as OrgType, acting.orgId)
    if (!record) throw new NotFoundException('Canal não encontrado.')
    if (record.verifiedAt) return record

    const channel = await this.api.getChannel({ kind: 'id', value: record.channelId })
    if (!channel) throw new NotFoundException('Esse canal não existe mais no YouTube.')

    if (!channel.description.includes(record.verificationCode)) {
      throw new BadRequestException(
        'Não achamos o código na descrição do canal. Cole o código, salve e tente de novo. O YouTube pode levar alguns minutos para mostrar.',
      )
    }
    return this.repo.markVerified(record.id, channel.title)
  }

  async remove(user: ActingUser, id: string) {
    const acting = await this.requireActing(user)
    const record = await this.repo.findOwned(id, acting.orgType as OrgType, acting.orgId)
    if (!record) throw new NotFoundException('Canal não encontrado.')
    await this.repo.delete(record.id)
    return { removed: true }
  }

  /**
   * Transforma o link colado em um vídeo aceito para o debate. O vídeo precisa:
   * existir, ser uma transmissão ao vivo, poder ser exibido fora do YouTube e ser de um
   * canal já verificado da organização. Só o que sai daqui é gravado.
   */
  async resolveVerifiedStream(url: string, orgType: OrgType, orgId: string): Promise<VerifiedStream> {
    const videoId = this.api.parseVideoId(url)
    if (!videoId) {
      throw new BadRequestException('Esse link não parece ser de um vídeo ou live do YouTube.')
    }

    const video = await this.api.getVideo(videoId)
    if (!video) throw new NotFoundException('Não achamos esse vídeo no YouTube. Confira o link.')

    if (video.privacyStatus === 'private') {
      throw new BadRequestException('Esse vídeo está privado. Deixe como "Não listado" ou "Público".')
    }
    if (!video.isLiveBroadcast) {
      throw new BadRequestException(
        'Esse vídeo não é uma transmissão ao vivo. Crie uma live no YouTube e cole o link dela.',
      )
    }
    if (!video.embeddable) {
      throw new BadRequestException(
        'O dono desse vídeo não deixou ele aparecer fora do YouTube. Ligue "Permitir incorporação" nas configurações da live.',
      )
    }

    const verified = await this.repo.isVerifiedFor(orgType, orgId, video.channelId)
    if (!verified) {
      throw new ForbiddenException(
        'Esse vídeo é de um canal que ainda não foi verificado como seu. Verifique o canal em "Canais do YouTube".',
      )
    }

    return { videoId, channelId: video.channelId, channelTitle: video.channelTitle }
  }

  private requireActing(user: ActingUser) {
    return requireActingOrg(this.prisma, user, CHANNEL_ORG_TYPES, OrgPermission.MANAGE_PROFILE)
  }
}
