import { z } from 'zod';
import type { Role } from './schemas/user.js';

// The sidebar pages, in sidebar order. Which roles see each page is set by the owner in Settings >
// Menu Access and stored in the database. Owner-only pages can't be granted to other roles: the API
// keeps them to the owner, so a menu link would only lead to an error.
export interface MenuPage {
  route: string;
  label: string;
  group: string;
  ownerOnly: boolean;
}

export const MENU_PAGES: readonly MenuPage[] = [
  { route: '/dashboard', label: 'Dashboard', group: 'Overview', ownerOnly: false },
  { route: '/pos', label: 'POS', group: 'Sales', ownerOnly: false },
  { route: '/sales', label: 'Sales History', group: 'Sales', ownerOnly: false },
  { route: '/returns', label: 'Returns & Refunds', group: 'Sales', ownerOnly: false },
  { route: '/orders', label: 'Fulfilments', group: 'Fulfilment', ownerOnly: false },
  { route: '/items', label: 'Items & Products', group: 'Inventory', ownerOnly: false },
  { route: '/inventory', label: 'Stock Overview', group: 'Inventory', ownerOnly: false },
  { route: '/batches', label: 'Batches & Expiry', group: 'Inventory', ownerOnly: false },
  { route: '/receive-stock', label: 'Receive Stock', group: 'Procurement', ownerOnly: false },
  { route: '/suppliers', label: 'Suppliers', group: 'Procurement', ownerOnly: false },
  { route: '/customers', label: 'Customers', group: 'Administration', ownerOnly: false },
  { route: '/reports', label: 'Reports', group: 'Administration', ownerOnly: true },
  { route: '/users', label: 'User Management', group: 'Administration', ownerOnly: true },
  { route: '/settings', label: 'Settings', group: 'Administration', ownerOnly: true },
];

export const MENU_ROUTES: readonly string[] = MENU_PAGES.map((page) => page.route);

// Roles the owner can give pages to. The owner always has every page, so OWNER is not listed.
export const GRANTABLE_ROLES = ['CASHIER', 'WAREHOUSE', 'DELIVERY'] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

const knownRoute = z.string().refine((route) => MENU_ROUTES.includes(route), 'Unknown page');
const grantableRoute = z
  .string()
  .refine((route) => MENU_PAGES.some((page) => page.route === route && !page.ownerOnly), 'This page is for the owner only');

// The pages one role may open, as the owner sets them. Replaces the role's whole list.
export const updateRoleMenuSchema = z.object({
  routes: z.array(grantableRoute).max(MENU_ROUTES.length),
});
export type UpdateRoleMenuDto = z.infer<typeof updateRoleMenuSchema>;

export const roleMenuRouteSchema = knownRoute;

// Pages granted to each role, from the database. Owner is not stored: it always has every page.
export type RoleMenuMatrix = Partial<Record<GrantableRole, readonly string[]>>;

// Every page a user may open, in sidebar order. Owner has all pages. Other users get the union of
// the pages granted to each of their roles, and never an owner-only page.
export function pagesFor(roles: readonly string[], matrix: RoleMenuMatrix): string[] {
  if (roles.includes('OWNER' satisfies Role)) return [...MENU_ROUTES];
  const granted = new Set<string>();
  for (const role of roles) {
    for (const route of matrix[role as GrantableRole] ?? []) granted.add(route);
  }
  return MENU_PAGES.filter((page) => !page.ownerOnly && granted.has(page.route)).map((page) => page.route);
}

// Owner-only check on a route, so the API and the web app agree on which pages are reserved.
export function isOwnerOnlyRoute(route: string): boolean {
  return MENU_PAGES.some((page) => page.route === route && page.ownerOnly);
}
