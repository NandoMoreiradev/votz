import { Module } from '@nestjs/common'
import { RegistrationRequestsController } from './registration-requests.controller'
import { RegistrationRequestsService } from './registration-requests.service'
import { RegistrationRequestsRepository } from './registration-requests.repository'

@Module({
  controllers: [RegistrationRequestsController],
  providers: [RegistrationRequestsService, RegistrationRequestsRepository],
})
export class RegistrationRequestsModule {}
