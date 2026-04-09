# Notes Cross-Browser Persistence & Authentication Analysis

## Background

Notes are currently stored in `localStorage` under the key `tidycode-notes-state-v2`. localStorage is scoped per browser per origin — Chrome and Firefox on the same machine, or the same browser on two different machines, see completely separate stores. This document analyses approaches for persisting notes across browsers and devices, and how authentication fits into each.

---

## Part 1 — Sync Approaches

### Approach 1 — Hosted Backend (REST API + Database)

A server stores notes per user account. The app authenticates, then reads and writes notes over an API.

**How it works:**
- User logs in (see Part 2 for auth options)
- On app load: fetch notes from server, hydrate state
- On note create/update/delete/pin/archive: call the API
- All browsers and devices hit the same server → automatically in sync

**Pros:**
- True real-time sync across all browsers and devices
- Notes survive clearing localStorage or switching machines
- Full control over data model, queries, and retention
- Foundation for sharing, collaboration, and search later

**Cons:**
- Requires authentication — adds friction for first-time users
- Requires hosting infrastructure and ongoing maintenance
- Images stored as base64 blobs are too large for a DB column — needs object storage (S3, Cloudflare R2, Supabase Storage)
- Notes leave the user's machine
- Most complex to build

**Best for:** A multi-device product with user accounts, where notes are a first-class feature.

---

### Approach 2 — Local File Sync via Tauri (Desktop only)

On the Tauri desktop app, save notes to a JSON file in a known directory. Users sync that file themselves via Dropbox, iCloud Drive, OneDrive, etc.

**How it works:**
- On save: write `notes.json` to `~/Documents/TidyCode/` (or a user-chosen folder)
- On load: read the file if it exists, fall back to localStorage
- File syncs automatically if the folder is inside the user's cloud sync provider
- Web build continues using localStorage

**Pros:**
- Zero server infrastructure
- Fully offline — no connectivity required
- User controls their data and storage provider
- Notes are portable and human-readable JSON
- Tauri `fs` permissions already in `tauri.conf.json`

**Cons:**
- Desktop app only — web build gets no benefit
- Sync conflicts if two devices write simultaneously (file sync tools have basic conflict resolution, not app-aware)
- Images as base64 blobs will make the JSON file large
- User must set up their own sync service

**Best for:** A primarily desktop app with privacy-conscious users who already use Dropbox/iCloud/OneDrive.

---

### Approach 3 — CRDTs / Local-First with a Relay

A conflict-free replicated data type (CRDT) library handles merging note edits across browsers without a central authority. A small relay server passes change records between clients.

**How it works:**
- Each note edit produces a small delta (not a full snapshot)
- Deltas are stored locally in IndexedDB and forwarded to a relay
- Any browser that comes online pulls pending deltas and merges them automatically
- No single source of truth — all clients are equal peers

**Libraries:** Yjs, Automerge, ElectricSQL, PowerSync

**Pros:**
- Offline-first: works without a connection, syncs when back online
- Conflict resolution is automatic and principled
- No heavy database or complex API on the relay side

**Cons:**
- CRDT libraries add bundle size and a learning curve
- Still requires a relay server (though lightweight)
- Overkill for single-user notes without real-time collaboration
- Adds significant complexity to the existing simple state model

**Best for:** Collaborative notes with multiple users editing the same note simultaneously.

---

### Approach 4 — GitHub Gist / Third-Party Storage API

Store the notes JSON in a GitHub Gist using a personal access token the user provides.

**How it works:**
- User pastes a GitHub personal access token in Settings
- On save: PUT to `api.github.com/gists/{id}` with serialised notes
- On load: GET the Gist and hydrate state
- Same Gist is readable from any browser where the token is configured

**Pros:**
- Zero infrastructure
- Free and reliable
- Notes are version-controlled via Gist history
- No auth system to build

**Cons:**
- Requires GitHub account and token creation — poor UX for non-developers
- Token must be stored in localStorage — risk if the browser is shared
- Images as base64 blobs will exceed Gist size limits quickly
- GitHub API rate limits (5000 req/hour — fine in practice)

**Best for:** Developer-focused tools where users are comfortable with GitHub tokens.

---

### Approach 5 — Export / Import + Shareable Link (Stopgap)

No automatic sync. Give users one-click Export and Import, plus a shareable URL with notes encoded in the hash.

**How it works:**
- Export: serialise notes to JSON, trigger file download
- Import: file picker to load a JSON export
- Share link: gzip + base64 encode notes into the URL hash — opening the link in any browser offers to import them

**Pros:**
- Zero infrastructure, zero auth
- Completely private
- Simple to implement on top of existing state
- Works on web and desktop

**Cons:**
- Not automatic — user must remember to export/import manually
- URL encoding only works for small text notes (images make the URL too long)
- Easy to end up with divergent copies

**Best for:** A lightweight stopgap while a proper backend is planned.

---

## Part 2 — Authentication Options

Authentication is required for Approach 1 and optional for Approach 4. The options below are ordered from simplest integration to most flexible.

---

### Option A — Supabase Auth

[Supabase](https://supabase.com) is an open-source Firebase alternative that bundles Postgres, a REST/GraphQL API, file storage, and auth in one hosted service.

**Supported providers out of the box:** Google, GitHub, Apple, Azure, Discord, Facebook, Twitter/X, Slack, Spotify, LinkedIn, email/password, magic link, phone OTP.

**How it works:**
- One `supabase-js` client library handles everything
- Call `supabase.auth.signInWithOAuth({ provider: 'google' })` to open the Google consent screen
- On return, Supabase issues a JWT; the client attaches it to all API calls automatically
- Row-level security (RLS) policies on the `notes` table ensure users only see their own data

**Integration with TidyCode:**
```js
// Auth
await supabase.auth.signInWithOAuth({ provider: 'google' });

// Notes CRUD
const { data } = await supabase.from('notes').select('*');
await supabase.from('notes').upsert({ id, title, content, pinned, ... });
await supabase.from('notes').delete().eq('id', id);

// Image storage
await supabase.storage.from('note-images').upload(path, file);
```

**Pros:**
- Single SDK for auth, database, and file storage
- Generous free tier (50K monthly active users, 500MB DB, 1GB storage)
- Can self-host if privacy is a concern
- Real-time subscriptions available for live sync

**Cons:**
- Vendor dependency (mitigated by self-hosting option)
- Requires a Supabase project to be set up and environment variables managed

**Recommended starting point for this project.**

---

### Option B — Firebase Auth + Firestore

Google's Firebase provides Authentication and Firestore (a NoSQL document DB) as managed services.

**Supported providers:** Google, Apple, Facebook, GitHub, Microsoft, Twitter, phone, email/password, anonymous, SAML, OIDC.

**Integration with TidyCode:**
```js
// Auth
await signInWithPopup(auth, new GoogleAuthProvider());

// Notes CRUD (Firestore)
await setDoc(doc(db, 'users', uid, 'notes', noteId), noteData);
const snapshot = await getDocs(collection(db, 'users', uid, 'notes'));
```

**Pros:**
- Google infrastructure — very reliable
- Firestore has excellent real-time listeners (`onSnapshot`)
- Firebase Storage available for images
- Generous free tier (Spark plan: 1GB storage, 50K reads/day, 20K writes/day)

**Cons:**
- Google lock-in — no self-hosting option
- Firestore's document model requires restructuring the current flat notes array
- Firebase SDK adds ~60KB gzipped to the bundle

---

### Option C — Auth0

Auth0 is a dedicated identity platform that handles login flows, token management, MFA, and user management independently of your backend.

**Supported providers:** Google, Apple, Facebook, GitHub, Microsoft, LinkedIn, Twitter, SAML/enterprise SSO, email/password, passwordless.

**Integration with TidyCode:**
```js
// Wrap app with Auth0Provider, then:
const { loginWithRedirect, user, isAuthenticated } = useAuth0();

// Auth token attached to your own API calls
const token = await getAccessTokenSilently();
fetch('/api/notes', { headers: { Authorization: `Bearer ${token}` } });
```

**Pros:**
- Best-in-class auth UX and security features (MFA, anomaly detection, brute-force protection)
- Works with any backend — not tied to a specific database
- Excellent documentation and React SDK

**Cons:**
- Auth only — you still need to build and host the backend API and database separately
- Free tier limited to 7,500 monthly active users
- Adds cost and complexity at scale

**Best for:** When you want to bring your own backend (e.g. a custom Express/Node API or a separate hosted Postgres).

---

### Option D — Clerk

Clerk is a modern drop-in auth solution with pre-built UI components (sign-in modal, user profile, organization management).

**Supported providers:** Google, Apple, GitHub, Facebook, Microsoft, LinkedIn, email/password, magic link, phone OTP.

**Integration with TidyCode:**
```jsx
// Wrap app
<ClerkProvider publishableKey={...}>
  <SignedIn><App /></SignedIn>
  <SignedOut><SignIn /></SignedOut>
</ClerkProvider>

// Access user
const { userId } = useAuth();
```

**Pros:**
- Fastest time to working auth — pre-built React components
- Handles sessions, JWTs, token refresh automatically
- Generous free tier (10,000 monthly active users)
- Works with any backend via JWTs

**Cons:**
- Auth only — separate backend/database needed
- No self-hosting option

---

### Option E — NextAuth.js / Auth.js

Open-source auth library, primarily for Next.js but usable with other frameworks via adapters.

**Supported providers:** Google, GitHub, Apple, Facebook, Twitter, Discord, Azure, and 50+ others via OIDC/OAuth.

**Pros:**
- Fully open-source, self-hostable
- No per-user pricing

**Cons:**
- Requires a Node.js server to run the auth endpoints — does not work as a pure client-side library
- More configuration and maintenance than hosted solutions
- Less relevant here since TidyCode is a Vite/React SPA with a Tauri desktop build, not a Next.js app

---

## Part 3 — Recommended Path

Given TidyCode ships both a **web app** and a **Tauri desktop app**, the recommended approach is:

### Phase 1 — Stopgap (low effort, no infrastructure)

- Add **Export / Import JSON** so users can manually move notes between browsers today (Approach 5)
- Add **file-based persistence** in the Tauri desktop app so notes survive across restarts and can be placed in a Dropbox/iCloud folder (Approach 2)

### Phase 2 — Full sync with auth

- Integrate **Supabase** as the backend (database + file storage + auth)
- Add **Google OAuth** as the primary sign-in method, with email/password as a fallback
- Migrate notes to a Supabase `notes` table with a `user_id` foreign key
- Move note images from base64 blobs to Supabase Storage, storing only the URL in the DB row
- Keep localStorage as an offline cache — sync on connect

### Schema sketch (Supabase / Postgres)

```sql
create table notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  title       text not null default '',
  content     text not null default '',
  folder_id   uuid references folders(id),
  pinned      boolean not null default false,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table note_images (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid references notes(id) on delete cascade,
  storage_url text not null,
  created_at  timestamptz not null default now()
);

-- Row-level security: users only see their own notes
alter table notes enable row level security;
create policy "owner access" on notes
  using (auth.uid() = user_id);

create table todo_tabs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  local_id    integer not null,
  title       text not null default 'List',
  items       jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, local_id)
);

alter table todo_tabs enable row level security;
create policy "owner access" on todo_tabs
  using (auth.uid() = user_id);
```

### Auth flow (Supabase + Google)

```
User clicks "Sign in with Google"
  → supabase.auth.signInWithOAuth({ provider: 'google' })
  → Google consent screen
  → Redirect back to app with session token
  → Supabase client stores token in localStorage
  → App loads notes from Supabase for this user
  → On any note change: upsert to Supabase + update local state
```

---

## Decision Matrix

| Approach | Infrastructure | Auth Required | Works Web | Works Desktop | Images | Effort |
|---|---|---|---|---|---|---|
| 1. Hosted Backend | Server + DB | Yes | Yes | Yes | Object storage | High |
| 2. Tauri File Sync | None | No | No | Yes | In file | Low |
| 3. CRDT Relay | Relay server | Optional | Yes | Yes | Complex | High |
| 4. GitHub Gist | None | GitHub token | Yes | Yes | Size-limited | Medium |
| 5. Export/Import | None | No | Yes | Yes | In export | Low |

| Auth Option | Hosted | Self-hostable | DB included | Image Storage | Free Tier |
|---|---|---|---|---|---|
| Supabase | Yes | Yes | Yes (Postgres) | Yes | 50K MAU, 1GB |
| Firebase | Yes | No | Yes (Firestore) | Yes | 50K reads/day |
| Auth0 | Yes | No | No | No | 7.5K MAU |
| Clerk | Yes | No | No | No | 10K MAU |
| Auth.js | Self-hosted | Yes | No | No | Free (OSS) |

**Recommendation: Supabase + Google OAuth** — single SDK covers auth, database, and image storage; generous free tier; self-hostable if needed; and the integration path is straightforward given the existing React/Vite stack.
