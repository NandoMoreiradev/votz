import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { ScheduleModule } from '@nestjs/schedule'
import { BullModule } from '@nestjs/bullmq'
import { LoggerModule } from 'nestjs-pino'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { UsuariosModule } from './usuarios/usuarios.module'
import { RelatosModule } from './relatos/relatos.module'
import { TimelineModule } from './timeline/timeline.module'
import { EntidadesModule } from './entidades/entidades.module'
import { PoliticosModule } from './politicos/politicos.module'
import { VotosModule } from './votos/votos.module'
import { ComentariosModule } from './comentarios/comentarios.module'
import { NotificacoesModule } from './notificacoes/notificacoes.module'
import { AlertasModule } from './alertas/alertas.module'
import { MapaModule } from './mapa/mapa.module'
import { ImprensaModule } from './imprensa/imprensa.module'
import { AdminModule } from './admin/admin.module'
import { ApiPublicaModule } from './api-publica/api-publica.module'
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

    // Rate limiting global — seção 16.1
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
        },
      }),
    }),

    PrismaModule,
    AuthModule,
    UsuariosModule,
    RelatosModule,
    TimelineModule,
    EntidadesModule,
    PoliticosModule,
    VotosModule,
    ComentariosModule,
    NotificacoesModule,
    AlertasModule,
    MapaModule,
    ImprensaModule,
    AdminModule,
    ApiPublicaModule,
    HealthModule,
  ],
})
export class AppModule {}
