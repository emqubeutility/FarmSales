import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { createDocumentSeriesSchema, updateDocumentSeriesSchema } from '@farm-sales/shared';
import type { CreateDocumentSeriesDto, UpdateDocumentSeriesDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DocumentSeriesService } from './document-series.service.js';

@Controller('document-series')
@UseGuards(AuthenticatedGuard)
export class DocumentSeriesController {
  constructor(private readonly documentSeries: DocumentSeriesService) {}

  @Get()
  list() {
    return this.documentSeries.list();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  create(@Body(new ZodValidationPipe(createDocumentSeriesSchema)) dto: CreateDocumentSeriesDto, @CurrentUser() user: SafeUser) {
    return this.documentSeries.create(dto, user.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateDocumentSeriesSchema)) dto: UpdateDocumentSeriesDto, @CurrentUser() user: SafeUser) {
    return this.documentSeries.update(id, dto, user.id);
  }
}
