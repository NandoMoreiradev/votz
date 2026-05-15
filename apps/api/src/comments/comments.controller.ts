import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { CommentsService } from './comments.service'
import { CreateCommentDto } from './dto/create-comment.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'

@ApiTags('comments')
@Controller('reports/:reportId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a comment to a report' })
  create(
    @Param('reportId') reportId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.commentsService.create(reportId, user.id, dto)
  }

  @Get()
  @ApiOperation({ summary: 'List comments for a report (threaded)' })
  findByReport(@Param('reportId') reportId: string) {
    return this.commentsService.findByReport(reportId)
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete own comment (or moderator/admin)' })
  delete(
    @Param('commentId') commentId: string,
    @CurrentUser() user: { id: string; type: string },
  ) {
    return this.commentsService.delete(commentId, user.id, user.type)
  }
}
