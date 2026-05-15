import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { VotesService } from './votes.service'
import { CastVoteDto } from './dto/cast-vote.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('votes')
@Controller('reports/:reportId/votes')
export class VotesController {
  constructor(private readonly votesService: VotesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle vote (SUPPORT or ME_TOO) on a report' })
  toggle(
    @Param('reportId') reportId: string,
    @Body() dto: CastVoteDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.votesService.toggle(reportId, user.id, dto.type)
  }

  @Get()
  @ApiOperation({ summary: 'Get vote counts for a report' })
  counts(@Param('reportId') reportId: string) {
    return this.votesService.countsByReport(reportId)
  }
}
