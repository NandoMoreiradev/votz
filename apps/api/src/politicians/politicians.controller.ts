import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { PoliticiansService } from './politicians.service'
import { CreatePoliticianDto } from './dto/create-politician.dto'
import { UpdatePoliticianDto } from './dto/update-politician.dto'
import { ListPoliticiansDto } from './dto/list-politicians.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('politicians')
@Controller('politicians')
export class PoliticiansController {
  constructor(private readonly service: PoliticiansService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a politician profile linked to authenticated user' })
  register(
    @Body() dto: CreatePoliticianDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.register(user.id, dto)
  }

  @Get()
  @ApiOperation({ summary: 'List politicians with optional filters' })
  findAll(@Query() query: ListPoliticiansDto) {
    return this.service.findAll(query)
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
  findReports(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.service.findReports(id, Number(page), Math.min(Number(limit), 50))
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
}
