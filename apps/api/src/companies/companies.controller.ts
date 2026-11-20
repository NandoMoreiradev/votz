import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { CompaniesService } from './companies.service'
import { ListCompaniesDto } from './dto/list-companies.dto'
import { UpdateCompanyDto } from './dto/update-company.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List companies with optional filters' })
  findAll(@Query() query: ListCompaniesDto) {
    return this.companiesService.findAll(query)
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get company public profile with stats' })
  findById(@Param('id') id: string) {
    return this.companiesService.findById(id)
  }

  @Public()
  @Get(':id/reports')
  @ApiOperation({ summary: 'List reports directed at a company' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  findReports(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('status') status?: string,
  ) {
    return this.companiesService.findReports(id, Number(page), Math.min(Number(limit), 50), status)
  }

  @Post(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Seguir ou deixar de seguir uma empresa' })
  follow(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.companiesService.followToggle(id, user.id)
  }

  @Get(':id/is-following')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verifica se o usuário segue a empresa' })
  isFollowing(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.companiesService.isFollowing(id, user.id)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update company profile (requires MANAGE_PROFILE permission)" })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.companiesService.update(id, user.id, dto)
  }
}
