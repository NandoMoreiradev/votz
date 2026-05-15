import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ReportsService } from './reports.service'
import { CreateReportDto } from './dto/create-report.dto'
import { UpdateStatusDto } from './dto/update-status.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Category, ReportStatus } from '@votz/shared-types'

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new report' })
  create(
    @Body() dto: CreateReportDto,
    @CurrentUser() user: { id: string; type: string },
  ) {
    return this.reportsService.create(dto, user)
  }

  @Get()
  @ApiOperation({ summary: 'List reports with filters and pagination' })
  findAll(
    @Query('category') category?: Category,
    @Query('status') status?: ReportStatus,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.reportsService.findAll({ category, status, city, state, page: +page, limit: +limit })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get report by ID with timeline' })
  findById(@Param('id') id: string) {
    return this.reportsService.findById(id)
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update report status (entity/moderator/admin only)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: { id: string; type: string },
  ) {
    return this.reportsService.updateStatus(id, dto, user)
  }
}
