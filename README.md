# Nivaasa API (tenant-management-backend)

TypeScript / Express 5 / Mongoose 9 API for the Nivaasa platform. For setup,
deployment and the security model see the [root README](../README.md); this
document is the engineering reference for working **inside** the codebase.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Watch mode via `tsx` (development only) |
| `npm run build` | Compile `src/` → `dist/` (`tsconfig.build.json`) |
| `npm start` | Run the compiled server (`node dist/server.js`) |
| `npm run migrate` / `migrate:dev` | Apply pending DB migrations (compiled / tsx). Add `-- --dry-run` to preview |
| `npm run db:sync-indexes` | Create declared indexes and drop undeclared ones |
| `npm test` / `test:coverage` / `test:watch` | Vitest (in-memory MongoDB replica set) |
| `npm run typecheck` | `tsc --noEmit` over src + tests |
| `npm run lint:check` / `format` | ESLint / Prettier |

## Layout

```
src/
├── app.ts                 Express app factory (middleware order, routes)
├── server.ts              Bootstrap: DB → migration gate → queues → listen; graceful shutdown
├── config/
│   ├── env.ts             Joi-validated, typed configuration (fails fast in production)
│   ├── database.ts        Connection pool, replica-set detection, ensureIndexes
│   └── redis.ts           Shared ioredis client (optional in dev)
├── core/                  Framework-level building blocks (no feature logic)
│   ├── errors/AppError.ts       Error classes + stable error codes
│   ├── http/                    HttpStatus, envelope helpers (ok/created/noContent), handle(), responseMiddleware
│   ├── middleware/              requestContext, sanitizeInput, validate, authorize, rateLimit, upload, errorHandler
│   ├── security/                crypto (AES-GCM, HMAC, tokens), password (bcrypt), jwt, permissions (RBAC)
│   ├── db/                      transaction (withTransaction + afterCommit/onRollback), counters, pagination
│   ├── queue/jobQueue.ts        BullMQ (Redis) / in-process fallback
│   ├── cache/cache.ts           Redis / in-memory TTL cache
│   ├── utils/                   period (IST, YYYYMM), money (paise), text, http (fetch with timeout)
│   ├── logger.ts                pino with redaction + request-id mixin
│   └── requestContext.ts        AsyncLocalStorage (request id, actor, audit change)
├── modules/<feature>/     One folder per business capability
│   ├── *.model.ts             Mongoose schema + TS interface + indexes
│   ├── *.repository.ts        Data access — every query scoped by organizationId
│   ├── *.service.ts           Business rules; HTTP-agnostic (takes AuthContext + typed input)
│   ├── *.validation.ts        Joi schemas for params/query/body
│   ├── *.mapper.ts            DB document → API DTO (decrypt, paise→rupees, period→month)
│   └── *.routes.ts            Route table: auth → RBAC → validation → audit → handler
├── scripts/               migrate.ts, syncIndexes.ts, migrations/ (ordered, idempotent)
└── types/express.d.ts     req.auth, req.requestId, req.rawBody
tests/
├── helpers/               globalSetup (replica set), env isolation, db, factories
├── unit/                  crypto, JWT, RBAC, queue, limiter, utils, redaction, classifier
└── integration/           auth, RBAC & isolation, tenants/flats, rent, transactions & uploads,
                           KYC, maintenance & WhatsApp, audit, migrations, health
```

Modules: `auth`, `users`, `flats`, `floors`, `addresses`, `tenants` (incl. rent),
`kyc`, `maintenance`, `whatsapp`, `dashboard`, `audit`, `storage`, `notifications`.

## Conventions

**Adding an endpoint**

```ts
router.post(
  "/",
  authenticate,                       // 401 if no/invalid token
  authorize("flat:write"),            // 403 unless the role grants it
  validate({ body: createSchema }),   // 400 with field details; unknown keys stripped
  audit("FLAT_CREATE", "flat"),       // who/when/what written after the response
  handle(async (req) => created(await flatService.createFlat(requireAuth(req), req.body))),
);
```

- Controllers return `ok(data, meta?)`, `created(data)` or `noContent()`; the
  response middleware writes the envelope. Throw `AppError` subclasses for
  expected failures (`NotFoundError`, `ConflictError`, `UnprocessableError`, …).
- Services never touch `req`/`res`. They receive `AuthContext` and typed input,
  and call `recordAuditChange({ resourceId, before, after })` to enrich the audit entry.
- Repositories take `organizationId` on **every** method. A missing record and a
  record owned by another organisation are indistinguishable (`404`).
- Multi-document writes use `withTransaction(async (tx) => …)`, pass
  `tx.session` to every query, and schedule side effects with
  `tx.afterCommit(...)`. Non-DB work that must be undone (uploads) registers
  compensation or is wrapped by the caller.
- Money is stored in paise (`toPaise`/`toRupees`), rent months as `YYYYMM`
  periods (`core/utils/period.ts`), "now" is IST.
- New permissions: add to `PERMISSIONS` and the role map in
  `core/security/permissions.ts`; nothing else changes.
- Schema changes that touch existing data ship as a new file in
  `scripts/migrations/` appended to the list — never edit a migration that has run.
- Logging: use `logger` (pino). `console.*` is a lint error. Never log secrets or PII.

## API surface

All routes are under `/api`. Envelope, status codes, pagination and idempotency
are described in the [root README](../README.md#api-conventions).

| Method & path | Permission | Notes |
| --- | --- | --- |
| `POST /auth/register` · `/verify-email` · `/resend-verify-email` | public | OTP rate limits, hashed OTP with attempt counter |
| `POST /auth/login` · `/refresh` · `/logout` · `/logout-all` | public / auth | Refresh cookie rotation with reuse detection |
| `GET /auth/me` | auth | Profile + permissions |
| `POST /auth/forgot-password/{send-otp,resend-otp,verify-otp,reset-password}` | public | No account enumeration; reset revokes all sessions |
| `GET /users` · `POST /users/invite` · `PATCH /users/:id/status` | `user:read` / `user:write` | Deactivation revokes sessions |
| `POST /users/accept-invitation` | public | Hashed, expiring invite tokens |
| `GET/POST /flats`, `GET/DELETE /flats/:id` | `flat:read` / `flat:write` | |
| `GET /flats/meta/tags` · `/flats/meta/floors` | `flat:read` / `floor:read` | |
| `GET /flats/:id/{tenants,revenue,vacant-history}` | read permissions | |
| `GET/POST /floors` · `GET/POST /addresses` | `floor:*` / `address:*` | Organisation-scoped |
| `GET/POST /tenants`, `GET/PUT /tenants/:id` | `tenant:read` / `tenant:write` | Multipart (`aadharImage`: jpeg/png/webp/pdf ≤ 5 MB) |
| `POST /tenants/:id/change` · `/vacate` | `tenant:write` | Transactional |
| `GET/POST /tenants/:id/rent` | `rent:read` / `rent:write` | `Idempotency-Key` supported |
| `GET /tenants/:id/kyc-link` | `kyc:share` | |
| `GET /kyc/info/:token` · `POST /kyc/generate-otp` · `/submit-otp` | public (link) | Per-IP and per-link limits |
| `GET /maintenance/stats` · `GET/POST /maintenance/tickets` · `GET /tickets/:id` · `PATCH /tickets/:id/status` | `maintenance:*` | Status changes notify the tenant on WhatsApp |
| `GET /dashboard/stats?month=&year=` | `dashboard:read` | Cached 60 s |
| `GET /audit-logs?cursor=&action=&resource=&userId=&from=&to=` | `audit:read` | |
| `GET/POST /whatsapp/webhook` | Meta (signed) | |
| `POST /whatsapp/dev/simulate-inbound` | dev only | Absent in production |
| `GET /whatsapp/logs` · `/whatsapp/status` | `whatsapp:read` | Org-scoped |
| `GET /health` · `/health/ready` | public | Liveness / readiness |

Roles: **superadmin** has every permission; **admin** has read access plus
`maintenance:write` and `kyc:share`.
