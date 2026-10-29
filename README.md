# ⚙️ Nivaasa (निवास) — Backend API & Webhook Engine

> **Enterprise Multi-Tenant Property Operating System & Rental Asset Management Engine**
> Built with **Node.js 22 LTS, Express 5, TypeScript 5, Mongoose 9, MongoDB Atlas, and Vitest**.

[![Vitest Tests](https://img.shields.io/badge/Vitest-28%20Passed%20(100%25)-brightgreen?style=flat-square&logo=vitest)](https://vitest.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-v22%20LTS-green?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-black?style=flat-square&logo=express)](https://expressjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![MongoDB Atlas](https://img.shields.io/badge/MongoDB-Atlas%20%7C%20ACID-47A248?style=flat-square&logo=mongodb)](https://www.mongodb.com/)

---

## 🏛️ Clean Architecture (Domain-Driven Service-Repository Pattern)

The backend follows clean layered separation of concerns to guarantee testability, maintainability, and zero business logic leakage into HTTP controllers:

```text
HTTP Request / WhatsApp Webhook
     │
     ▼
[Correlation ID (X-Request-Id) & Morgan Access Logging]
     │
     ▼
[Security Middlewares (Helmet, CORS Whitelisting, Token-Bucket Rate Limiter)]
     │
     ▼
[Joi Request Validation (Params, Query, Body Sanitization)]
     │
     ▼
[Authentication & RBAC Guards (JWT, Superadmin vs Admin)]
     │
     ▼
[Controllers] ──► Orchestrate HTTP / Webhook input & output
     │
     ▼
[Services] ────► Business Logic, Transaction Runner (ACID), Pluggable Adapters
     │           ├── WhatsApp Service & Inbound NLP Router
     │           ├── Aadhaar e-KYC Engine (Mock + Surepass)
     │           ├── Maintenance Classifier (Gemini + Rule-based NLP)
     │           └── Rent Engine & Payment Pattern Intelligence
     │
     ▼
[Repositories] ► Direct Data Access & Organization-Scoped Queries
     │
     ▼
[MongoDB Models] (Compound Multi-Tenant Indexes & Virtuals)
     │
     ▼
[Response Middleware] & [Async Non-blocking Audit Logger]
```

---

## 🌟 Core Subsystems & Innovation Engines

### 1. 📱 WhatsApp Service & Webhook Architecture
Located in `src/service/whatsapp/`:
- **Pluggable Provider Factory (`IWhatsAppProvider`):**
  - **`SimulatorWhatsAppProvider` (Default):** Zero-cost local development mode. Logs colorized WhatsApp chat boxes to the terminal and persists messages with simulated delivery to MongoDB.
  - **`MetaCloudWhatsAppProvider`:** Official Meta Graph API v21.0 integration with automatic E.164 phone formatting and delivery receipt webhooks.
- **Inbound Message NLP Router (`inboundRouter.service.ts`):**
  - Normalizes phone numbers and matches active tenants in database.
  - **Intent Detection:**
    - `MAINTENANCE`: Classifies issues in Hindi/Hinglish/English, generates ticket ID, creates `MaintenanceTicket`, and sends confirmation.
    - `RENT_INQUIRY`: Calculates balance, returns status (Clear vs Overdue) and payment instructions.
    - `RECEIPT_REQUEST`: Pulls latest `RentHistory` and sends formatted digital receipt.
    - `KYC_INQUIRY`: Checks verification status or delivers 1-click Digilocker onboarding link.
    - `HELP_GREETING`: Returns interactive Hindi/English resident service menu.

### 2. 🪪 Aadhaar e-KYC Verification Engine
Located in `src/service/kyc/`:
- **Zero App Download / Zero Password:** Generates a cryptographically secure 72-hour token (`/kyc/:token`).
- **Pluggable Adapters:**
  - `MockKycProvider`: Generates instant simulated OTPs for valid 12-digit Aadhaar numbers and verifies any 6-digit OTP offline without charges.
  - `SurepassKycProvider`: Connects to live UIDAI / DigiLocker gateway.
- Automatically captures and records legal name, gender, DOB, and verified permanent address.

### 3. 💵 Multi-Mode Rent Collection & Arrears Intelligence
Located in `src/service/tenant.service.ts`:
- **Modes Supported:** `CASH`, `DIRECT_UPI` (GPay/PhonePe), `BANK_TRANSFER` (NEFT/IMPS), `CHEQUE`, `ONLINE_LINK`.
- **Payment Pattern Tracking:** Automatically tags tenants based on payment date:
  - `ON_TIME`: 1st–5th of the month.
  - `MID_MONTH`: 6th–15th of the month.
  - `CHRONIC_LATE`: Paid after the 15th.
- **Dynamic State:** Persists `lastPaidMonth` and `lastPaidYear`, returning `isCurrentMonthPaid` flag dynamically for the UI.

### 4. 🛠️ AI Maintenance Classifier
Located in `src/service/maintenance/`:
- **Dual Tier Classifier:**
  - **Tier 1 (Fast Offline NLP):** Evaluates 60+ Hindi, Hinglish, and English keywords against categories (`PLUMBING`, `ELECTRICAL`, `CARPENTRY`, `APPLIANCE`, `CIVIL`, `OTHER`) and urgency levels (`EMERGENCY`, `HIGH`, `MEDIUM`, `LOW`).
  - **Tier 2 (Google Gemini API):** Optional fallback when `GEMINI_API_KEY` is present for deep semantic nuance.

---

## 🛡️ Security Architecture

### 1. Multi-Tenant Data Isolation
- **Organization-Scoped Vaults:** Every single domain collection (`Flat`, `Tenant`, `RentHistory`, `Address`, `AuditLog`, `Floor`, `MaintenanceTicket`, `WhatsAppMessage`) enforces a required `organizationId` reference.
- **Leak-Proof Repositories:** All database queries (`find`, `findOne`, `aggregate`, `updateOne`, `deleteOne`) strictly inject `organizationId`. A Superadmin or Admin of Organization A can never query or mutate assets belonging to Organization B.

### 2. Role-Based Access Control (RBAC)
- **Superadmin:** Retains complete governance — registering buildings, configuring floors, inviting delegated property managers, adjusting master lease terms, and vacating tenants.
- **Admin:** Delegated property managers invited via email with scoped operational privileges (collecting rent, reviewing occupant headcounts, verifying KYC).
- Enforced via declarative middleware: `requireSuperadmin` and `authorize("superadmin", "admin")`.

### 3. Field-Level AES-256-CBC Encryption at Rest
- Sensitive tenant identification numbers (Aadhaar, contact number, document URLs) are protected using **AES-256-CBC encryption** with unique random IVs per call before database write.
- Decryption occurs only upon authorized tenant detail retrieval.

### 4. Token-Bucket Rate Limiting
- Protects authentication routes (`/api/auth/*`) and admin invitation dispatchers (`/api/users/invite`).
- Implements burst-tolerant token replenishment with automated HTTP response headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`).

### 5. Input Sanitization & Security Headers
- **Helmet**: Secures HTTP response headers (XSS filtering, MIME sniffing protection, clickjacking defense).
- **CORS**: Configured with strict origin whitelisting (`FRONTEND_URL`).
- **Audit Sanitization**: Passwords, OTPs, raw tokens, and authorization headers are automatically redacted (`[REDACTED]`) before being recorded to audit ledgers.

---

## ⚡ Robustness & Resilience Engineering

### 1. Atomic Database Transactions (`withTransaction`)
- Multi-document operations are executed within MongoDB ACID transactions via `src/utils/transactionRunner.ts`:
  - **Tenant Onboarding (`createTenant`):** Creates tenant, assigns flat, archives initial deposit, logs rent payment, and updates flat occupancy status simultaneously.
  - **Tenant Vacating (`vacateTenant`):** Unlinks tenant, marks tenant inactive, resets flat occupant reference, and logs vacancy timestamp atomically.
  - **Tenant Replacement (`changeTenant`):** Vacates outgoing tenant, registers incoming tenant, and reassigns flat inventory in a single ACID boundary.
  - **Rent Payment Logging (`addRentRecord`):** Records payment receipt, reduces pending balance, and validates total arrears in lockstep.
- **Standalone Fallback:** Automatically detects if MongoDB is a replica set or local standalone instance, executing fallback strategies gracefully without crashing.

### 2. Comprehensive Joi Request Validation
- Enforced on **ALL** routes via `validateRequest` middleware:
  - **Body Validation:** Strips unexpected payloads, validates required strings, numbers, and dates.
  - **Query Validation:** Enforces positive pagination integers (`page`, `limit`) and enum values (`status=vacant|occupied`).
  - **Strict MongoDB ObjectId Validation:** Route parameters (`/:id`) are validated against `/^[0-9a-fA-F]{24}$/`. Malformed IDs immediately return a clean `400 Bad Request` instead of triggering unhandled Mongoose `CastError` 500 crashes.

### 3. Asynchronous Background Email Worker Queue
- In-memory asynchronous worker queue in `src/queues/email.queue.ts`:
  - Client requests return in **< 30 milliseconds**.
  - Background workers process `OTP_EMAIL`, `ADMIN_INVITE`, `WELCOME_EMAIL`, and `CUSTOM_EMAIL` jobs.
  - Built-in exponential backoff retries with maximum retry caps.

---

## 📡 API Reference Overview

### WhatsApp & Webhook Endpoints
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/whatsapp/webhook` | Public | Meta Cloud API webhook verification handshake |
| `POST` | `/api/whatsapp/webhook` | Public | Meta Cloud API inbound event notification |
| `POST` | `/api/whatsapp/dev/simulate-inbound` | Public/Dev | Simulate inbound WhatsApp message from tenant |
| `GET` | `/api/whatsapp/logs` | Protected | Retrieve WhatsApp communication log audit |
| `GET` | `/api/whatsapp/status` | Protected | Check active WhatsApp provider and config status |

### Aadhaar e-KYC Endpoints
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/kyc/info/:token` | Public | Fetch tenant & flat context for 1-click KYC link |
| `POST` | `/api/kyc/generate-otp` | Public | Dispatch Aadhaar OTP (Simulated in Mock / UIDAI in Prod) |
| `POST` | `/api/kyc/submit-otp` | Public | Verify Aadhaar OTP & update tenant status to `VERIFIED` |

### Maintenance Ticketing Endpoints
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/maintenance/tickets` | Protected | List organization maintenance tickets with filters |
| `POST` | `/api/maintenance/tickets` | Protected | Create manual maintenance ticket |
| `GET` | `/api/maintenance/tickets/:id` | Protected | Get ticket details and conversation context |
| `PATCH` | `/api/maintenance/tickets/:id/status`| Protected | Update ticket status (`OPEN` → `IN_PROGRESS` → `RESOLVED`) |

### Tenant & Rent Endpoints
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/tenants` | Protected | List active or past tenants (with `isCurrentMonthPaid` state) |
| `POST` | `/api/tenants` | Protected | Onboard new tenant & auto-dispatch WhatsApp KYC link |
| `GET` | `/api/tenants/:id` | Protected | Tenant detail lookup with decrypted attributes |
| `POST` | `/api/tenants/:id/rent` | Protected | Record multi-mode rent payment & issue WhatsApp receipt |
| `GET` | `/api/tenants/:id/rent` | Protected | Retrieve rent payment history ledgers |
| `GET` | `/api/tenants/:id/kyc-link` | Protected | Generate or retrieve 1-click KYC onboarding link |
| `POST` | `/api/tenants/:id/vacate` | Superadmin | Vacate tenant and mark flat vacant atomically |

---

## 🧪 Automated Testing Suite (Vitest)

Run all tests:
```bash
npm test
```

### Test Suite Execution Output
```text
 ✓ tests/whatsapp.test.ts (10 tests)
   ✓ Meta Webhook Verification (GET /api/whatsapp/webhook)
     ✓ should successfully verify the webhook challenge when token matches
     ✓ should reject verification with 403 when verify_token is invalid
   ✓ WhatsApp Inbound Event Webhook (POST /api/whatsapp/webhook)
     ✓ should acknowledge Meta Cloud webhook with 200 EVENT_RECEIVED immediately
   ✓ Dev Simulator Inbound Router (POST /api/whatsapp/dev/simulate-inbound)
     ✓ should reject simulation if phone or message is missing
     ✓ should handle unrecognized numbers politely
     ✓ should classify maintenance complaints and auto-create a ticket with WhatsApp source
     ✓ should handle rent balance inquiry for an active tenant
     ✓ should provide digital receipt details on receipt request
     ✓ should provide 1-click KYC onboarding link when tenant asks for KYC
     ✓ should display the resident assistant menu on general greetings

 ✓ tests/maintenance.test.ts (4 tests)
 ✓ tests/health.test.ts (4 tests)
 ✓ tests/kyc.test.ts (3 tests)
 ✓ tests/queue.test.ts (3 tests)
 ✓ tests/validation.test.ts (3 tests)
 ✓ tests/floors.test.ts (1 test)

Test Files  7 passed (7)
     Tests  28 passed (28)
```

---

## 🛠️ Environment Variables Configuration

Copy `.env.example` to `.env`:

```ini
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=tenant_management
JWT_SECRET=supersecretjwtkey_tenant_mgmt_2026_!@#$%^
TOKEN_EXPIRY=30d
ENCRYPTION_PASSWORD=supersecret_encryption_password_tenant_mgmt_2026
FRONTEND_URL=http://localhost:3000

# Aadhaar e-KYC Verification (mock | surepass)
KYC_PROVIDER=mock
SUREPASS_API_TOKEN=
SUREPASS_BASE_URL=https://kyc-api.surepass.io

# AI Maintenance Classification (Google Gemini)
GEMINI_API_KEY=

# WhatsApp Service & Webhook Architecture (simulator | meta)
WHATSAPP_PROVIDER=simulator
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=nivaasa_whatsapp_verify_token_2026
WHATSAPP_API_VERSION=v21.0
```

---

## 📦 Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run dev` | `tsx watch src/server.ts` | Local development with hot-reloading |
| `npm run build` | `tsc --noEmit` | Production TypeScript type verification |
| `npm start` | `tsx src/server.ts` | Production startup |
| `npm test` | `vitest run` | Run automated integration & unit tests |
