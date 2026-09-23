# Deploy — Minha Nuvem

Runs on the same Hostinger VPS as Nextcloud, as a **separate** Docker Compose
stack (own directory, own network) so nothing here can ever take Nextcloud
down. Nginx on the host routes each domain to the right container, exactly
like it already does for `nuvem.sinmpla.com.br` -> Nextcloud.

| Domain | Routes to | Notes |
|---|---|---|
| `nuvem.sinmpla.com.br` | `127.0.0.1:8080` (Nextcloud) | unchanged |
| `minha.sinmpla.com.br` | `127.0.0.1:3001` (this app) | currently a static placeholder page — this deploy replaces it |

## First deploy

1. **Push the code to GitHub** (once repo access is sorted — see main README).
2. **Apply the DB migration** — done: `supabase/migrations/0001_init.sql` has
   already been run against the real `minha-nuvem` Supabase project.
3. On the VPS:
   ```bash
   git clone https://github.com/fagundesleonardo/minha-nuvem-app.git /opt/minha-nuvem-app
   cd /opt/minha-nuvem-app
   cp deploy/docker-compose.yml docker-compose.yml
   cp .env.example .env
   nano .env   # fill in the real values — see below
   docker compose up -d --build
   curl -I http://127.0.0.1:3001   # should return a 200/307, not a connection error
   ```
4. **Nginx**:
   ```bash
   cp deploy/nginx-minha.sinmpla.com.br.conf /etc/nginx/sites-available/minha.sinmpla.com.br.conf
   nginx -t && systemctl reload nginx
   ```
5. Visit `https://minha.sinmpla.com.br` and sign up for the first account —
   then promote it to admin:
   ```sql
   update cloudapp.profiles set role = 'admin' where email = 'leo@...';
   ```
   (run in the Supabase SQL Editor for the `minha-nuvem` project)

## `.env` values and where they come from

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase
  dashboard -> minha-nuvem project -> Connect -> Framework (Next.js). Both
  are safe to expose in the browser by design.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard -> Project Settings ->
  API. **Secret** — only ever used server-side (public share-link
  resolution).
- `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_ENDPOINT` — Cloudflare dashboard -> R2 -> the bucket Nextcloud
  already uses (same `OBJECTSTORE_S3_*` values as Nextcloud's config, just
  under these names). **Secret.**
- `NEXT_PUBLIC_APP_URL` — `https://minha.sinmpla.com.br`

## Redeploying after a code change

```bash
cd /opt/minha-nuvem-app && git pull && docker compose up -d --build
```

## Rolling back

```bash
cd /opt/minha-nuvem-app && git log --oneline   # find the previous commit
git checkout <previous-commit> && docker compose up -d --build
```
Nextcloud is untouched by any of this — `nuvem.sinmpla.com.br` keeps working
throughout.
