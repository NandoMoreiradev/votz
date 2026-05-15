import {
  Body, Controller, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RelatosService } from './relatos.service'
import { CriarRelatoDto } from './dto/criar-relato.dto'
import { AtualizarStatusDto } from './dto/atualizar-status.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator'
import { Categoria, StatusRelato } from '@votz/shared-types'

@ApiTags('relatos')
@Controller('relatos')
export class RelatosController {
  constructor(private readonly relatosService: RelatosService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar novo relato' })
  criar(
    @Body() dto: CriarRelatoDto,
    @UsuarioAtual() usuario: { id: string; tipo: string },
  ) {
    return this.relatosService.criar(dto, usuario)
  }

  @Get()
  @ApiOperation({ summary: 'Listar relatos com filtros e paginação' })
  listar(
    @Query('categoria') categoria?: Categoria,
    @Query('status') status?: StatusRelato,
    @Query('cidade') cidade?: string,
    @Query('estado') estado?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.relatosService.listar({ categoria, status, cidade, estado, page: +page, limit: +limit })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar relato por ID com timeline' })
  buscarPorId(@Param('id') id: string) {
    return this.relatosService.buscarPorId(id)
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar status do relato (entidade/moderador/admin)' })
  atualizarStatus(
    @Param('id') id: string,
    @Body() dto: AtualizarStatusDto,
    @UsuarioAtual() usuario: { id: string; tipo: string },
  ) {
    return this.relatosService.atualizarStatus(id, dto, usuario)
  }
}
