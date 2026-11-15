import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { PartiesService } from './parties.service'
import { Public } from '../auth/decorators/public.decorator'

@ApiTags('parties')
@Public()
@Controller('parties')
export class PartiesController {
  constructor(private readonly service: PartiesService) {}

  @Get()
  @ApiOperation({ summary: 'List all active political parties' })
  findAll() {
    return this.service.findAll()
  }
}
