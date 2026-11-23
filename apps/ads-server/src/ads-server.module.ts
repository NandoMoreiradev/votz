import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { PrismaModule } from '../../api/src/prisma/prisma.module'
import { StorageService } from '../../api/src/storage/storage.service'
import { ContentAdjacencyRepository } from '../../api/src/content-adjacency/content-adjacency.repository'
import { ContentAdjacencyService } from '../../api/src/content-adjacency/content-adjacency.service'
import { AdsBillingRepository } from '../../api/src/ads/ads-billing/ads-billing.repository'
import { AdsClickLinkService } from '../../api/src/ads/ads-conversions/ads-click-link.service'
import { AdsDeliveryRepository } from '../../api/src/ads/ads-delivery/ads-delivery.repository'
import { AdsDeliveryService } from '../../api/src/ads/ads-delivery/ads-delivery.service'
import { AdsPacingService } from '../../api/src/ads/ads-delivery/ads-pacing.service'
import { AdsUserStateService } from '../../api/src/ads/ads-delivery/ads-user-state.service'
import { AdsViewerCacheService } from '../../api/src/ads/ads-viewer/ads-viewer-cache.service'
import { AdsAuthGuard } from './ads-auth.guard'
import { AdsServerController, AdsServerHealthController } from './ads-server.controller'

/**
 * Servidor de anúncios (Etapa 3 do plano): a entrega e os eventos, sem o resto da API. Usa o **mesmo código** da API
 * (`AdsDeliveryService` e companhia, importados de `apps/api/src`), então as regras de privacidade, o leilão, o ritmo e a
 * cobrança são uma coisa só; o que muda é onde roda.
 *
 * Fora de propósito, para ficar leve e seguro:
 * - **Sem agendador** (`ScheduleModule`): o fechamento do gasto (`closeSpend`) e os avisos continuam rodando só na API,
 *   uma vez, e não em dobro.
 * - **Sem filas, sem WebSocket, sem e-mail e sem login completo:** só confere o token (veja `AdsAuthGuard`).
 * - Só lê o que a entrega precisa: tabelas de anúncio, colunas liberadas de `users` e a vizinhança de relatos (teste do muro).
 * Redis, banco e variáveis são os mesmos da API. Se o Redis cair, a entrega usa o banco, como na API.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env', '../../.env.local', '../../.env'] }),
    PrismaModule,
    JwtModule.register({}),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      // Folga grande: o espaço de anúncio pede de vez em quando. É só um freio contra abuso por IP.
      useFactory: (config: ConfigService) => [{ ttl: 60_000, limit: Number(config.get('ADS_SERVER_RATE_LIMIT_PER_MINUTE')) || 600 }],
    }),
  ],
  controllers: [AdsServerController, AdsServerHealthController],
  providers: [
    AdsAuthGuard,
    AdsDeliveryService,
    AdsDeliveryRepository,
    AdsBillingRepository,
    AdsPacingService,
    AdsUserStateService,
    AdsViewerCacheService,
    AdsClickLinkService,
    ContentAdjacencyService,
    ContentAdjacencyRepository,
    StorageService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AdsServerModule {}
