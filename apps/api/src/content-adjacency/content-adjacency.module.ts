import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ContentAdjacencyRepository } from './content-adjacency.repository'
import { ContentAdjacencyService } from './content-adjacency.service'

@Module({
  imports: [PrismaModule],
  providers: [ContentAdjacencyService, ContentAdjacencyRepository],
  exports: [ContentAdjacencyService],
})
export class ContentAdjacencyModule {}
