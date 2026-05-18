import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Response } from 'express'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { VerifyEmailDto } from './dto/verify-email.dto'
import { MfaCodeDto, MfaVerifyLoginDto } from './dto/mfa.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { JwtRefreshGuard } from './guards/jwt-refresh.guard'
import { JwtMfaSetupGuard } from './guards/jwt-mfa-setup.guard'
import { GoogleAuthGuard } from './guards/google-auth.guard'
import { CurrentUser } from './decorators/current-user.decorator'
import { ConfigService } from '@nestjs/config'

const REFRESH_COOKIE = 'votz_refresh_token'

const isProd = process.env.NODE_ENV === 'production'

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ short: { limit: 5, ttl: 1_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 30, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Register new citizen' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.authService.register(dto)
    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS)
    return { user, accessToken }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 3, ttl: 1_000 }, medium: { limit: 5, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto)
    if (result.requiresMfa) return { requiresMfa: true, mfaToken: result.mfaToken }
    if (result.requiresMfaSetup) return { requiresMfaSetup: true, mfaSetupToken: result.mfaSetupToken }
    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS)
    return { requiresMfa: false, requiresMfaSetup: false, user: result.user, accessToken: result.accessToken }
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 1_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 30, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Verify email with token from verification link' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token)
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 2, ttl: 1_000 }, medium: { limit: 3, ttl: 60_000 }, long: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Resend email verification link' })
  resendVerification(@CurrentUser() user: { id: string }) {
    return this.authService.resendVerification(user.id)
  }

  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate TOTP secret and QR code for MFA setup' })
  mfaSetup(@CurrentUser() user: { id: string }) {
    return this.authService.mfaSetup(user.id)
  }

  @Post('mfa/setup/forced')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtMfaSetupGuard)
  @ApiOperation({ summary: 'Generate TOTP secret for mandatory MFA setup (uses mfaSetupToken)' })
  mfaSetupForced(@CurrentUser() user: { id: string }) {
    return this.authService.mfaSetup(user.id)
  }

  @Post('mfa/enable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm MFA setup with first TOTP code' })
  mfaEnable(@CurrentUser() user: { id: string }, @Body() dto: MfaCodeDto) {
    return this.authService.mfaEnable(user.id, dto.code, false)
  }

  @Post('mfa/enable/forced')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtMfaSetupGuard)
  @ApiOperation({ summary: 'Complete mandatory MFA setup and receive full access tokens (uses mfaSetupToken)' })
  async mfaEnableForced(
    @CurrentUser() user: { id: string; fromSetupFlow: boolean },
    @Body() dto: MfaCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.mfaEnable(user.id, dto.code, true)
    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS)
    return { backupCodes: result.backupCodes, accessToken: result.accessToken, user: result.user }
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 1_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Complete login by verifying TOTP code after password step' })
  async mfaVerifyLogin(@Body() dto: MfaVerifyLoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.authService.mfaVerifyLogin(dto.mfaToken, dto.code)
    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS)
    return { user, accessToken }
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable MFA (requires current TOTP code)' })
  mfaDisable(@CurrentUser() user: { id: string }, @Body() dto: MfaCodeDto) {
    return this.authService.mfaDisable(user.id, dto.code)
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: 'Rotate refresh token and get new access token' })
  async refresh(
    @CurrentUser() user: { id: string; email: string; type: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.refresh(user.id, user.email, user.type)
    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS)
    return { accessToken }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  async logout(
    @CurrentUser() user: { id: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.id)
    res.clearCookie(REFRESH_COOKIE, { path: '/', secure: isProd, sameSite: isProd ? 'none' : 'lax' })
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  me(@CurrentUser() user: { id: string }) {
    return this.authService.me(user.id)
  }

  // ── Google OAuth ────────────────────────────────────────────────────────

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Redirect to Google OAuth' })
  googleRedirect() {
    // Passport redireciona automaticamente
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(
    @CurrentUser() profile: { googleId: string; email: string; name: string; avatarUrl: string | null },
    @Res() res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.googleLogin(profile)
    const appUrl = this.config.get('APP_URL', 'http://localhost:5173')

    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS)
    res.redirect(`${appUrl}/auth/google/callback?token=${encodeURIComponent(accessToken)}`)
  }
}
