import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { ActingUser } from '../auth/acting-org'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { OptionalAuth } from '../auth/decorators/public.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CreatePostCommentDto, VotePostPollDto } from './dto/create-post-comment.dto'
import { CreatePostDto } from './dto/create-post.dto'
import { ListPostsQueryDto } from './dto/list-posts-query.dto'
import { PostsService } from './posts.service'

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 3, ttl: 10_000 }, medium: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: 'Criar publicação no feed social (texto, mídia, enquete, menções e #pautas)' })
  create(
    @Body() dto: CreatePostDto,
    @CurrentUser() user: ActingUser & { emailVerified?: boolean },
  ) {
    return this.postsService.create(dto, user)
  }

  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Listar feed de publicações com algoritmo Nível A (Para você, Em alta, Seguindo, Recentes)' })
  listFeed(
    @Query() query: ListPostsQueryDto,
    @CurrentUser() user?: ActingUser | null,
  ) {
    return this.postsService.listFeed(query, user)
  }

  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma publicação' })
  getById(
    @Param('id') id: string,
    @CurrentUser() user?: ActingUser | null,
  ) {
    return this.postsService.getById(id, user)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Excluir publicação (autor ou moderação)' })
  deletePost(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; type: string },
  ) {
    return this.postsService.deletePost(id, user.id, user.type)
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Curtir ou descurtir publicação (toggle)' })
  toggleLike(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.postsService.toggleLike(id, user)
  }

  @Post(':id/repost')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Repostar ou remover repost de publicação (toggle)' })
  toggleRepost(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.postsService.toggleRepost(id, user)
  }

  @Post(':id/poll/vote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Votar na enquete nativa de uma publicação' })
  votePoll(
    @Param('id') id: string,
    @Body() dto: VotePostPollDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.postsService.votePoll(id, dto.optionId, user.id)
  }

  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/comments')
  @ApiOperation({ summary: 'Listar comentários e respostas de uma publicação' })
  listComments(@Param('id') id: string) {
    return this.postsService.listComments(id)
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 4, ttl: 10_000 }, medium: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Comentar publicação (texto, imagem, GIF ou áudio exclusivo do autor)' })
  createComment(
    @Param('id') id: string,
    @Body() dto: CreatePostCommentDto,
    @CurrentUser() user: ActingUser,
  ) {
    return this.postsService.createComment(id, user, dto)
  }

  @Delete(':id/comments/:commentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Excluir comentário de publicação (autor ou moderação)' })
  deleteComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: { id: string; type: string },
  ) {
    return this.postsService.deleteComment(commentId, user.id, user.type)
  }
}
