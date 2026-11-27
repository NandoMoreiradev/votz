import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { TopicsService } from './topics.service'
import { Public } from '../auth/decorators/public.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('topics')
@Controller('topics')
export class TopicsController {
  constructor(private readonly topicsService: TopicsService) {}

  @Public()
  @Get('trending')
  @ApiOperation({ summary: 'Listar pautas cívicas (#hashtags) em alta' })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'city', required: false })
  trending(
    @Query('limit') limit = '10',
    @Query('state') state?: string,
    @Query('city') city?: string,
  ) {
    return this.topicsService.getTrending(Number(limit) || 10, state, city)
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Buscar pautas para autocomplete de #hashtags' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'limit', required: false })
  search(@Query('q') q = '', @Query('limit') limit = '8') {
    return this.topicsService.search(q, Number(limit) || 8)
  }

  @Get('me/following')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pautas que o usuário segue, com a mais ativa primeiro' })
  @ApiQuery({ name: 'limit', required: false, example: 6 })
  following(@CurrentUser() user: { id: string }, @Query('limit') limit = '6') {
    return this.topicsService.getFollowed(user.id, Number(limit) || 6)
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Obter detalhes da pauta cívica (relatos, debates e cidades impactadas)' })
  findBySlug(
    @Param('slug') slug: string,
    @CurrentUser() user?: { id: string } | null,
  ) {
    return this.topicsService.getBySlug(slug, user?.id)
  }

  @Post(':slug/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Seguir ou deixar de seguir uma pauta cívica (toggle)' })
  toggleFollow(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.topicsService.toggleFollow(slug, user.id)
  }
}
