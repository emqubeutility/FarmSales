import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { SafeUser } from '../auth.service.js';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SafeUser => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.user as SafeUser;
});
