import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service.js';

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  active: boolean;
}

function toSafeUser(user: { id: string; name: string; email: string; roles: string[]; active: boolean }): SafeUser {
  return { id: user.id, name: user.name, email: user.email, roles: user.roles, active: user.active };
}

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async validateUser(email: string, password: string): Promise<SafeUser | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.active) return null;
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) return null;
    return toSafeUser(user);
  }

  async findSafeUserById(id: string): Promise<SafeUser | null> {
    const user = await this.usersService.findById(id);
    if (!user || !user.active) return null;
    return toSafeUser(user);
  }
}
