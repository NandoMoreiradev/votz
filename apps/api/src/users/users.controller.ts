import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { UsersService } from './users.service'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get own profile (private data included)' })
  getMe(@CurrentUser() user: { id: string }) {
    return this.usersService.findMe(user.id)
  }

  @Post('me/data-export')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 1, ttl: 60_000 }, medium: { limit: 2, ttl: 3_600_000 }, long: { limit: 3, ttl: 86_400_000 } })
  @ApiOperation({ summary: 'Request a full data export (LGPD portability). Delivers via e-mail.' })
  requestDataExport(@CurrentUser() user: { id: string }) {
    return this.usersService.requestDataExport(user.id)
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 1, ttl: 10_000 }, medium: { limit: 3, ttl: 3_600_000 }, long: { limit: 5, ttl: 86_400_000 } })
  @ApiOperation({ summary: 'Permanently delete own account (LGPD erasure). Requires password confirmation.' })
  deleteAccount(
    @CurrentUser() user: { id: string },
    @Body('password') password: string,
  ) {
    return this.usersService.deleteAccount(user.id, password)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get public user profile' })
  findById(@Param('id') id: string) {
    return this.usersService.findById(id)
  }

  @Get(':id/reports')
  @ApiOperation({ summary: "List user's public non-anonymous reports" })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  findUserReports(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.usersService.findUserReports(id, Number(page), Math.min(Number(limit), 50))
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own profile' })
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.usersService.updateProfile(id, user.id, dto)
  }
}
