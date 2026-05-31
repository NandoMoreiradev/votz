import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { UserType } from '@votz/shared-types'
import { EntitiesService } from './entities.service'
import { CreateEntityDto } from './dto/create-entity.dto'
import { UpdateEntityDto } from './dto/update-entity.dto'
import { ListEntitiesDto } from './dto/list-entities.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('entities')
@Controller('entities')
export class EntitiesController {
  constructor(private readonly entitiesService: EntitiesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an entity directly (admin only). Use POST /registration-requests for the standard flow.' })
  register(
    @Body() dto: CreateEntityDto,
    @CurrentUser() user: { id: string; type: string },
  ) {
    if (user.type !== UserType.ADMIN) {
      throw new ForbiddenException('Use POST /registration-requests to register an entity.')
    }
    return this.entitiesService.register(user.id, dto)
  }

  @Get()
  @ApiOperation({ summary: 'List entities with optional filters' })
  findAll(@Query() query: ListEntitiesDto) {
    return this.entitiesService.findAll(query)
  }

  @Get('cities')
  @ApiOperation({ summary: 'List distinct cities that have entities, optionally filtered by state' })
  @ApiQuery({ name: 'state', required: false })
  findCities(@Query('state') state?: string) {
    return this.entitiesService.findCities(state)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get entity public profile with stats' })
  findById(@Param('id') id: string) {
    return this.entitiesService.findById(id)
  }

  @Get(':id/reports')
  @ApiOperation({ summary: 'List reports directed at an entity' })
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
    return this.entitiesService.findReports(id, Number(page), Math.min(Number(limit), 50), status, from)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update own entity's profile" })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEntityDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.entitiesService.update(id, user.id, dto)
  }

  @Post(':id/advocate/:reportId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Entity advocates (takes responsibility for) a report' })
  advocate(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.entitiesService.advocate(id, reportId, user.id)
  }
}
