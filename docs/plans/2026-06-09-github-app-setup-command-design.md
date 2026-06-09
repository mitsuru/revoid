# `revoid setup` — GitHub App Manifest Setup Command

Date: 2026-06-09
Status: Approved design, ready for implementation

## Goal

Add a `revoid setup` subcommand that, in one run, registers a GitHub App via the
App Manifest flow, retrieves its private key, stores the App credentials as
Actions secrets, rewrites the workflow to authenticate as the App, and opens the
install page. The purpose is **branding**: PR comments should come from
`revoid[bot]` instead of `github-actions[bot]`, while keeping the existing
GitHub Actions–driven model (no standalone webhook server).

## Why the manifest flow is not "open a URL"

The App manifest is submitted by a **POST form from the user's authenticated
browser session**, not by the CLI. GitHub provides no API to create a configured
App non-interactively. So `setup` must run a local HTTP server, serve a form the
browser submits to GitHub, and catch the redirect carrying a temporary `code`.

Manifest flow facts (verified against GitHub docs):

- Form POSTs to `https://github.com/settings/apps/new` (personal) or
  `https://github.com/organizations/<org>/settings/apps/new` (org), single
  field `manifest` = JSON-encoded config, optional `?state=` for CSRF.
- After approval GitHub redirects to the manifest's `redirect_url` with `?code=`.
- Exchange within **1 hour**: `POST /app-manifests/{code}/conversions` returns
  `id`, `slug`, `pem`, `webhook_secret`, `client_id`, `client_secret`, `html_url`.
- `127.0.0.1` / `localhost` are accepted as `redirect_url` for this flow.

## Flow

```
revoid setup [--org <org>] [--repo <owner/repo>] [--no-browser] [--public]
  1. Detect owner type (User vs Organization) via gh api.
  2. Start local HTTP server on 0.0.0.0:PORT; generate random `state`.
  3. Print openable URLs:
       http://127.0.0.1:PORT/
       http://<LAN-IP>:PORT/   (enumerated from network interfaces)
     Unless --no-browser, auto-open the 127.0.0.1 URL.
  4. User opens `/` on any device. The server reads the request Host header and
     returns an auto-submitting form whose manifest.redirect_url =
     http://<Host>/callback — so the return target always matches whichever URL
     the user actually opened (local or LAN).
  5. User clicks "Create GitHub App" in the browser (human step #1).
  6. GitHub redirects to http://<Host>/callback?code=...&state=...
     Server validates `state`, captures `code`, shows a success page, stops.
  7. gh api -X POST /app-manifests/{code}/conversions → App credentials.
  8. Set Actions secrets (current repo by default; --org / --repo to retarget).
  9. Rewrite .github/workflows/revoid.yml to mint an App token.
 10. Open the install URL https://github.com/apps/<slug>/installations/new
     last (human step #2).
```

### redirect_url integrity (the crux)

Binding to `0.0.0.0` lets a browser on another LAN device reach the server, which
is the headless/SSH case the LAN-IP display targets. The `redirect_url` cannot be
hardcoded, because it must point back to whichever host the user opened. The
server therefore derives `redirect_url` from the **request Host header** at the
moment `/` is served, guaranteeing the callback returns to the same host.

Security: `0.0.0.0` opens a transient LAN port. Mitigations — `state` CSRF token,
single-use `code` valid 1 hour, and the server stops immediately after capture.
Acceptable for a dev setup tool.

## Manifest content

```jsonc
{
  "name": "revoid",                          // default; editable in browser
  "url": "https://github.com/<owner>/revoid",
  "redirect_url": "http://<Host>/callback",  // injected from Host header
  "public": false,                            // default private; --public to flip
  "default_permissions": {
    "pull_requests": "write",  // post comments / reviews
    "contents": "read",        // read diff / files
    "metadata": "read"         // mandatory
  },
  "default_events": []          // Actions-driven; no webhook subscriptions
}
```

The App token's scope comes from `default_permissions`, **not** the workflow
`permissions:` block. Getting this wrong prevents `revoid[bot]` from commenting.

## Secrets

Set via `gh secret set` (current repo default; `--org` / `--repo` to retarget):

| Secret | Value | Notes |
|---|---|---|
| `REVOID_APP_ID` | conversion `id` | |
| `REVOID_APP_PRIVATE_KEY` | `pem` | piped via `--body-file -`; never written to disk |
| `REVOID_ZEN_API_KEY` | existing check | prompt only if missing (required by revoid) |

The private key is held in memory and discarded; `webhook_secret` /
`client_secret` are not stored (unused in the Actions-driven model — YAGNI).

## Workflow rewrite

Insert an `actions/create-github-app-token@v3` step and swap the token env:

```yaml
      - uses: actions/create-github-app-token@v3
        id: app-token
        with:
          app-id: ${{ secrets.REVOID_APP_ID }}
          private-key: ${{ secrets.REVOID_APP_PRIVATE_KEY }}
      - name: revoid review
        env:
          REVOID_ZEN_API_KEY: ${{ secrets.REVOID_ZEN_API_KEY }}
          GH_TOKEN: ${{ steps.app-token.outputs.token }}   # was secrets.GITHUB_TOKEN
        run: ...
```

## Idempotency

- The manifest flow **always creates a new App** (no update-via-manifest). On
  re-run, warn and require confirmation before re-registering to avoid duplicate
  Apps.
- Workflow rewrite must not double-insert the `app-token` step. Detect an
  existing step, show a diff, and ask before applying.
- The install slug is read from the conversion response (`slug`), never
  hardcoded to `revoid` (the user may rename in the browser).

## Code structure

Mirror the existing `exec` / `writeFile` dependency-injection pattern in
`cli.ts` / `github.ts` so the command is testable.

- New `src/setup.ts`:
  - Pure: `buildManifest`, `parseConversion`, `rewriteWorkflow`, `localUrls`
    (NIC enumeration), `renderLandingPage`, `renderSuccessPage`.
  - I/O (injected): `serveAndAwaitCode` (http server), `openBrowser`,
    `exec` (gh), `writeFile`.
- Wire `program.command("setup")` in `cli.ts`.
- Tests: unit-test the pure functions; mock the injected I/O for the orchestrator.

## Out of scope (YAGNI)

- Standalone webhook service / server deployment.
- Storing `webhook_secret` / `client_secret`.
- Org-wide install automation beyond `--org` secret targeting.
