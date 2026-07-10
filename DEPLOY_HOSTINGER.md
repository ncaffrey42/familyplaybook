# Deploying Family Playbook to Hostinger (Docker + Domain)

This guide takes you from "works on localhost" to "live on https://yourdomain.com,
testable by friends on their iPhones." Follow it top to bottom the first time;
after that, only the **Redeploy** section matters.

**Architecture recap:** the app is a static React bundle (built by Vite, served by
nginx inside Docker). All backend logic lives in **Supabase** (database, auth,
storage, edge functions) and **Stripe**. The Docker container on Hostinger only
serves files — there is no server-side app code on the VPS. That means the VPS is
cheap, stateless, and disposable.

---

## Phase 0 — Set up the PRODUCTION Supabase project (do this first)

You should use a **separate Supabase project for production** so friend-testing
never touches your dev data, and so a dev mistake can't wipe real users.

> ⚠️ **Free-tier warning:** Supabase free-tier projects are PAUSED after ~1 week
> of inactivity and can be deleted after 90 days paused. This already bit us once
> (the dev project stopped resolving). For the production project, either upgrade
> it to the Pro plan (~$10/mo) or set a calendar reminder to visit the dashboard
> weekly while testing.

1. Go to https://supabase.com/dashboard → **New project**.
   - Name: `family-playbook-prod`
   - Save the database password in a password manager.
2. From **Project Settings → API**, copy:
   - Project URL → this is your prod `VITE_SUPABASE_URL`
   - `anon` public key → this is your prod `VITE_SUPABASE_ANON_KEY`
3. On your Mac, link the repo to the new project and push the schema:

   ```bash
   npm i -g supabase                 # if the CLI isn't installed
   supabase login                    # opens browser
   supabase link --project-ref <NEW_PROJECT_REF>
   supabase db push                  # applies everything in supabase/migrations/
   ```

4. Deploy all edge functions:

   ```bash
   supabase functions deploy create-checkout-session
   supabase functions deploy change-subscription-plan
   supabase functions deploy cancel-subscription
   supabase functions deploy create-portal-session
   supabase functions deploy get-subscription
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase functions deploy send-family-invite
   supabase functions deploy accept-family-invite
   ```

   > `stripe-webhook` MUST be deployed with `--no-verify-jwt` — Stripe calls it
   > directly and has no Supabase JWT. It authenticates via the Stripe signature
   > instead.

5. Set the edge-function secrets (server-side only, never in the repo):

   ```bash
   supabase secrets set \
     STRIPE_SECRET_KEY=sk_test_... \
     STRIPE_WEBHOOK_SIGNING_SECRET=whsec_... \
     STRIPE_PRICE_COUPLE_MONTH=price_... \
     STRIPE_PRICE_COUPLE_YEAR=price_... \
     STRIPE_PRICE_FAMILY_MONTH=price_... \
     STRIPE_PRICE_FAMILY_YEAR=price_... \
     APP_URL=https://yourdomain.com
   # Optional, only if AI generation is enabled:
   supabase secrets set OPENAI_API_KEY=sk-...
   ```

   Keep `sk_test_` keys while friends are testing. Swap to `sk_live_` keys only
   when you're ready to charge real money (see Phase 6).

6. Configure **Auth redirect URLs** (Supabase dashboard → Authentication → URL
   Configuration):
   - Site URL: `https://yourdomain.com`
   - Additional redirect URLs: `https://yourdomain.com/**`, and keep
     `http://localhost:3000/**` for local dev if you share the project (better:
     don't share — keep dev on its own project).

7. Configure the **Stripe webhook** (Stripe dashboard → Developers → Webhooks →
   Add endpoint):
   - URL: `https://<NEW_PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`
   - Events to send:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Copy the **Signing secret** (`whsec_...`) and set it via
     `supabase secrets set STRIPE_WEBHOOK_SIGNING_SECRET=...` (step 5).

8. Seed the `plans` and `plan_entitlements` tables if the migrations didn't
   (check Table Editor). The app expects rows for plan_keys `free`, `couple`,
   `family` in `plans`, each with limits in `plan_entitlements`.

---

## Phase 1 — Push the code to GitHub

```bash
git push origin <your-branch>
# then merge to main via a PR, or push main directly
```

The VPS will pull from GitHub, so `main` should always be the deployable state.

---

## Phase 2 — Provision the Hostinger VPS

1. In hPanel: **VPS → your plan** (KVM 1 is plenty — the container just serves
   static files). Choose the **Ubuntu 24.04 with Docker** template (hPanel →
   Operating System → Applications → Docker). This preinstalls Docker + Compose.
2. Set a strong root password, and add your SSH key (hPanel → VPS → Settings →
   SSH keys) so you can log in without a password.
3. Note the VPS **IP address** (shown in hPanel).
4. Firewall (hPanel → VPS → Firewall → Create rule set):
   - Allow TCP 22 (SSH), 80 (HTTP), 443 (HTTPS). Drop everything else.
5. SSH in and confirm Docker works:

   ```bash
   ssh root@<VPS_IP>
   docker --version && docker compose version
   ```

   If the template didn't include Docker:

   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

---

## Phase 3 — Point the domain at the VPS

1. Buy/assign your domain (e.g. in Hostinger: Domains → Buy, or use one you own).
2. DNS (Hostinger hPanel → Domains → DNS Zone):
   - `A` record, name `@`, value `<VPS_IP>`, TTL 300
   - `A` record (or CNAME to `@`), name `www`, value `<VPS_IP>`
3. Wait for propagation (usually minutes): `dig +short yourdomain.com` should
   return the VPS IP.

---

## Phase 4 — Deploy the app with HTTPS

We run two containers: the app (nginx serving the built bundle, already defined
in `docker-compose.yml`) and **Caddy** in front of it, which terminates HTTPS and
auto-renews Let's Encrypt certificates. No manual certbot.

On the VPS:

```bash
# 1. Get the code
git clone https://github.com/<you>/<repo>.git familyplaybook
cd familyplaybook

# 2. Create the production env file (these values are BAKED INTO the build)
cat > .env <<'EOF'
VITE_SUPABASE_URL=https://<NEW_PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<prod anon key>
VITE_APP_URL=https://yourdomain.com
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
VITE_ENABLE_AI_GENERATION=true
EOF

# 3. Create the Caddy reverse-proxy config
cat > Caddyfile <<'EOF'
yourdomain.com, www.yourdomain.com {
    reverse_proxy app:80
}
EOF

# 4. Create a production compose override that adds Caddy
cat > docker-compose.prod.yml <<'EOF'
services:
  app:
    # Production: only Caddy talks to the app; don't publish 8924 to the world.
    ports: !override []
    expose:
      - "80"
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - app
volumes:
  caddy_data:
  caddy_config:
EOF

# 5. Build and start
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Visit `https://yourdomain.com` — Caddy fetches the certificate automatically on
first request (the domain must already resolve to the VPS, Phase 3).

### Redeploy (every future update)

```bash
cd ~/familyplaybook
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

That's it — Vite env values are baked at build time, so a rebuild is required
whenever `.env` changes, not just when code changes.

### Useful operations

```bash
docker compose logs -f app          # app (nginx) logs
docker compose logs -f caddy        # TLS / proxy logs
docker compose ps                   # health status
docker system prune -f              # clean old build layers (disk space)
```

---

## Phase 5 — Post-deploy verification checklist

Run through this on a phone (Safari on iPhone specifically), not just desktop:

- [ ] `https://yourdomain.com` loads with a valid padlock (no cert warning)
- [ ] `http://yourdomain.com` redirects to https
- [ ] Sign up with a fresh email → confirmation email arrives → link redirects
      back to **yourdomain.com** (not localhost — if it goes to localhost, fix
      Site URL in Supabase Auth settings, Phase 0 step 6)
- [ ] Log in / log out works
- [ ] Create a guide, upload an image (exercises DB + storage)
- [ ] Subscribe to Couple with Stripe test card `4242 4242 4242 4242` → plan
      shows in My Account
- [ ] Upgrade Couple → Family → prorated charge appears in Stripe test dashboard,
      plan updates in-app
- [ ] Downgrade Family → Couple → "scheduled at period end" banner appears, and
      Stripe shows a subscription schedule
- [ ] Downgrade to Free (cancel) → cancel-at-period-end shows in Stripe
- [ ] Webhook deliveries all `200` (Stripe dashboard → Webhooks → your endpoint)
- [ ] Share a guide link to someone not logged in → renders
- [ ] Refresh the browser on a deep route (e.g. /account/subscription) → no 404
      (SPA fallback working)

---

## Phase 6 — When you go from friend-testing to real money

1. Complete Stripe activation (business details, bank account).
2. Recreate the four prices in **live mode**; copy the live `price_...` IDs.
3. `supabase secrets set` the live `sk_live_`, live `whsec_` (a live-mode webhook
   endpoint must be created separately in Stripe), and live price IDs.
4. Update `.env` on the VPS with the live `pk_live_` publishable key → rebuild.
5. Re-run the Phase 5 checklist with a real card, then refund yourself.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Site loads but login/data fails | Wrong/paused Supabase project, or anon key mismatch | Check `.env` on VPS matches prod project; check project isn't paused; rebuild |
| Auth emails link to localhost | Supabase Site URL not set | Phase 0 step 6 |
| Plan changes but app never updates | Webhook failing | Stripe → Webhooks → check delivery errors; verify signing secret; ensure `--no-verify-jwt` on stripe-webhook |
| "Missing env var: STRIPE_PRICE_..." error | Function secrets not set | Phase 0 step 5 |
| Cert errors / Caddy loop | DNS not propagated when Caddy started | `docker compose restart caddy` after `dig` shows the VPS IP |
| Changes to `.env` don't take effect | Vite bakes env at build time | Always `up -d --build` after editing `.env` |
