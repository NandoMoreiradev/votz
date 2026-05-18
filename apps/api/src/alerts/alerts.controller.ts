import { Controller, Get, NotFoundException, Param } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { AlertsService } from './alerts.service'

@ApiTags('alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'List active surto alerts ordered by report count' })
  findActive() {
    return this.alertsService.findActive()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get surto details with associated reports' })
  async findOne(@Param('id') id: string) {
    const result = await this.alertsService.findOne(id)
    if (!result) throw new NotFoundException('Surto not found')
    return result
  }
}
