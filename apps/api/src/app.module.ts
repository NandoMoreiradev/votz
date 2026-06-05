import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { ScheduleModule } from '@nestjs/schedule'
import { BullModule } from '@nestjs/bullmq'
import { LoggerModule } from 'nestjs-pino'
import { PrismaModule } from './prisma/prisma.module'
import { MailModule } from './mail/mail.module'
import { CryptoModule } from './crypto/crypto.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { ReportsModule } from './reports/reports.module'
import { TimelineModule } from './timeline/timeline.module'
import { EntitiesModule } from './entities/entities.module'
import { PoliticiansModule } from './politicians/politicians.module'
import { PartiesModule } from './parties/parties.module'
import { RegistrationRequestsModule } from './registration-requests/registration-requests.module'
import { OrgMembershipsModule } from './org-memberships/org-memberships.module'
import { VotesModule } from './votes/votes.module'
import { CommentsModule } from './comments/comments.module'
import { NotificationsModule } from './notifications/notifications.module'
import { AlertsModule } from './alerts/alerts.module'
import { MapModule } from './map/map.module'
import { PressModule } from './press/press.module'
import { ImprensaModule } from './imprensa/imprensa.module'
import { AdminModule } from './admin/admin.module'
import { PublicApiModule } from './public-api/public-api.module'
import { StorageModule } from './storage/storage.module'
import { HealthModule } from './health/health.module'
import { CompaniesModule } from './companies/companies.module'
import { CamaraSyncModule } from './camara-sync/camara-sync.module'
import { IbgeSyncModule } from './ibge-sync/ibge-sync.module'
import { SenadoSyncModule } from './senado-sync/senado-sync.module'
import { TseSyncModule } from './tse-sync/tse-sync.module'
import { PropostasModule } from './propostas/propostas.module'
import { TranscriptionModule } from './transcription/transcription.module'
import { SubscricoesModule } from './subscricoes/subscricoes.module'
import { MandateExpiryModule } from './mandate-expiry/mandate-expiry.module'
import { DebatesModule } from './debates/debates.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env.local', '../../.env'],
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        serializers: {
          req(req: { method: string; url: string }) {
            return { method: req.method, url: req.url }
          },
        },
      },
    }),

    // Rate limiting — section 16.1
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 10000, limit: 50 },
      { name: 'long', ttl: 60000, limit: 200 },
    ]),

    ScheduleModule.forRoot(),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL'),
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          retryStrategy: (times: number) => {
            if (times > 5) return null
            return Math.min(times * 1000, 10000)
          },
        },
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 100,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      }),
    }),

    PrismaModule,
    MailModule,
    CryptoModule,
    StorageModule,
    AuthModule,
    UsersModule,
    ReportsModule,
    TimelineModule,
    EntitiesModule,
    PoliticiansModule,
    PartiesModule,
    RegistrationRequestsModule,
    OrgMembershipsModule,
    VotesModule,
    CommentsModule,
    NotificationsModule,
    AlertsModule,
    MapModule,
    PressModule,
    ImprensaModule,
    AdminModule,
    PublicApiModule,
    HealthModule,
    CompaniesModule,
    CamaraSyncModule,
    IbgeSyncModule,
    SenadoSyncModule,
    TseSyncModule,
    PropostasModule,
    TranscriptionModule,
    SubscricoesModule,
    MandateExpiryModule,
    DebatesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
