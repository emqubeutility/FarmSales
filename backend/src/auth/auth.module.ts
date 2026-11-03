import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LocalStrategy } from './local.strategy.js';
import { SessionSerializer } from './session.serializer.js';
import { RolesGuard } from './guards/roles.guard.js';

@Module({
  imports: [UsersModule, PassportModule.register({ session: true })],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, SessionSerializer, RolesGuard],
  exports: [AuthService, RolesGuard],
})
export class AuthModule {}
