import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { OrgType, PoliticianPlan } from '@prisma/client'
import { UserType } from '@votz/shared-types'
import { PoliticiansService } from './politicians.service'
import { CreatePoliticianDto } from './dto/create-politician.dto'
import { UpdatePoliticianDto } from './dto/update-politician.dto'
import { ListPoliticiansDto } from './dto/list-politicians.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { PlanGuard } from '../auth/guards/plan.guard'
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('politicians')
@Controller('politicians')
export class PoliticiansController {
  constructor(private readonly service: PoliticiansService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a politician profile directly (admin only). Use POST /registration-requests for the standard flow.' })
  register(
    @Body() dto: CreatePoliticianDto,
    @CurrentUser() user: { id: string; type: string },
  ) {
    if (user.type !== UserType.ADMIN) {
      throw new ForbiddenException('Use POST /registration-requests to register a politician.')
    }
    return this.service.register(user.id, dto)
  }

  @Get()
  @ApiOperation({ summary: 'List politicians with optional filters' })
  findAll(@Query() query: ListPoliticiansDto) {
    return this.service.findAll(query)
  }

  @Get('cities')
  @ApiOperation({ summary: 'List distinct cities that have politicians, optionally filtered by state' })
  @ApiQuery({ name: 'state', required: false })
  findCities(@Query('state') state?: string) {
    return this.service.findCities(state)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get politician public profile with Mandatômetro stats' })
  findById(@Param('id') id: string) {
    return this.service.findById(id)
  }

  @Get(':id/reports')
  @ApiOperation({ summary: 'List reports directed at a politician' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date — filter reports created on or after this date' })
  findReports(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('status') status?: string,
    @Query('from') from?: string,
  ) {
    return this.service.findReports(id, Number(page), Math.min(Number(limit), 50), status, from)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update own politician profile" })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePoliticianDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.update(id, user.id, dto)
  }

  @Post(':id/advocate/:reportId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Politician advocates (takes responsibility for) a report' })
  advocate(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.advocate(id, reportId, user.id)
  }

  @Get(':id/export')
  @UseGuards(JwtAuthGuard, PlanGuard)
  @RequiresPlan(PoliticianPlan.MANDATOMETRO_PRO, OrgType.POLITICIAN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export politician reports as JSON (requires Mandatômetro Pro plan or higher)' })
  exportReports(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
  ) {
    return this.service.findReports(id, 1, 1000, status, from)
  }
}
