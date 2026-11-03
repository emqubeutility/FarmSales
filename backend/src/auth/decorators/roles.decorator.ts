import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

// Roles are combinable per HANDOVER.md section 3 (a user can be e.g. Cashier + Warehouse),
// so this checks for overlap, not an exact match.
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
