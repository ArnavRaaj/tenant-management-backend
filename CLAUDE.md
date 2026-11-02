# Backend Engineering Guidelines

## 1. Technology

This application is TypeScript-based.

The repository includes:

- `src/`: Application source code.
- `tests/`: Automated tests.
- `package.json`: Dependencies and available scripts.
- `tsconfig.json`: TypeScript configuration.
- `vitest.config.mts`: Vitest configuration.
- `eslint.config.mjs`: ESLint configuration.
- `.env.example`: Environment variable template.

Verify the framework, database integration, and source layout from the
actual implementation before making changes.

## 2. Architecture

- Follow the existing application architecture.
- Keep HTTP handling separate from business logic where appropriate.
- Reuse existing services, utilities, and middleware.
- Keep database access consistent with existing conventions.
- Avoid circular dependencies.
- Avoid unnecessary abstractions and oversized modules.
- Keep modules cohesive and responsibilities clear.

Do not introduce a new architecture merely to match a generic template.

## 3. TypeScript

- Prefer explicit, meaningful types for public interfaces.
- Avoid `any` unless genuinely necessary and justified.
- Use `unknown` for values whose types have not been established.
- Narrow types before accessing properties.
- Handle nullable and optional values deliberately.
- Follow the project's existing compiler settings.
- Avoid unsafe type assertions and non-null assertions.

## 4. Request Validation

- Validate request bodies, parameters, and query strings.
- Use existing validation libraries and middleware.
- Reject malformed input with appropriate client error responses.
- Do not rely exclusively on frontend validation.
- Keep validation errors consistent with existing API conventions.
- Validate uploaded files and external data where applicable.

## 5. Business Logic

- Keep business rules independent of HTTP handling where practical.
- Avoid duplicating business logic across controllers and services.
- Make asynchronous operations explicit.
- Handle rejected promises and expected failure cases.
- Avoid silently swallowing errors.
- Use transactions when multiple database operations must be atomic
  and the database supports the required transaction semantics.

## 6. Database

- Inspect the actual database client, models, schemas, and migrations.
- Follow existing data-access conventions.
- Use parameterized queries or safe database APIs.
- Avoid unbounded queries for potentially large collections.
- Consider indexes for frequent query patterns.
- Handle missing records and duplicate data appropriately.
- Never make destructive schema or data changes without approval.

Do not assume Mongoose is being used merely because this is a MERN-style
application.

## 7. Authentication and Authorization

- Follow the existing authentication implementation.
- Authenticate protected requests on the server.
- Enforce authorization for every protected resource operation.
- Verify the caller's permissions and tenant membership.
- Do not trust tenant IDs or user roles supplied by the client.
- Prevent cross-tenant reads, updates, and deletions.
- Do not weaken authentication to simplify development.

## 8. Error Handling and Logging

- Follow the existing centralized error-handling strategy.
- Distinguish expected client errors from unexpected server failures.
- Return appropriate HTTP status codes.
- Never expose stack traces or internal details in production responses.
- Never log passwords, tokens, or sensitive personal information.
- Use the existing logging library if one is configured.

## 9. Testing

- Use the existing Vitest configuration and testing conventions.
- Place tests in the appropriate existing test directories.
- Test successful operations, invalid input, and failure cases.
- Test authorization and tenant isolation for protected operations.
- Mock external services when appropriate.
- Avoid tests that depend on production data or real credentials.
- Run the relevant test scripts from package.json.

## 10. Dependencies and Configuration

- Check existing dependencies before adding new packages.
- Use environment variables for server-side configuration.
- Keep `.env.example` current with safe placeholders.
- Never expose server secrets to the frontend.
- Do not modify package versions without a clear reason.

## 11. Completion Checklist

Before completing a backend task:

- Verify the implementation and API contract.
- Run relevant tests.
- Run available lint and type checks.
- Review error handling and authorization.
- Check for accidental secrets or unrelated changes.
- Summarize the changes and verification results.

