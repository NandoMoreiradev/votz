import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Request, Response } from 'express'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { ChangePasswordDto } from './dto/change-password.dto'
import { VerifyEmailDto } from './dto/verify-email.dto'
import { MfaCodeDto, MfaVerifyLoginDto } from './dto/mfa.dto'
import { SwitchContextDto } from './dto/switch-context.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { JwtMfaSetupGuard } from './guards/jwt-mfa-setup.guard'
import { GoogleAuthGuard, assertValidOAuthState } from './guards/google-auth.guard'
import { OriginCsrfGuard } from '../common/security/origin-csrf.guard'
import { CurrentUser } from './decorators/current-user.decorator'
import { Public } from './decorators/public.decorator'
import { ConfigService } from '@nestjs/config'

const REFRESH_COOKIE = 'votz_refresh_token'
// Desafio de MFA do login com Google: guardado em cookie curto para o token nunca ir na URL.
const GOOGLE_MFA_COOKIE = 'votz_google_mfa'

const isProd = process.env.NODE_ENV === 'production'

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
}

const GOOGLE_MFA_COOKIE_BASE = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  path: '/api/v1/auth/google',
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ short: { limit: 5, ttl: 1_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 30, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Register new citizen' })
  async register(@Body() dto: RegisterDto, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.authService.register(dto, ip)
    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS)
    return { user, accessToken }
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 3, ttl: 1_000 }, medium: { limit: 5, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto, ip)
    if (result.requiresMfa) return { requiresMfa: true, mfaToken: result.mfaToken }
    if (result.requiresMfaSetup) return { requiresMfaSetup: true, mfaSetupToken: result.mfaSetupToken }
    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS)
    return { requiresMfa: false, requiresMfaSetup: false, user: result.user, accessToken: result.accessToken }
  }

  @Public()
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

  @Public()
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

  @Public()
  @Post('mfa/enable/forced')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtMfaSetupGuard)
  @ApiOperation({ summary: 'Complete mandatory MFA setup and receive full access tokens (uses mfaSetupToken)' })
  async mfaEnableForced(
    @CurrentUser() user: { id: string; fromSetupFlow: boolean },
    @Body() dto: MfaCodeDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.mfaEnable(user.id, dto.code, true, ip)
    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS)
    return { backupCodes: result.backupCodes, accessToken: result.accessToken, user: result.user }
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 1_000 }, medium: { limit: 10, ttl: 60_000 }, long: { limit: 20, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Complete login by verifying TOTP code after password step' })
  async mfaVerifyLogin(@Body() dto: MfaVerifyLoginDto, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.authService.mfaVerifyLogin(dto.mfaToken, dto.code, ip)
    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS)
    return { user, accessToken }
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable MFA (accepts TOTP code or backup code)' })
  mfaDisable(@CurrentUser() user: { id: string }, @Body() dto: MfaCodeDto) {
    return this.authService.mfaDisable(user.id, dto.code)
  }

  @Post('mfa/reset-device')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reset authenticator device — validates current code (TOTP or backup), returns new QR to re-enroll; confirm with POST /auth/mfa/enable' })
  mfaResetDevice(@CurrentUser() user: { id: string }, @Body() dto: MfaCodeDto) {
    return this.authService.mfaResetDevice(user.id, dto.code)
  }

  @Post('mfa/backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Regenerate backup codes (requires TOTP code, invalidates previous codes)' })
  mfaRegenerateBackupCodes(@CurrentUser() user: { id: string }, @Body() dto: MfaCodeDto) {
    return this.authService.mfaRegenerateBackupCodes(user.id, dto.code)
  }

  @Public()
  @Post('refresh')
  @UseGuards(OriginCsrfGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and get new access token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE]
    const { accessToken, refreshToken } = await this.authService.refresh(rawRefreshToken)
    res.cookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS)
    return { accessToken }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(OriginCsrfGuard, JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session family and invalidate refresh token cookie' })
  async logout(
    @CurrentUser() user: { id: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE]
    await this.authService.logout(user.id, rawRefreshToken)
    res.clearCookie(REFRESH_COOKIE, { path: '/', secure: isProd, sameSite: isProd ? 'none' : 'lax' })
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(OriginCsrfGuard, JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices and revoke all refresh token families' })
  async logoutAll(
    @CurrentUser() user: { id: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.id)
    res.clearCookie(REFRESH_COOKIE, { path: '/', secure: isProd, sameSite: isProd ? 'none' : 'lax' })
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  me(@CurrentUser() user: { id: string }) {
    return this.authService.me(user.id)
  }

  // ── Multi-profile ────────────────────────────────────────────────────────

  @Get('my-profiles')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all profiles the authenticated user can act as' })
  myProfiles(@CurrentUser() user: { id: string }) {
    return this.authService.getMyProfiles(user.id)
  }

  @Post('switch-context')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Switch active profile context and get a new access token' })
  switchContext(@CurrentUser() user: { id: string }, @Body() dto: SwitchContextDto) {
    return this.authService.switchContext(user.id, dto.contextType, dto.contextId, dto.mfaCode)
  }

  // ── Google OAuth ────────────────────────────────────────────────────────

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Redirect to Google OAuth' })
  googleRedirect() {
    // Passport redireciona automaticamente
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(
    @CurrentUser() profile: { googleId: string; email: string; name: string; avatarUrl: string | null },
    @Ip() ip: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    assertValidOAuthState(req, res, true)

    const result = await this.authService.googleLogin(profile, ip)
    const appUrl = this.config.get('APP_URL', 'http://localhost:5173')

    if ('requiresMfa' in result || 'requiresMfaSetup' in result) {
      const pending = 'requiresMfa' in result ? result.mfaToken : result.mfaSetupToken
      res.cookie(GOOGLE_MFA_COOKIE, pending, { ...GOOGLE_MFA_COOKIE_BASE, maxAge: 5 * 60 * 1000 })
      res.redirect(`${appUrl}/entrar?google_mfa=1`)
      return
    }

    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS)
    res.redirect(`${appUrl}/auth/google/callback`)
  }

  @Public()
  @Post('google/pending-mfa')
  @UseGuards(OriginCsrfGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 3, ttl: 1_000 }, medium: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Finish Google login when MFA is required: returns mfaToken or mfaSetupToken (read once from cookie)' })
  async googlePendingMfa(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string | undefined> | undefined)?.[GOOGLE_MFA_COOKIE]
    res.clearCookie(GOOGLE_MFA_COOKIE, GOOGLE_MFA_COOKIE_BASE)
    return this.authService.readGooglePendingMfa(token)
  }

  // ── Segurança da conta: senha e sessões ativas ──────────────────────────

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 2, ttl: 10_000 }, medium: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Alterar ou definir senha da conta autenticada' })
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto)
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar sessões ativas (famílias de refresh token) da conta' })
  listSessions(@CurrentUser() user: { id: string }, @Req() req: Request) {
    const cookieToken = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE]
    return this.authService.listActiveSessions(user.id, cookieToken)
  }

  @Delete('sessions/:familyId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerrar uma sessão ativa específica' })
  revokeSession(@CurrentUser() user: { id: string }, @Param('familyId') familyId: string) {
    return this.authService.revokeSessionFamily(user.id, familyId)
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerrar todas as outras sessões ativas da conta' })
  revokeAllOtherSessions(@CurrentUser() user: { id: string }, @Req() req: Request) {
    const cookieToken = (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE]
    return this.authService.revokeAllOtherSessions(user.id, cookieToken)
  }
}
