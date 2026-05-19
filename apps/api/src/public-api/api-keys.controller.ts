import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { ApiKeysService } from './api-keys.service'
import { CreateApiKeyDto } from './dto/create-api-key.dto'

@ApiTags('api-keys')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar API key',
    description:
      'Gera uma nova API key. O valor completo é retornado **apenas uma vez** — guarde-o com segurança.',
  })
  @ApiCreatedResponse({
    description: 'Key criada. O campo `key` não será retornado novamente.',
  })
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.service.create(user.id, dto)
  }

  @Get()
  @ApiOperation({ summary: 'Listar minhas API keys' })
  @ApiOkResponse({ description: 'Lista de keys (sem o valor completo)' })
  findAll(@CurrentUser() user: { id: string }) {
    return this.service.findAllByUser(user.id)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revogar uma API key' })
  @ApiNoContentResponse({ description: 'Key revogada com sucesso' })
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.revoke(id, user.id)
  }
}
