import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Logger } from 'nestjs-pino'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import { PublicApiModule } from './public-api/public-api.module'
import { RedisIoAdapter } from './notifications/redis-io.adapter'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })

  // Confiar no primeiro proxy reverso (Render, Nginx) para obter IP real do cliente
  app.getHttpAdapter().getInstance().set('trust proxy', 1)

  app.useLogger(app.get(Logger))

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  )
  const redisIoAdapter = new RedisIoAdapter(app)
  await redisIoAdapter.connectToRedis(process.env.REDIS_URL ?? 'redis://localhost:6379')
  app.useWebSocketAdapter(redisIoAdapter)
  app.use(cookieParser())

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })

  // ValidationPipe global — seção 14.2 do documento de escopo
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  app.setGlobalPrefix('api/v1')

  if (process.env.NODE_ENV !== 'production') {
    // Swagger principal — todas as rotas internas
    const mainConfig = new DocumentBuilder()
      .setTitle('Votz API')
      .setDescription('Infraestrutura de accountability cívico do Brasil')
      .setVersion('1.0')
      .addBearerAuth()
      .build()
    const mainDoc = SwaggerModule.createDocument(app, mainConfig)
    SwaggerModule.setup('api/docs', app, mainDoc)

    // Swagger público — somente rotas do PublicApiModule
    const publicConfig = new DocumentBuilder()
      .setTitle('Votz — API Pública')
      .setDescription(
        'API read-only para desenvolvedores e portais de notícias.\n\n' +
        '**Autenticação:** envie sua API key no cabeçalho `x-api-key`.\n\n' +
        'Gere sua key em `POST /api/v1/api-keys` (requer conta verificada).\n\n' +
        '**Rate limit:** 1.000 req/h (FREE) · 10.000 req/h (PAID)',
      )
      .setVersion('1.0')
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
      .build()
    const publicDoc = SwaggerModule.createDocument(app, publicConfig, {
      include: [PublicApiModule],
    })
    SwaggerModule.setup('api-publica/docs', app, publicDoc)
  }

  const port = process.env.API_PORT ?? 3000
  await app.listen(port)

  app.get(Logger).log(`Votz API rodando em http://localhost:${port}/api/v1`)
  app.get(Logger).log(`Swagger interno em http://localhost:${port}/api/docs`)
  if (process.env.NODE_ENV !== 'production') {
    app.get(Logger).log(`Swagger público em http://localhost:${port}/api-publica/docs`)
  }
}

bootstrap()
