import { Body, Controller, Header, HttpCode, HttpStatus, Ip, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { CurrentUser } from './decorators/current-user.decorator'
import { Public } from './decorators/public.decorator'
import { LoginDto } from './dto/login.dto'
import { MfaCodeDto, MfaVerifyLoginDto } from './dto/mfa.dto'
import { MobileRefreshDto } from './dto/mobile-refresh.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { JwtMfaSetupGuard } from './guards/jwt-mfa-setup.guard'

// Native clients authenticate explicitly with tokens; these routes never read
// browser cookies. Browser session endpoints retain their Origin/CSRF guards.
@ApiTags('auth-mobile')
@Controller('auth/mobile')
export class MobileAuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 3, ttl: 1_000 }, medium: { limit: 5, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Native login; returns tokens only after completing required MFA' })
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    const result = await this.auth.login(dto, ip)
    if (result.requiresMfa) return { requiresMfa: true, mfaToken: result.mfaToken }
    if (result.requiresMfaSetup) return { requiresMfaSetup: true, mfaSetupToken: result.mfaSetupToken }
    return { user: result.user, accessToken: result.accessToken, refreshToken: result.refreshToken }
  }

  @Public()
  @Post('refresh')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotate an explicitly supplied native refresh token; ignores cookies' })
  refresh(@Body() dto: MobileRefreshDto) {
    return this.auth.refresh(dto.refreshToken)
  }

  @Public()
  @Post('mfa/verify')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 1_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Complete native MFA login with TOTP or backup code' })
  verify(@Body() dto: MfaVerifyLoginDto, @Ip() ip: string) {
    return this.auth.mfaVerifyLogin(dto.mfaToken, dto.code, ip)
  }

  @Public()
  @Post('mfa/enable/forced')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtMfaSetupGuard)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Finish mandatory native MFA enrollment and issue tokens' })
  enable(@CurrentUser() user: { id: string }, @Body() dto: MfaCodeDto, @Ip() ip: string) {
    return this.auth.mfaEnable(user.id, dto.code, true, ip)
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the native session family belonging to the authenticated user' })
  logout(@CurrentUser() user: { id: string }, @Body() dto: MobileRefreshDto) {
    return this.auth.logout(user.id, dto.refreshToken)
  }
}
