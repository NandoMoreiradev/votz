import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ImprensaRepository } from './imprensa.repository'
import { ImprensaService } from './imprensa.service'
import { ImprensaController } from './imprensa.controller'

@Module({
  imports: [PrismaModule],
  controllers: [ImprensaController],
  providers: [ImprensaService, ImprensaRepository],
})
export class ImprensaModule {}
