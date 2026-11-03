import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { CreateUserDto, UpdateUserDto } from '@farm-sales/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../common/audit-log.service.js';

const safeSelect = { id: true, name: true, email: true, roles: true, active: true, createdAt: true } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  list() {
    return this.prisma.user.findMany({ select: safeSelect, orderBy: { name: 'asc' } });
  }

  async create(dto: CreateUserDto, actingUserId: string) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name: dto.name, email: dto.email, passwordHash, roles: dto.roles },
          select: safeSelect,
        });
        await this.auditLog.record(tx, { userId: actingUserId, entity: 'User', entityId: user.id, action: 'create', after: user });
        return user;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`A user with email "${dto.email}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateUserDto, actingUserId: string) {
    const before = await this.prisma.user.findUnique({ where: { id }, select: safeSelect });
    if (!before) throw new NotFoundException(`User ${id} not found`);

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : undefined;
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.user.update({
        where: { id },
        data: { name: dto.name, roles: dto.roles, active: dto.active, passwordHash },
        select: safeSelect,
      });
      await this.auditLog.record(tx, { userId: actingUserId, entity: 'User', entityId: id, action: 'update', before, after });
      return after;
    });
  }
}
