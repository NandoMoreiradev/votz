import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { ScheduleModule } from '@nestjs/schedule'
import { BullModule } from '@nestjs/bullmq'
import { LoggerModule } from 'nestjs-pino'
import { createPinoHttpConfig } from './common/logger/pino-config'
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
import { HandlesModule } from './handles/handles.module'
import { PageInboxModule } from './page-inbox/page-inbox.module'
import { VotesModule } from './votes/votes.module'
import { CommentsModule } from './comments/comments.module'
import { NotificationsModule } from './notifications/notifications.module'
import { ConversationsModule } from './conversations/conversations.module'
import { AlertsModule } from './alerts/alerts.module'
import { MapModule } from './map/map.module'
import { PressModule } from './press/press.module'
import { ImprensaModule } from './imprensa/imprensa.module'
import { AdminModule } from './admin/admin.module'
import { PublicApiModule } from './public-api/public-api.module'
import { StorageModule } from './storage/storage.module'
import { HealthModule } from './health/health.module'
import { CompaniesModule } from './companies/companies.module'
import { AdsPreferencesModule } from './ads/ads-preferences/ads-preferences.module'
import { AdsCampaignsModule } from './ads/ads-campaigns/ads-campaigns.module'
import { AdsBillingModule } from './ads/ads-billing/ads-billing.module'
import { AdsConversionsModule } from './ads/ads-conversions/ads-conversions.module'
import { AdsDeliveryModule } from './ads/ads-delivery/ads-delivery.module'
import { AdsReachModule } from './ads/ads-reach/ads-reach.module'
import { AdsVolumeModule } from './ads/ads-volume/ads-volume.module'
import { AdsExperimentsModule } from './ads/ads-experiments/ads-experiments.module'
import { AdsLibraryModule } from './ads/ads-library/ads-library.module'
import { AdsAlertsModule } from './ads/ads-alerts/ads-alerts.module'
import { AdsFraudModule } from './ads/ads-fraud/ads-fraud.module'
import { AdsLandingModule } from './ads/ads-landing/ads-landing.module'
import { CamaraSyncModule } from './camara-sync/camara-sync.module'
import { IbgeSyncModule } from './ibge-sync/ibge-sync.module'
import { SenadoSyncModule } from './senado-sync/senado-sync.module'
import { TseSyncModule } from './tse-sync/tse-sync.module'
import { PropostasModule } from './propostas/propostas.module'
import { PlansModule } from './plans/plans.module'
import { TranscriptionModule } from './transcription/transcription.module'
import { SubscricoesModule } from './subscricoes/subscricoes.module'
import { MandateExpiryModule } from './mandate-expiry/mandate-expiry.module'
import { DebatesModule } from './debates/debates.module'
import { YoutubeModule } from './youtube/youtube.module'
import { AccessLogModule } from './access-log/access-log.module'
import { VerificationRetentionModule } from './verification-retention/verification-retention.module'
import { InactivityModule } from './inactivity/inactivity.module'
import { ModerationModule } from './moderation/moderation.module'
import { ContentSafetyModule } from './content-safety/content-safety.module'
import { AnalyticsModule } from './analytics/analytics.module'
import { AccountabilityModule } from './accountability/accountability.module'
import { MandateModule } from './mandate/mandate.module'
import { ShareCardsModule } from './share-cards/share-cards.module'
import { SlaModule } from './sla/sla.module'
import { WebhooksModule } from './webhooks/webhooks.module'
import { GifsModule } from './gifs/gifs.module'
import { TopicsModule } from './topics/topics.module'
import { PostsModule } from './posts/posts.module'
import { SuggestionsModule } from './suggestions/suggestions.module'
import { ContextNotesModule } from './context-notes/context-notes.module'
import { SurveysModule } from './surveys/surveys.module'
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard'
import { validateEnv } from './config/env.validation'
import { RedisThrottlerStorage } from './common/security/redis-throttler-storage'
import { SecurityModule } from './common/security/security.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env.local', '../../.env'],
      validate: validateEnv,
    }),
    SecurityModule,

    LoggerModule.forRoot({
      pinoHttp: createPinoHttpConfig(),
    }),

    // Rate limiting — section 16.1
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          { name: 'short', ttl: 1000, limit: 10 },
          { name: 'medium', ttl: 10000, limit: 50 },
          { name: 'long', ttl: 60000, limit: 200 },
        ],
        storage: new RedisThrottlerStorage(config.get<string>('REDIS_URL')),
      }),
    }),

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
    HandlesModule,
    PageInboxModule,
    VotesModule,
    CommentsModule,
    NotificationsModule,
    ConversationsModule,
    AlertsModule,
    MapModule,
    PressModule,
    ImprensaModule,
    AdminModule,
    PublicApiModule,
    HealthModule,
    CompaniesModule,
    AdsPreferencesModule,
    AdsCampaignsModule,
    AdsBillingModule,
    AdsDeliveryModule,
    AdsReachModule,
    AdsVolumeModule,
    AdsExperimentsModule,
    AdsLibraryModule,
    AdsAlertsModule,
    AdsFraudModule,
    AdsLandingModule,
    AdsConversionsModule,
    CamaraSyncModule,
    IbgeSyncModule,
    SenadoSyncModule,
    TseSyncModule,
    PropostasModule,
    PlansModule,
    TranscriptionModule,
    SubscricoesModule,
    MandateExpiryModule,
    DebatesModule,
    YoutubeModule,
    AccessLogModule,
    VerificationRetentionModule,
    InactivityModule,
    ModerationModule,
    ContentSafetyModule,
    AnalyticsModule,
    WebhooksModule,
    AccountabilityModule,
    ShareCardsModule,
    MandateModule,
    SlaModule,
    GifsModule,
    TopicsModule,
    PostsModule,
    SuggestionsModule,
    ContextNotesModule,
    SurveysModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
