import type { Permission, Role } from "../core/security/permissions";

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: Role;
  email: string;
  name: string;
  permissions: ReadonlySet<Permission>;
}

declare global {
  namespace Express {
    interface Request {
      /** Correlation id (X-Request-Id), set by requestContext middleware */
      requestId: string;
      /** Present on every route behind `authenticate` */
      auth?: AuthContext;
      /** Raw body bytes, captured only for signature-verified webhooks */
      rawBody?: Buffer;
    }
  }
}
