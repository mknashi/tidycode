# Forms service

A small backend that receives contact and feedback forms from any of your websites and emails them to you, without exposing your address and without third-party form services.

- **Live at:** `https://forms.tidycode.ai`
- **Used by:** the TidyCode app (Feedback button) and any site listed in [`sites.yaml`](sites.yaml)

## How spam is kept out

| Layer | What it stops |
|---|---|
| Allowed origins per site | Other websites using your form from their pages |
| Honeypot field | Simple bots that fill in every field; they get a fake "sent" |
| Proof of work ([ALTCHA](https://altcha.org) format) | Bulk sending. The browser spends about a second solving a puzzle, which costs little for one message and a lot for thousands. Each solution works only once. |
| Minimum time on form (3 s) | Scripts that submit instantly |
| Per-IP rate limits (default 5/hour, 20/day per site) | Repeated sending from one connection |
| Content rules | Over-long messages, link spam (default at most 2 links), malformed emails |

The form never emails the person who submitted it. Their address is only used as `Reply-To`, so the form can't be used to send mail to other people.

Every accepted message is saved to SQLite before the email is sent. If SES is unreachable, the email is retried every 5 minutes (up to 5 attempts).

## API

| Method and path | Purpose |
|---|---|
| `GET /health` | Liveness check |
| `GET /v1/challenge?site=ID` | Proof-of-work challenge (request must come from the site's origin) |
| `POST /v1/submit` | JSON: `site`, `message`, optional `name`, `email`, `page`, `meta` (flat string pairs), `website` (honeypot, must be empty), `altcha` (solved challenge) |
| `POST /v1/rate` | JSON: `site`, `stars` (whole number 1–5), `clientId` (random id the client keeps, 16–100 of `A-Z a-z 0-9 _ -`), optional `page`, `altcha`. Only for sites with `ratings: true`. Returns `created: false` when it replaced the client's earlier rating. |
| `GET /v1/ratings/summary?site=ID` | Public: `count`, `average` (2 decimals, `null` with no ratings) and `distribution` by stars. Any origin; cached for 5 minutes. |
| `GET /v1/widget.js` | Embeddable form |
| `GET /admin` | Admin page (see [Admin page](#admin-page)) |
| `/admin/api/...` | Admin API used by that page; needs `Authorization: Bearer $ADMIN_TOKEN`. Routes are listed at the top of [`src/admin.js`](src/admin.js). |
| `GET /admin/submissions`, `GET /admin/ratings`, `DELETE /admin/ratings/ID` | Earlier admin URLs, still working (same token) |

## Star ratings

Sites with `ratings: true` in `sites.yaml` accept 1–5 star ratings, used for the rating shown on the site and in its structured data.

- **One rating per client.** The client sends a random id it created and kept. Rating again replaces the earlier rating. Only a salted hash of the id is stored.
- **Every rating counts.** Don't delete ratings because they're low. Asking only happy users, or hiding negative ratings, breaks Google's review guidelines and the FTC's rule on consumer reviews. Delete only clear abuse, such as a burst of ratings from one IP hash.
- **Same spam defenses as messages** except the honeypot: allowed origins, proof of work, and per-IP limits of 5 an hour and 10 a day per site.
- Ratings aren't emailed. See them on the [admin page](#admin-page).

## Adding a website

1. Add the site to [`sites.yaml`](sites.yaml):
   ```yaml
   my-site:
     name: My Site
     origins: [https://www.my-site.com, https://my-site.com]
     to: hello@my-site.com
   ```
2. Commit and redeploy the forms app in Dokploy.
3. Put the form on the page:
   ```html
   <div data-forms-site="my-site"></div>
   <script src="https://forms.tidycode.ai/v1/widget.js" defer></script>
   ```
   Optional attributes on the `div`:
   - `data-forms-submit-label="Send message"`
   - `data-forms-success="Thanks!"`
   - `data-forms-hide-name="true"`

   To theme it, set `--tcf-accent`, `--tcf-border`, `--tcf-radius` and `--tcf-gap` in CSS. Text colour and font come from the page.

   To keep a form you've already designed, put the attribute on the form itself and remove its `action`. It needs a field named `message` (it can be hidden) and a submit button; `name` and `email` are used if present, and any other named fields are included in the email:
   ```html
   <form data-forms-site="my-site">
     <input name="name" required>
     <input name="email" type="email" required>
     <textarea name="message" required></textarea>
     <button type="submit">Send</button>
   </form>
   <script src="https://forms.tidycode.ai/v1/widget.js" defer></script>
   ```

Messages are sent from `MAIL_FROM` (`forms@tidycode.ai`) for every site, so new sites need no SES changes. To send from a site's own domain instead, set `from:` for that site and verify that domain in SES.

## One-time setup

### 1. Amazon SES
1. In the AWS console, open **SES** and pick a region, for example `us-east-1`. Use that region's SMTP host below.
2. **Identities → Create identity → Domain → `tidycode.ai`**, with Easy DKIM (RSA 2048). SES shows three CNAME records.
3. In tidycode.ai's DNS (Cloudflare or GoDaddy, see step 3 below), add the following. In Cloudflare, set the DKIM records to **DNS only**, not proxied.
   - the three DKIM `CNAME` records from SES
   - a DMARC record if you don't have one: `TXT` `_dmarc` → `v=DMARC1; p=none; rua=mailto:<your address>`
4. Wait until SES shows the domain as **Verified** (usually minutes).
5. **Account dashboard → Request production access.** Until approved, SES only delivers to addresses you have verified individually. To test sooner, verify your inbox under Identities → Email address.
6. **SMTP settings → Create SMTP credentials.** Save the SMTP username and password. They are different from AWS access keys and are shown only once.

### 2. The inbox
`sites.yaml` sends TidyCode feedback to `feedback@tidycode.ai`. Either:
- create that address as a forward at GoDaddy (Email → Forwarding) to one of your existing inboxes, or
- change `to:` in `sites.yaml` to an existing address.

### 3. DNS for the service
Add an `A` record `forms` → your Dokploy server's IP address, wherever tidycode.ai's DNS is managed. That's Cloudflare if the site is proxied through it (see `docs/BACKUP-AND-RESTORE.md`), otherwise GoDaddy.

If it's proxied through Cloudflare:
- Check that the Cloudflare Origin certificate on the server covers `forms.tidycode.ai`. The default wildcard `*.tidycode.ai` does; a certificate for only `tidycode.ai` and `www` doesn't.
- Set `CLIENT_IP_HEADER=cf-connecting-ip` (step 4). Otherwise every visitor appears to come from a Cloudflare server, and rate limits would group unrelated people together.

### 4. Dokploy
1. **Create Service → Compose**, from this repository and the branch you deploy, with compose path **`./forms/docker-compose.yml`**.
2. **Environment:**
   ```
   SMTP_HOST=email-smtp.us-east-1.amazonaws.com
   SMTP_PORT=587
   SMTP_USER=<SES SMTP username>
   SMTP_PASS=<SES SMTP password>
   MAIL_FROM=TidyCode Forms <forms@tidycode.ai>
   HMAC_KEY=<output of: openssl rand -hex 32>
   IP_SALT=<output of: openssl rand -hex 16>
   ADMIN_TOKEN=<output of: openssl rand -hex 24>
   CLIENT_IP_HEADER=cf-connecting-ip   # only if proxied through Cloudflare
   ```
   Keep `HMAC_KEY` stable. Changing it only invalidates challenges issued in the last hour, so it's safe to rotate if needed.
3. **Domains:** `forms.tidycode.ai`, service `forms`, container port **8080**. Use the same certificate setup as the main site.
4. **Deploy.** The log should show `SMTP connection verified`.
5. Check the service: `curl https://forms.tidycode.ai/health` should return `{"ok":true}`.

Optional settings:
- `MIN_FORM_MS` (default 3000)
- `POW_MAX_NUMBER` (default 50000; higher means harder puzzles)
- `TRUST_PROXY` (default true, for running behind Traefik)
- `CLIENT_IP_HEADER` (header holding the visitor's IP, e.g. `cf-connecting-ip`)

## Admin page

Open **https://forms.tidycode.ai/admin** and paste `ADMIN_TOKEN`. The token stays in that browser tab only and is cleared when the tab closes. The page covers every site in `sites.yaml`; pick one at the top or leave it on "All sites".

- **Overview:** messages per site in the last 7 and 30 days and all time, unhandled messages, failed emails, and each site's rating with its star breakdown.
- **Messages:** filter by handled or not, email status, or text in the name, email, message or page. Open one to read it, reply by email, mark it handled, retry its email, or delete it (for example when someone asks for their data to be removed).
- **Ratings:** the average and breakdown, new ratings per day for 90 days, ratings by page, and IP hashes with 3 or more ratings, which you can list or delete together. Delete only clear abuse, never low ratings.
- **Health:** when the service started, the last SMTP check (repeated every 6 hours), the last email sent, emails pending, retrying or given up per site, and how many messages and ratings were blocked since the service started, by reason.
- **Export CSV** on Messages and Ratings downloads everything for the chosen site. Cells that a spreadsheet would treat as a formula start with `'`.

Messages are written by the public, so the page shows them only as text, and it's served with a strict Content-Security-Policy.

With `curl`:
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" "https://forms.tidycode.ai/admin/api/messages?site=tidycode&handled=false"
curl -H "Authorization: Bearer $ADMIN_TOKEN" -o tidycode-ratings.csv "https://forms.tidycode.ai/admin/api/export?site=tidycode&type=ratings"
```

## Development
```bash
cd forms
npm install
npm test
PORT=8787 DB_PATH=./dev.db SMTP_HOST=127.0.0.1 SMTP_PORT=2599 \
  MAIL_FROM='Forms <forms@tidycode.ai>' HMAC_KEY=dev IP_SALT=dev ADMIN_TOKEN=dev \
  TRUST_PROXY=false npm start
```
With no SMTP server on that port, messages are saved with status `failed`, which is useful for testing.

The admin page is then at http://localhost:8787/admin with the token `dev`.

To use the local server from the TidyCode app, run the app with `VITE_FORMS_URL=http://localhost:8787 npm run dev`. `http://localhost:5173` is already an allowed origin.

Requires Node 22.13 or later (built-in `node:sqlite`).
