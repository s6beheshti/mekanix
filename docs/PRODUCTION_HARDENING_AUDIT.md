# MEKANIX Production Hardening Audit

## Current Findings

### Authentication
- Current user model still contains password compatibility fields.
- Target architecture: mobile number + OTP only.
- Production migration must remove password dependency safely.

### Database
- Current datasource uses SQLite.
- Production deployment should use a migration-safe workflow.
- Avoid destructive db push commands in production.

### Financial Models
- Monetary fields should use integer minor units instead of floating point values.
- Currency should move toward a controlled enum model.

### Asset Architecture

Target:

Asset
- Vehicle
- Machinery

This allows separate maintenance rules and CARE workflows.

## Execution Order

1. Security hardening
2. Environment cleanup
3. Auth migration plan
4. Database migration plan
5. CARE engine implementation
6. Lite mode and offline sync
7. Production testing

## Release Goal

MEKANIX v1.0 Release Candidate
