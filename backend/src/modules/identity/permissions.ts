import type { Role } from "@prisma/client";

export const PERMISSIONS = [
  "payments:read",
  "payments:write",
  "payments:simulate",
  "transactions:read",
  "webhooks:read",
  "webhooks:replay",
  "reconciliation:read",
  "reconciliation:run",
  "reconciliation:resolve",
  "audit:read",
  "dashboard:read",
  "health:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ANALYST: Permission[] = [
  "payments:read",
  "transactions:read",
  "webhooks:read",
  "reconciliation:read",
  "dashboard:read",
  "health:read",
];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  ANALYST,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
