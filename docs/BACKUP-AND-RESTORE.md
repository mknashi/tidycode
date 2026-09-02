# Backup and restore

**This site has no backups, and does not need any.**

It is a static build: nginx serving `dist/`, produced by `vite build` from this
repository. There is no database, no runtime environment variables, no uploads,
and nothing written at runtime. Every byte the site serves comes from a build of
this repo.

Recovery is therefore a redeploy, and the repository is the backup.

## Recovering the site

Dokploy → tidycode → **Deploy**. That clones branch `deploy/dokploy`, builds,
and replaces the container.

If the whole server is gone:

1. Provision a new box and install Dokploy.
2. Create a Compose service from `https://github.com/mknashi/tidycode.git`,
   branch `deploy/dokploy`, compose path **`./docker-compose.deploy.yml`**.
3. No environment variables are required.
4. Add the domains `tidycode.ai` and `www.tidycode.ai`, container port
   **8080** — the field defaults to 3000, and getting it wrong produces a 502
   on only the hostname you missed.
5. Point DNS at the new server.

## What is *not* reproducible

The build is not deterministic, and this is the one real risk here:

- **`package-lock.json` is gitignored**, so the build runs `npm install` and
  resolves whatever satisfies the ranges in `package.json` at build time.
- **`tinyllm` is an unpinned git dependency** (`github:mknashi/tinyllm`),
  resolving to whatever `main` points at during the build.

So a rebuild six months from now can produce a materially different bundle from
the one running today, with no change to this repository. Both were already true
on Render; containerising the build only made it visible.

If you want reproducible builds, commit the lockfile and switch to `npm ci`, and
pin the git dependency to a commit sha. Until then, treat "redeploy" as
"rebuild from current dependency versions", not "restore what was running".

## Verifying a deployment

Content types matter as much as status codes here — a misconfigured MIME map
returns 200 for everything while browsers download the page instead of
rendering it.

```bash
for p in / /docs /download /private-alpha /json-formatter /nonexistent-xyz; do
  printf "%-20s " "$p"
  curl -s -o /dev/null -w "%{http_code}  %{content_type}\n" \
    "https://www.tidycode.ai$p?cb=$RANDOM"
done
```

Expected: `200 text/html` for all but the last, which must be **404** — the SPA
catch-all in `public/_redirects` has never been active in production, and
`nginx.conf` deliberately preserves that.

Also confirm an asset and the apex redirect:

```bash
curl -sI https://www.tidycode.ai/assets/<hashed>.js | grep -i content-type
# expect application/javascript

curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://tidycode.ai/docs
# expect 301 -> https://www.tidycode.ai/docs
```

## Certificates

The origin serves a **Cloudflare Origin certificate** valid to 2041, loaded via
`/etc/dokploy/traefik/dynamic/zz-tc-origin.yml` on the server. Traefik's file
provider does not recurse, so the copy Dokploy writes under
`certificates/<id>/` is never read — that top-level file is what loads it.

Two consequences:

- **Re-uploading the certificate in Dokploy changes the directory id**, and
  `zz-tc-origin.yml` must be repointed or Traefik falls back to its default
  certificate and Cloudflare returns 526.
- Browsers do not trust Cloudflare's origin CA, so **turning the Cloudflare
  proxy off breaks the site**. Rollback is restoring the certificate config, not
  toggling DNS.

Last verified: 2026-09-02.
