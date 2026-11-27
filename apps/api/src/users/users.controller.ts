import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { UsersService } from './users.service'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { UpdatePreferencesDto } from './dto/update-preferences.dto'
import { AcceptConsentDto } from './dto/accept-consent.dto'
import { DeleteAccountDto } from './dto/delete-account.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'

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

  @Get('me/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter preferências de notificações e privacidade cívica da conta' })
  getPreferences(@CurrentUser() user: { id: string }) {
    return this.usersService.getPreferences(user.id)
  }

  @Patch('me/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar preferências de notificações e privacidade cívica da conta' })
  updatePreferences(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.usersService.updatePreferences(user.id, dto)
  }

  @Post('me/consent')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record acceptance of current Terms of Use, Privacy Policy, and minimum age confirmation' })
  acceptConsent(
    @CurrentUser() user: { id: string },
    @Body() dto: AcceptConsentDto,
  ) {
    return this.usersService.acceptConsent(user.id, dto)
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
  @ApiOperation({ summary: 'Permanently delete own account (LGPD erasure). Requires password or e-mail confirmation.' })
  deleteAccount(
    @CurrentUser() user: { id: string },
    @Body() dto: DeleteAccountDto,
  ) {
    return this.usersService.deleteAccount(user.id, dto)
  }

  @Public()
  @Get('search')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Search public citizen accounts by name or @username (min 2 chars)' })
  @ApiQuery({ name: 'q', required: true, example: 'maria' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 15 })
  search(
    @Query('q') q = '',
    @Query('page') page = '1',
    @Query('limit') limit = '15',
  ) {
    return this.usersService.search(q, Number(page) || 1, Math.min(Math.max(Number(limit) || 15, 1), 25))
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get public user profile' })
  findById(@Param('id') id: string) {
    return this.usersService.findById(id)
  }

  @Public()
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

  @Post(':id/follow')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Seguir ou deixar de seguir um usuário (toggle)' })
  followToggle(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.usersService.followToggle(id, user.id)
  }

  @Get(':id/is-following')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verificar se o usuário atual segue este perfil' })
  isFollowing(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.usersService.isFollowing(id, user.id)
  }
}
