import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import helmet from 'helmet'
import { AdsServerModule } from './ads-server.module'

/** Sobe o servidor de anúncios. Mesmo prefixo, mesmas validações e mesmo CORS da API: o site e o celular só trocam o endereço. */
async function bootstrap() {
  const app = await NestFactory.create(AdsServerModule)
  const logger = new Logger('AdsServer')

  // Confia no primeiro proxy reverso (Render, Railway, Caddy) para ver o IP real.
  app.getHttpAdapter().getInstance().set('trust proxy', 1)
  app.use(helmet({ crossOriginEmbedderPolicy: false }))
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }))
  app.setGlobalPrefix('api/v1')
  app.enableShutdownHooks()

  const port = Number(process.env.ADS_SERVER_PORT ?? process.env.PORT ?? 3100)
  await app.listen(port)
  logger.log(`Servidor de anúncios no ar na porta ${port}`)
}

bootstrap().catch((error) => {
  console.error('O servidor de anúncios não subiu:', error)
  process.exit(1)
})
