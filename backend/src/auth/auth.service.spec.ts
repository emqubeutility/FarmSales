import { describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';

function makeUsersService(user: Record<string, unknown> | null) {
  return { findByEmail: vi.fn().mockResolvedValue(user), findById: vi.fn().mockResolvedValue(user) } as unknown as UsersService;
}

describe('AuthService.validateUser', () => {
  it('returns a safe user (no passwordHash) when the password matches', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    const usersService = makeUsersService({
      id: 'u1',
      name: 'Asha',
      email: 'asha@example.com',
      passwordHash,
      roles: ['CASHIER'],
      active: true,
    });
    const service = new AuthService(usersService);

    const result = await service.validateUser('asha@example.com', 'correct-password');

    expect(result).toEqual({ id: 'u1', name: 'Asha', email: 'asha@example.com', roles: ['CASHIER'], active: true });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('returns null when the password is wrong', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    const usersService = makeUsersService({
      id: 'u1',
      name: 'Asha',
      email: 'asha@example.com',
      passwordHash,
      roles: ['CASHIER'],
      active: true,
    });
    const service = new AuthService(usersService);

    expect(await service.validateUser('asha@example.com', 'wrong')).toBeNull();
  });

  it('returns null for a deactivated user even with the correct password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    const usersService = makeUsersService({
      id: 'u1',
      name: 'Asha',
      email: 'asha@example.com',
      passwordHash,
      roles: ['CASHIER'],
      active: false,
    });
    const service = new AuthService(usersService);

    expect(await service.validateUser('asha@example.com', 'correct-password')).toBeNull();
  });

  it('returns null when no user exists for the email', async () => {
    const usersService = makeUsersService(null);
    const service = new AuthService(usersService);

    expect(await service.validateUser('nobody@example.com', 'anything')).toBeNull();
  });
});
