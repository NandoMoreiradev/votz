import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { ScheduleModule } from '@nestjs/schedule'
import { BullModule } from '@nestjs/bullmq'
import { LoggerModule } from 'nestjs-pino'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { ReportsModule } from './reports/reports.module'
import { TimelineModule } from './timeline/timeline.module'
import { EntitiesModule } from './entities/entities.module'
import { PoliticiansModule } from './politicians/politicians.module'
import { VotesModule } from './votes/votes.module'
import { CommentsModule } from './comments/comments.module'
import { NotificationsModule } from './notifications/notifications.module'
import { AlertsModule } from './alerts/alerts.module'
import { MapModule } from './map/map.module'
import { PressModule } from './press/press.module'
import { AdminModule } from './admin/admin.module'
import { PublicApiModule } from './public-api/public-api.module'
import { HealthModule } from './health/health.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        serializers: {
          req(req) {
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
        connection: { url: config.get<string>('REDIS_URL') },
      }),
    }),

    PrismaModule,
    AuthModule,
    UsersModule,
    ReportsModule,
    TimelineModule,
    EntitiesModule,
    PoliticiansModule,
    VotesModule,
    CommentsModule,
    NotificationsModule,
    AlertsModule,
    MapModule,
    PressModule,
    AdminModule,
    PublicApiModule,
    HealthModule,
  ],
})
export class AppModule {}
