import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../auth/decorators/current-user.decorator'
import { AdsPreferencesService } from './ads-preferences.service'
import { UpdateAdPreferencesDto } from './dto/update-ad-preferences.dto'

@ApiTags('ads')
@Controller('ads/preferences')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdsPreferencesController {
  constructor(private readonly service: AdsPreferencesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Minhas preferências de anúncios (personalização, interesses, faixa de idade e gênero)' })
  get(@CurrentUser() user: { id: string }) {
    return this.service.get(user.id)
  }

  @Patch('me')
  @ApiOperation({ summary: 'Liga/desliga a personalização e escolhe interesses. Campo ausente não muda.' })
  update(@CurrentUser() user: { id: string }, @Body() dto: UpdateAdPreferencesDto) {
    return this.service.update(user.id, dto)
  }
}
