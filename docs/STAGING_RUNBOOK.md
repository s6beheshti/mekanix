# MEKANIX — Staging Runbook

This environment is isolated from live production. It runs Next.js in production mode, but uses `APP_ENV=staging` so that OTP logging and payment-provider sandbox mode can be exercised without allowing simulator settlement.

## 1. Required staging secrets

Use a dedicated staging `.env` file on the staging host. Do not commit it.

Required:
- `DB_PASSWORD`: unique staging database password (24+ characters; use URL-safe characters).
- `REDIS_PASSWORD`: unique staging Redis password (24+ characters).
- `JWT_SECRET`: random staging-only secret (32+ characters).
- `ADMIN_BOOTSTRAP_PASSWORD`: one-time strong staging admin password (16+ characters).\n- `BACKUP_ENCRYPTION_PASSPHRASE`: independent, single-line staging-only secret (32+ characters).\n- `BACKUP_ADMIN_TOKEN`: independent staging-only random token (32+ characters).
- `APP_URL`: public HTTPS origin for staging, e.g. `https://staging.example.ir`.
- `PAYMENT_PROVIDER`: `zarinpal` or `idpay`.
- The selected provider's sandbox credential: `ZARINPAL_MERCHANT_ID` or `IDPAY_API_KEY`.

For staging:
- `SMS_PROVIDER=console` is permitted. OTP codes are written to staging container logs; no real SMS is sent.
- Set `ZARINPAL_SANDBOX=true` when using Zarinpal sandbox, or `IDPAY_SANDBOX=true` when using IDPay sandbox.
- Never reuse production secrets or merchant credentials.

## 2. Start staging

Configure the staging hostname with HTTPS and reverse-proxy it to `127.0.0.1:3001`. The gateway callback URL is derived from `APP_URL` and is exactly:

```
https://<staging-host>/api/gateway/callback
```

Register that callback URL in the selected payment provider's sandbox dashboard where required.

Schema migration safety: staging and production must use the checked-in provider-specific Prisma migrations through the Compose `migrate` service (`prisma migrate deploy`). **Do not run `bun run db:push` or `bun run db:reset` against staging or production**; the `db:push` script explicitly accepts data loss and bypasses the reviewed migration history.

Then run:

```bash
docker compose -f docker-compose.staging.yml up -d --build
docker compose -f docker-compose.staging.yml ps
docker compose -f docker-compose.staging.yml logs -f app
```

Check readiness:

```bash
curl -fsS https://<staging-host>/api/health
curl -i https://<staging-host>/api/ready
```

Expected: `/api/health` returns 200 and `/api/ready` returns 200 with database, migrations, SMS, payment, and PostgreSQL checks passing. A 503 is a release blocker; inspect the `errors` array and container logs.

## 3. Required end-to-end checks

1. Create a staging customer and request OTP. Confirm the OTP appears only in staging logs.
2. Complete customer login and register a vehicle/equipment item.
3. Create a service request and verify technician matching, acceptance, status changes, and notifications.
4. Issue an invoice from the technician flow. Verify the customer cannot change the invoice amount or pay another customer's invoice.
5. Start invoice checkout. Confirm the browser leaves MEKANIX for the official provider checkout page; card data must never be entered into MEKANIX.
6. Complete an invoice sandbox transaction. Confirm callback delivery, server-to-server verification, exact amount match, one successful Payment record, invoice status PAID, job completion, warranty creation, and notifications.
7. Complete a pre-service inspection/travel fee payment. Confirm `job.prepayPaid` changes only after callback verification, technician pending wallet balance increases by the net amount, commission is recorded, and chat unlocks.
8. Replay the same callback. Confirm there is no second settlement, duplicate wallet transaction, duplicate warranty, or duplicate VIP entitlement.
9. Test cancelled and still-pending callbacks. Confirm neither can mark an invoice paid or unlock pre-service chat.
10. Purchase a VIP plan through the sandbox. Confirm the subscription activates only after provider verification and matches the purchased plan and amount.
11. Call `/api/vip/subscribe` without a verified payment and with a mismatched plan/payment pair. Both must be rejected.
12. Verify duplicate checkout attempts are rejected while an active checkout exists.
13. Test invalid credentials, provider timeout, wrong amount, invalid order ID, and database interruption during callback settlement. No failed/unknown transaction may grant an entitlement or credit a wallet.

## 4. Data recovery and operations

Before each staging release candidate:
- Take a PostgreSQL backup.
- Restore it into a separate test database and verify row counts and application startup.
- Confirm Redis persistence and that the app recovers after a Redis restart.
- Record the exact image/commit SHA tested.
- Keep staging logs and test evidence attached to the release PR.

The isolated `backup-scheduler` service creates an encrypted backup immediately after startup and every 24 hours. It uses GPG AES-256; plaintext dumps are streamed directly into encryption and are not written to the persistent backup volume.

Check the scheduler and encrypted artifact:

```bash
docker compose -f docker-compose.staging.yml ps backup-scheduler
docker compose -f docker-compose.staging.yml logs --tail=100 backup-scheduler
docker compose -f docker-compose.staging.yml exec -T backup-scheduler \
  sh -c 'find /backups -maxdepth 1 -type f -name "*.sql.gz.gpg" -ls'
```

The scheduler exposes no host port. Its internal `GET /ready` endpoint returns 200 only after a successful backup. Manual execution is available only through authenticated `POST /backup-now`; `GET /backups` also requires the Bearer token. Never publish port 3005.

Trigger a manual backup from inside the scheduler container without exposing the token in command arguments or shell history:

```bash
docker compose -f docker-compose.staging.yml exec -T backup-scheduler bun -e 'const r = await fetch("http://127.0.0.1:3005/backup-now", { method: "POST", headers: { Authorization: "Bearer " + process.env.BACKUP_ADMIN_TOKEN } }); const body = await r.json(); if (!r.ok) { console.error(body); process.exit(1); } console.log(body.output);'
```

For a restore drill, restore into a separate disposable database whose name includes `test`, `staging`, or `restore`. Stop application writers for that target, then use the encrypted artifact and the same staging-only passphrase:

```bash
docker compose -f docker-compose.staging.yml exec -T backup-scheduler \
  sh -c 'ls -1 /backups/*.sql.gz.gpg'
```

Run the restore from the scheduler container, overriding `DATABASE_URL` with the isolated restore database URL (reachable as `db` from the Compose network). The passphrase is already injected into the scheduler container; never print it in shell history:

```bash
docker compose -f docker-compose.staging.yml exec -T \
  -e DATABASE_URL="$TEST_DB_URL" -e RESTORE_CONFIRM=RESTORE \
  backup-scheduler bash /app/scripts/restore-db.sh /backups/<backup-file>.sql.gz.gpg
```

Replace `<backup-file>` with the exact encrypted filename listed in `/backups`. Do not point a restore drill at the source or live database. The restore utility validates the GPG stream before connecting; PostgreSQL restore uses `ON_ERROR_STOP` and a single transaction.

Do not use `docker compose down -v` on a staging environment unless intentionally deleting its database, Redis, and backup volumes. Keep the backup encryption passphrase in a separate secure secret store; losing it makes encrypted backups unrecoverable.

## 5. Promotion to production

Only promote after all staging checks pass and the PR checks are green. For production:
- Set `APP_ENV=production`.
- Use real SMS provider credentials and a live merchant credential.
- Set both sandbox flags to false.
- Set `APP_URL` to the production HTTPS origin.
- Run `scripts/deploy.sh` and require `/api/ready = 200`.
- Perform one controlled real transaction and reconciliation review.
- Confirm monitoring, alerts, backups, and rollback before opening traffic.
- Keep the release under observation for at least 24 hours.

Staging success is necessary but does not itself authorize production release.
