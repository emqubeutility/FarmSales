import { describe, expect, it } from 'vitest';
import {
  GRANTABLE_ROLES,
  isOwnerOnlyRoute,
  MENU_ROUTES,
  pagesFor,
  updateRoleMenuSchema,
  type RoleMenuMatrix,
} from './menu-access.js';

// The starting defaults the migration seeds.
const defaults: RoleMenuMatrix = {
  CASHIER: ['/pos', '/sales', '/returns', '/orders', '/customers'],
  WAREHOUSE: ['/orders', '/items', '/inventory', '/batches', '/receive-stock', '/suppliers'],
  DELIVERY: ['/orders'],
};

describe('pagesFor', () => {
  it('gives the owner every page, whatever the matrix says', () => {
    expect(pagesFor(['OWNER'], {})).toEqual([...MENU_ROUTES]);
  });

  it('gives a cashier the granted pages, in sidebar order', () => {
    expect(pagesFor(['CASHIER'], defaults)).toEqual(['/pos', '/sales', '/returns', '/orders', '/customers']);
  });

  it('gives a user with several roles the union of their pages', () => {
    expect(pagesFor(['DELIVERY', 'WAREHOUSE'], defaults)).toEqual(['/orders', '/items', '/inventory', '/batches', '/receive-stock', '/suppliers']);
  });

  it('gives no pages to a role with nothing granted, or to a user with no roles', () => {
    expect(pagesFor(['DELIVERY'], { DELIVERY: [] })).toEqual([]);
    expect(pagesFor([], defaults)).toEqual([]);
  });

  it('never gives a non-owner an owner-only page, even if the matrix lists it', () => {
    expect(pagesFor(['CASHIER'], { CASHIER: ['/settings', '/users', '/pos'] })).toEqual(['/pos']);
  });

  it('follows the matrix, so the owner can take a page away', () => {
    expect(pagesFor(['CASHIER'], { CASHIER: ['/pos'] })).toEqual(['/pos']);
  });
});

describe('updateRoleMenuSchema', () => {
  it('accepts a list of grantable pages', () => {
    expect(updateRoleMenuSchema.safeParse({ routes: ['/pos', '/customers'] }).success).toBe(true);
    expect(updateRoleMenuSchema.safeParse({ routes: [] }).success).toBe(true);
  });

  it('rejects unknown pages and owner-only pages', () => {
    expect(updateRoleMenuSchema.safeParse({ routes: ['/nope'] }).success).toBe(false);
    expect(updateRoleMenuSchema.safeParse({ routes: ['/settings'] }).success).toBe(false);
    expect(updateRoleMenuSchema.safeParse({ routes: ['/users'] }).success).toBe(false);
  });
});

describe('page reservations', () => {
  it('reserves settings and users for the owner', () => {
    expect(isOwnerOnlyRoute('/settings')).toBe(true);
    expect(isOwnerOnlyRoute('/users')).toBe(true);
    expect(isOwnerOnlyRoute('/reports')).toBe(false);
    expect(isOwnerOnlyRoute('/pos')).toBe(false);
  });

  it('lists the three roles the owner can set', () => {
    expect([...GRANTABLE_ROLES]).toEqual(['CASHIER', 'WAREHOUSE', 'DELIVERY']);
  });
});
