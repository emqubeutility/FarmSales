import { Global, Module } from '@nestjs/common';
import { PackUnitsController } from './pack-units.controller.js';
import { PackUnitsService } from './pack-units.service.js';

// Global so the sales, orders, returns, stock and adjustment services can all use it without
// importing this module.
@Global()
@Module({
  controllers: [PackUnitsController],
  providers: [PackUnitsService],
  exports: [PackUnitsService],
})
export class PackUnitsModule {}
