import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { AuthService, SafeUser } from './auth.service.js';

// Only the user id is stored in the session; the full user is re-fetched (and re-checked for
// active status) on every request, so deactivating a user takes effect immediately.
@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly authService: AuthService) {
    super();
  }

  serializeUser(user: SafeUser, done: (err: Error | null, id: string) => void) {
    done(null, user.id);
  }

  async deserializeUser(id: string, done: (err: Error | null, user: SafeUser | null) => void) {
    const user = await this.authService.findSafeUserById(id);
    done(null, user);
  }
}
