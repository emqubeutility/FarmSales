import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { loginSchema } from '@farm-sales/shared';
import type { Request } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';
import type { SafeUser } from './auth.service.js';

@Controller('auth')
export class AuthController {
  @Post('login')
  @HttpCode(200)
  @UseGuards(LocalAuthGuard)
  login(@Req() req: Request, @Body(new ZodValidationPipe(loginSchema)) _body: unknown) {
    // LocalAuthGuard has already authenticated and attached req.user; passport-session
    // establishes the session cookie as part of the guard's call to req.login().
    return req.user;
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request) {
    return new Promise((resolve, reject) => {
      req.logout((err) => {
        if (err) return reject(err);
        resolve({ ok: true });
      });
    });
  }

  @Get('me')
  me(@Req() req: Request): SafeUser | null {
    return req.isAuthenticated() ? (req.user as SafeUser) : null;
  }
}
