# SEO

How tidycode.ai is set up for search engines, what changed in the November 2026
audit against [Google Search Essentials](https://developers.google.com/search/docs/essentials),
and what to do next.

## Rules to follow when touching pages

These are the conventions the site now depends on. Breaking one quietly undoes
the audit work, and nothing will error.

**One host: `https://www.tidycode.ai`.** The bare domain 301s to `www`
(`nginx.conf`). Every canonical, `og:url`, `twitter:url`, JSON-LD `url`/`item`,
sitemap `<loc>` and absolute link must use `https://www.tidycode.ai`. Before
this audit they all said `https://tidycode.ai`, so every page named as its
canonical a URL that redirected away from itself. To check:

```bash
grep -rn "https://tidycode\.ai" index.html public src | grep -v "@tidycode.ai"
# expect no output
```

**One URL per page, in its clean form.**

| Page type | Canonical form | Example |
| --- | --- | --- |
| Single file | no extension | `/privacy`, `/docs/features` |
| Directory | trailing slash | `/docs/`, `/json-editor/` |

Use this form in links, canonicals and the sitemap. nginx 301s every other
spelling to it (`/privacy.html` → `/privacy`, `/docs/index.html` → `/docs/`,
`/json-editor` → `/json-editor/`), so a wrong link still works, but it costs a
redirect hop and weakens the signal.

**No SPA catch-all.** Unknown paths must return a real 404. A catch-all that
serves `index.html` with a 200 makes every typo a "soft 404" in Google's eyes.

**Link every tool page from every static page.** Each page under `public/`
ends with the same list of tool links (a page leaves out its own). Add a new
tool page to all of them, and to `WELCOME_TOOL_LINKS` in `src/TidyCode.jsx` if
it belongs on the homepage (see below).

**Hide pages with `noindex`, not `robots.txt`.** Google can only see a
`noindex` tag on a page it is allowed to crawl, so a `Disallow` would hide the
tag and leave the bare URL in results. `robots.txt` allows everything on
purpose.

## Changes made (2026-11-06)

### Domain and URLs

- **`www` everywhere.** Rewrote every absolute URL in `index.html`, all of
  `public/**/*.html`, `sitemap.xml`, `robots.txt`, and the help links in
  `src/components/help/HelpContent.jsx` (which the desktop app opens).
- **Clean URLs in links and canonicals.** `/download.html` → `/download`,
  `/privacy.html` → `/privacy`, `/docs/index.html` → `/docs/`,
  `/docs/features.html` → `/docs/features` and the same for the other docs
  pages, in pages and in `src/`.
- **Redirects in `nginx.conf`:**
  - `*.html` → the same path without the extension, with the query string kept
  - `.../index.html` → `.../`
  - a directory without its trailing slash → with it

  The `.html` rules test `$request_uri`, not `$uri`. nginx serves `/` and
  `/docs/` through an internal redirect to `.../index.html`, and a rule
  matching `$uri` 301s those pages to themselves forever. The first version
  did exactly that.
- **Removed redirect hops.** Links to `/app`, which 302s to `/`, now point at
  `/`. A broken `/beta` link on `download-alpha.html` now goes to
  `/private-alpha`.
- **Deleted `public/_redirects`.** It was Netlify / Cloudflare Pages
  configuration that production never read. Its catch-all SPA rule would have
  caused soft 404s on any host that did read it.

### Sitemap and robots.txt

- `sitemap.xml` uses `www` clean URLs and a current `lastmod`. It no longer has
  `changefreq` or `priority`, which Google ignores. Update `lastmod` only when a
  page's content actually changes.
- `robots.txt` allows everything and points at the `www` sitemap. The
  `Disallow` lines for `/private-alpha` and `/download-alpha` were removed, so
  their `noindex` tags are visible to Google.

### Internal links

- **Static pages.** All landing pages, the four docs pages, `download.html` and
  `privacy.html` now end with the same links: all 10 tool pages, Documentation
  and Privacy. Before, each landing page linked to 3 or 4 hand-picked
  siblings and the docs pages linked to none.
- **Homepage.** The app is an SPA whose only links were inside menus that render
  on demand, so Google found no path from `/` to any tool page. The Welcome tab
  (what a first-time visitor and Google's crawler see) now ends with a "Free
  online tools" row of real `<a href>` links, listed in `WELCOME_TOOL_LINKS` in
  `src/TidyCode.jsx`:
  - It shows in the web build only. In the desktop app those links would
    navigate the editor window away.
  - It leaves out JSON Formatter, XML Formatter and VIM Editor on purpose: the
    formatters do the same job as the JSON/XML editors, and VIM is a mode in
    every editor. Their landing pages stay, because they match different
    searches ("json formatter", "online vim editor").
- **The visually hidden H1** on the homepage was kept. Text only screen readers
  see is a standard accessibility technique, not hidden spam text.

### Desktop download page

The desktop app isn't released yet, so `/download` is hidden from search:

- `<meta name="robots" content="noindex, follow">` in `public/download.html`
- removed from `sitemap.xml`
- removed from every footer link list

The page still loads for anyone with the URL.

**At launch:** set the robots tag back to `index, follow`, re-add
`https://www.tidycode.ai/download` to `sitemap.xml`, add a "Desktop App" link to
the footers and to `WELCOME_TOOL_LINKS`, and request indexing for the URL in
Search Console.

### Verifying a deploy

Production builds from the `deploy/dokploy` branch (see
`docs/BACKUP-AND-RESTORE.md`). After deploying:

```bash
B=https://www.tidycode.ai
for u in / /docs/ /docs/features /json-editor/ /privacy /nope \
         /download.html /docs/index.html /docs /json-editor; do
  printf "%-18s " "$u"; curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "$B$u"
done
```

Expected: 200 for the first five, 404 for `/nope`, and 301 to the clean form for
the last four. Then check that `curl -s $B/robots.txt` ends with the `www`
`Sitemap:` line.

**Local dev:** `npm run dev` (Vite) and `serve.js` don't serve the extensionless
docs URLs such as `/docs/features`; only nginx does. To test, run the
production image or mount `dist/` into `nginx:1.27-alpine` with `nginx.conf`.

## Next priorities

In order. The first one is a prerequisite: until the changes are deployed and
Google has recrawled, nothing above has any effect.

1. **Deploy and set up Search Console.**
   - Merge to `deploy/dokploy` and run the verification above.
   - In [Search Console](https://search.google.com/search-console), verify the
     `https://www.tidycode.ai` property (a Domain property is better: it covers
     both hosts).
   - Submit `https://www.tidycode.ai/sitemap.xml`.
   - Run URL Inspection on `/` to confirm the rendered page shows the Welcome
     tab and its links.
   - Request recrawls for `/download` and a couple of landing pages.
   - Over the next few weeks, watch the Page indexing report. "Alternate page
     with proper canonical" and "Page with redirect" entries should go down.
     Google says to allow a few weeks before judging a change.

2. **Make the homepage work at phone widths.** Google indexes the mobile
   rendering of every page. At 390px the Welcome tab is cut off on the right,
   and the cookie and privacy popups cover much of the screen. The text is still
   in the page, so it's indexable, but this is the page experience Google
   measures. Also run [PageSpeed Insights](https://pagespeed.web.dev/) on `/`
   and a landing page: the app's main JS bundle is about 1.5 MB, plus ads and
   analytics, so Core Web Vitals (LCP, INP, CLS) are worth measuring before
   guessing.

3. **Make look-alike pages distinct.**
   - `json-formatter` vs `json-editor` and `xml-formatter` vs `xml-editor`
     come from the same template and describe the same tool. If they read too
     alike, Google may treat each pair as duplicates and show only one. Give
     each page content specific to its search intent: the formatter pages on
     indentation options, minify and validation errors with examples; the
     editor pages on tree view, editing large files and conversion.
   - `vim-editor` should say that VIM mode works in every editor and link to
     them, so it doesn't read as a separate product.
   - Across all landing pages, add a real example (input, output, an error
     message), keyboard shortcuts and limits. Google's main content guidance is
     "helpful, reliable, people-first", and template copy is the weakest part of
     these pages.

4. **Social preview images and screenshots.**
   - `og:image`, `twitter:image` and the JSON-LD `screenshot` all point at
     `tidycode-logo.svg`. Facebook, LinkedIn and X don't render SVG, so shared
     links show no image. Make a 1200×630 PNG, one per tool page or one
     site-wide.
   - Put real product screenshots on the landing pages, with descriptive alt
     text ("JSON editor showing a syntax error highlighted on line 12"). They
     help visitors and can bring Google Images traffic.
   - Add 192px and 512px PNG icons to `manifest.json` and `apple-touch-icon`.
     `tidycode-logo-512.png` already exists.

5. **Structured data.**
   - Add `Organization` (name, url, logo) and `WebSite` (name, url) JSON-LD to
     `index.html`, so Google shows the right site name and logo.
   - Expectations for what's already there: `FAQPage` markup no longer produces
     rich results for sites like this (Google limited them to government and
     health sites in 2023), and `WebApplication` needs `aggregateRating` or
     `review` to be eligible. Only add ratings from real reviews; made-up
     ratings break Google's spam policies.
   - Check every page with the
     [Rich Results Test](https://search.google.com/test/rich-results).

6. **Small cleanups.**
   - Remove `<meta name="keywords">` (Google says it doesn't use it),
     `revisit-after`, `language` and `<meta name="title">` from all pages.
   - Update the footer copyright, which still says © 2025 on the landing
     pages.

7. **New pages for long-tail searches.**
   - Format conversion pages (`/json-to-yaml/`, `/xml-to-json/`,
     `/yaml-to-toml/` and so on). Each one targets a specific, high-intent
     search the app already handles.
   - A blog or guides section for how-to searches.

   Follow the rules at the top of this file for every new page.

8. **Promotion.** Links from other sites help Google find and rank pages. List
   Tidy Code on Product Hunt and AlternativeTo, and share it in developer
   communities where a JSON, YAML or diff tool genuinely helps. Google's starter
   guide also warns against overpromoting.
