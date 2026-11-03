import { Module } from '@nestjs/common';
import { DocumentSeriesController } from './document-series.controller.js';
import { DocumentSeriesService } from './document-series.service.js';

@Module({
  controllers: [DocumentSeriesController],
  providers: [DocumentSeriesService],
  exports: [DocumentSeriesService],
})
export class DocumentSeriesModule {}
