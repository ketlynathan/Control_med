# Security and synchronization audit

## Reviewed
Authentication helpers, registration/login handlers, PostgreSQL pool, state synchronization API, and schema.

## Changes in this branch
- Replace the PostgreSQL xmin concurrency token with an application-owned BIGINT version counter. Each successful update atomically increments the version; stale writes receive HTTP 409.
- Return the actual updated_at timestamp from state writes (previously updatedAt contained the version).
- Validate synchronization versions against PostgreSQL BIGINT range and reject array-shaped state payloads.
- Restrict JWT verification to HS256, require a 32-byte minimum secret, and parse the Bearer header strictly.
- Add a migration for existing databases.

## Deployment order
1. Back up the database.
2. Run migrations/2026-10-15-state-version.sql in the database SQL editor.
3. Deploy this branch. After deployment, clients must GET the current state before their next PUT; stale/old clients may receive HTTP 409.
4. Verify two clients reading the same version: the first PUT should succeed and the stale second PUT should receive 409.
5. Configure JWT_SECRET with at least 32 bytes of cryptographically random material (for example, openssl rand -base64 48). Existing secrets shorter than this will cause auth operations to fail until rotated.

## Remaining risks / follow-up
- Login/registration rate limiting needs a shared store or edge protection; in-memory serverless counters are not reliable.
- Sessions remain bearer JWTs valid for 30 days with no revocation/refresh mechanism. Password reset and email verification are not implemented.
- State is still a JSON blob, and attachments remain embedded in the payload.
- The DB pool currently disables certificate verification by default (rejectUnauthorized: false); use provider-supported CA verification where practical.
- Run the repository's full test command and integration tests against a staging PostgreSQL database before production deployment.
