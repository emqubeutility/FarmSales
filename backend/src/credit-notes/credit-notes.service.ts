import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CreditNotesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.creditNote.findMany({ relationLoadStrategy: 'join', orderBy: { issuedAt: 'desc' }, include: { customer: true } });
  }

  async findOne(id: string) {
    const note = await this.prisma.creditNote.findUnique({ where: { id }, relationLoadStrategy: 'join', include: { customer: true, payments: true } });
    if (!note) throw new NotFoundException(`Credit note ${id} not found`);
    return note;
  }

  async findByNumber(number: string) {
    const note = await this.prisma.creditNote.findUnique({ where: { number }, relationLoadStrategy: 'join', include: { customer: true } });
    if (!note) throw new NotFoundException(`Credit note "${number}" not found`);
    return note;
  }
}
