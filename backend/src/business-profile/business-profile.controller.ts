import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { updateBusinessProfileSchema } from '@farm-sales/shared';
import type { UpdateBusinessProfileDto } from '@farm-sales/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { SafeUser } from '../auth/auth.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BusinessProfileService } from './business-profile.service.js';

@Controller('business-profile')
@UseGuards(AuthenticatedGuard)
export class BusinessProfileController {
  constructor(private readonly businessProfile: BusinessProfileService) {}

  @Get()
  get() {
    return this.businessProfile.get();
  }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  update(@Body(new ZodValidationPipe(updateBusinessProfileSchema)) dto: UpdateBusinessProfileDto, @CurrentUser() user: SafeUser) {
    return this.businessProfile.update(dto, user.id);
  }
}
