import { Body, Controller, Get, Param, Post, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { UserType } from '@votz/shared-types'
import { RegistrationRequestsService } from './registration-requests.service'
import { CreateRegistrationRequestDto } from './dto/create-registration-request.dto'

@ApiTags('registration-requests')
@Controller('registration-requests')
export class RegistrationRequestsController {
  constructor(private readonly service: RegistrationRequestsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Citizen submits a registration request' })
  create(
    @Body() dto: CreateRegistrationRequestDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.create(user.id, dto)
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my submitted requests' })
  findMine(@CurrentUser() user: { id: string }) {
    return this.service.findMyRequests(user.id)
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.MODERATOR, UserType.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] List all registration requests' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  findAll(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.service.findAll(status, page, Math.min(limit, 50))
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.MODERATOR, UserType.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Approve a registration request' })
  approve(
    @Param('id') id: string,
    @Body('reviewNote') reviewNote?: string,
    @CurrentUser() user: { id: string } = { id: '' },
  ) {
    return this.service.approve(id, user.id, reviewNote)
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserType.MODERATOR, UserType.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Reject a registration request' })
  reject(
    @Param('id') id: string,
    @Body('reviewNote') reviewNote = '',
    @CurrentUser() user: { id: string } = { id: '' },
  ) {
    return this.service.reject(id, user.id, reviewNote)
  }
}
