import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

/** Só toca `ad_user_preferences` e as duas colunas liberadas de `users` (`birth_date`, `gender`). */
@Injectable()
export class AdsPreferencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPreference(userId: string) {
    return this.prisma.adUserPreference.findUnique({ where: { userId } })
  }

  findDemographics(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { birthDate: true, gender: true } })
  }

  upsert(userId: string, data: { personalizationConsent?: boolean; consentAt?: Date | null; consentVersion?: string | null; interests?: string[] }) {
    return this.prisma.adUserPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    })
  }
}
