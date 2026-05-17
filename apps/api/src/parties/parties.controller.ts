import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { PartiesService } from './parties.service'

@ApiTags('parties')
@Controller('parties')
export class PartiesController {
  constructor(private readonly service: PartiesService) {}

  @Get()
  @ApiOperation({ summary: 'List all active political parties' })
  findAll() {
    return this.service.findAll()
  }
}
