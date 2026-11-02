/**
 * Role-Based Access Control.
 *
 * Routes declare the permission they need (`authorize("tenant:write")`);
 * roles map to permission sets here, in one place. Adding a role (e.g.
 * "accountant") is a data change, not a change to every route.
 */
export const ROLES = ["superadmin", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "flat:read",
  "flat:write",
  "floor:read",
  "floor:write",
  "address:read",
  "address:write",
  "tenant:read",
  "tenant:write",
  "rent:read",
  "rent:write",
  "kyc:share",
  "maintenance:read",
  "maintenance:write",
  "dashboard:read",
  "user:read",
  "user:write",
  "audit:read",
  "whatsapp:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  superadmin: PERMISSIONS,
  admin: [
    "flat:read",
    "floor:read",
    "address:read",
    "tenant:read",
    "rent:read",
    "kyc:share",
    "maintenance:read",
    "maintenance:write",
    "dashboard:read",
  ],
};

const cache = new Map<Role, ReadonlySet<Permission>>(
  ROLES.map((role) => [role, new Set(ROLE_PERMISSIONS[role])]),
);

export const permissionsFor = (role: Role): ReadonlySet<Permission> =>
  cache.get(role) ?? new Set();

export const isRole = (value: unknown): value is Role =>
  typeof value === "string" && (ROLES as readonly string[]).includes(value);
