import { Module } from '@nestjs/common';
import { MenuAccessController } from './menu-access.controller.js';
import { MenuAccessService } from './menu-access.service.js';

@Module({
  controllers: [MenuAccessController],
  providers: [MenuAccessService],
  exports: [MenuAccessService],
})
export class MenuAccessModule {}
