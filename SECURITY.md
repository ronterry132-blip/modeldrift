# Security policy

## Reporting a vulnerability

Please report a vulnerability privately. Do not open a public issue, pull request, or discussion for a security report.

Use GitHub private vulnerability reporting:

https://github.com/ronterry132-blip/modeldrift/security/advisories/new

If that page says reporting is not enabled, contact the repository owner at GitHub account [@ronterry132-blip](https://github.com/ronterry132-blip) through a private channel on that account. This project does not publish a personal email address.

Include what you can: affected path, impact, and a minimal way to reproduce the issue. Please give the owner time to respond before any public disclosure.

There is no bug bounty.

## What this action is allowed to do

ModelDrift is a read-only scanner plus an optional comment or issue.

- Workflows that call it should set `contents: read`.
- Add `pull-requests: write` only when the action should comment on a pull request.
- Add `issues: write` only when the action should open or update an issue.
- Do not grant `contents: write`. The action does not commit or push.
- Do not run it on `pull_request_target`. The action exits before scanning, fetching, or commenting if `GITHUB_EVENT_NAME` is `pull_request_target`. That event checks out untrusted code with the base repository token, and a comment would publish text derived from the fork.

Checkout should set `persist-credentials: false` in caller workflows so a later step does not inherit git credentials.

## What the scanner does not do

- It reads file text. It does not execute, import, or eval scanned code.
- It does not follow symlinks.
- It skips common secret filenames (`.env`, `.npmrc`, `.netrc`, private key names) and paths outside the workspace.
- It does not read `secrets` from the Actions context. The only token it uses is the `github-token` input, and only to post the report. That value is registered with `setSecret` and is not written to the report.
- With the default inputs it makes no network call. It reads the catalog files shipped in `data/`.
- An optional `prices-url` must be public `https`, with no userinfo and no query string. Hostnames that resolve to loopback, private, link-local, CGNAT, or cloud metadata addresses are rejected. Redirects are checked again. The URL is not written into warnings.

The daily catalog refresh workflow is the only workflow in this repository that pushes commits. It is maintainer-only, limited to `data/price-refresh-*` branches, and it commits only `data/prices.json`, `data/aliases.json`, and `data/deprecations.json`.

## Scope

In scope: `action/`, the workflows in `.github/workflows/`, `worker/`, `site/`, and the catalog refresh script.

Out of scope: provider pricing pages, LiteLLM, and other third-party data sources. Their availability and accuracy are not something this repository can guarantee. See the disclaimer in `README.md`.
