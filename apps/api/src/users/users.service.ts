import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { UsersRepository } from './users.repository'
import { UpdateProfileDto } from './dto/update-profile.dto'

@Injectable()
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}

  async findById(id: string) {
    const user = await this.repo.findByIdWithStats(id)
    if (!user) throw new NotFoundException('User not found')
    return user
  }

  async findMe(id: string) {
    const user = await this.repo.findMe(id)
    if (!user) throw new NotFoundException('User not found')
    return user
  }

  async findUserReports(userId: string, page: number, limit: number) {
    const user = await this.repo.findById(userId)
    if (!user) throw new NotFoundException('User not found')
    return this.repo.findUserReports(userId, page, limit)
  }

  async updateProfile(id: string, requesterId: string, dto: UpdateProfileDto) {
    if (id !== requesterId) throw new ForbiddenException()
    const user = await this.repo.findById(id)
    if (!user) throw new NotFoundException('User not found')
    return this.repo.updateProfile(id, dto)
  }
}
