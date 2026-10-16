# North Star Connections

Service-for-service exchange community by North Star Ventures.

## Deployment
- GitHub: `northstarventuresca-livebridge/northstarconnections`
- Cloudflare Pages: `northstar-connections`, built from `public/`
- D1: `northstar-connections-db` (binding `DB`)
- R2: `northstar-connections-media` (binding `MEDIA`)
- Pages advanced Worker: `public/_worker.js`
- Restore point: original main branch README-only commit plus standard Cloudflare Pages deployment history.

## Features
Responsive accessible landing page; examples of bilateral service trades; public anonymized service listings; member registration and login using PBKDF2-hashed passwords and HttpOnly cookies; profile editor with skills, needs, image uploads and portfolio; automatic keyword-based reciprocal match suggestions; in-app match notifications; exchange proposals; role-based admin dashboard for managing members, listing visibility, moderation and admin assignment.

## Setup
Cloudflare D1 schema: `migrations/0001_initial.sql`.
To claim the first admin account, register as `northstarventures.ca@gmail.com` using the one-time administrator invitation code. Its SHA-256 verifier is configured as Pages `ADMIN_SETUP_HASH` and the invitation itself is not in the source repository.

For outbound emails, configure Pages secret `SMTP2GO_API_KEY` and an authorized sender `MAIL_FROM`. Notifications and exchange messages work in-app even without outbound email.

## Notes
- A public profile intentionally does not expose personal name, business name, email, website or phone until the visitor signs in. Members still choose what to include in their public descriptions and photos.
- Draft profiles are not publicly listed and do not match.
- Mutual keyword matches are recommendations; partners negotiate the actual exchange independently.
- This is the initial launch version, not an escrow, identity verification or payment-processing platform.
