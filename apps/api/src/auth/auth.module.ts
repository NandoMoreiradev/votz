import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { BullModule } from '@nestjs/bullmq'
import { ConfigService } from '@nestjs/config'
import { AuthController } from './auth.controller'
import { MobileAuthController } from './mobile-auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './strategies/jwt.strategy'
import { GoogleStrategy } from './strategies/google.strategy'
import { MailModule } from '../mail/mail.module'
import { AccessLogModule } from '../access-log/access-log.module'
import { REFRESH_CLEANUP_QUEUE, RefreshCleanupService } from './refresh-cleanup.service'
import { RefreshCleanupProcessor } from './refresh-cleanup.processor'
import { RefreshCleanupCron } from './refresh-cleanup.cron'

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN', '15m'),
          algorithm: 'HS256',
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    BullModule.registerQueue({ name: REFRESH_CLEANUP_QUEUE }),
    MailModule,
    AccessLogModule,
  ],
  controllers: [AuthController, MobileAuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleStrategy,
    RefreshCleanupService,
    RefreshCleanupProcessor,
    RefreshCleanupCron,
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
