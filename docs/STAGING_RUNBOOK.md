# MEKANIX — Staging Runbook

This environment is isolated from live production. It runs Next.js in production mode, but uses `APP_ENV=staging` so that OTP logging and payment-provider sandbox mode can be exercised without allowing simulator settlement.

## 1. Required staging secrets

Use a dedicated staging `.env` file on the staging host. Do not commit it.

Required:
- `DB_PASSWORD`: unique staging database password (24+ characters; use URL-safe characters).
- `REDIS_PASSWORD`: unique staging Redis password (24+ characters).
- `JWT_SECRET`: random staging-only secret (32+ characters).
- `ADMIN_BOOTSTRAP_PASSWORD`: one-time strong staging admin password (16+ characters).
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

Example database backup:

```bash
docker compose -f docker-compose.staging.yml exec -T db \
  pg_dump -U mekanix mekanix_staging > mekanix-staging-$(date +%F-%H%M).sql
```

Do not use `docker compose down -v` on a staging environment unless intentionally deleting its database and Redis volumes.

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
