import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ActingUser } from '../auth/acting-org'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { PlansService } from './plans.service'

@ApiTags('plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Retorna o plano atual, limites, uso de membros e recursos da organização ativa',
  })
  getMyPlan(@CurrentUser() user: ActingUser) {
    return this.plansService.getMyPlan(user)
  }
}
