import { Module } from '@nestjs/common';
import { TaxClassesController } from './tax-classes.controller.js';
import { TaxClassesService } from './tax-classes.service.js';

@Module({
  controllers: [TaxClassesController],
  providers: [TaxClassesService],
  exports: [TaxClassesService],
})
export class TaxClassesModule {}
