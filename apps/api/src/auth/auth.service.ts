import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../prisma/prisma.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existe = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    })

    if (existe) {
      throw new ConflictException('Email já cadastrado')
    }

    const senhaHash = await bcrypt.hash(dto.senha, 12)

    const usuario = await this.prisma.usuario.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        senha: senhaHash,
      },
      select: {
        id: true,
        nome: true,
        email: true,
        tipo: true,
        contaCriada: true,
      },
    })

    const tokens = await this.gerarTokens(usuario.id, usuario.email, usuario.tipo)

    return { usuario, ...tokens }
  }

  async login(dto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    })

    if (!usuario || !usuario.senha) {
      throw new UnauthorizedException('Credenciais inválidas')
    }

    if (usuario.banido) {
      throw new UnauthorizedException('Conta suspensa')
    }

    const senhaValida = await bcrypt.compare(dto.senha, usuario.senha)
    if (!senhaValida) {
      throw new UnauthorizedException('Credenciais inválidas')
    }

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLogin: new Date() },
    })

    const tokens = await this.gerarTokens(usuario.id, usuario.email, usuario.tipo)

    return {
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        tipo: usuario.tipo,
      },
      ...tokens,
    }
  }

  private async gerarTokens(usuarioId: string, email: string, tipo: string) {
    const payload = { sub: usuarioId, email, tipo }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ])

    return { accessToken, refreshToken }
  }
}
