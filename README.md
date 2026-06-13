# contact-mailer-backend

Tiny Express service that delivers portfolio contact-form submissions through the
**Brevo transactional email API** (HTTPS). Brevo is used instead of Gmail SMTP because
many hosts (e.g. Render's free tier) block outbound SMTP ports — Brevo's API runs over
plain HTTPS (port 443), so it works everywhere.

**Credentials live only in environment variables** (`.env` locally, host env vars in
production) — never committed, never sent to the browser.

This is intentionally a **separate repo** from the portfolio site. The static site
(GitHub Pages) just `fetch()`es the `/send` endpoint here.

## Endpoints

| Method | Path    | Purpose                                  |
|--------|---------|------------------------------------------|
| `GET`  | `/`     | Health check → `{ "ok": true }`          |
| `POST` | `/send` | Send a message. JSON body (below).       |

`POST /send` body:

```json
{ "name": "Jane", "email": "jane@acme.com", "company": "Acme", "service": "AI app", "message": "Hi!" }
```

`name`, `email`, `message` are required. Replies go to the sender's address via `Reply-To`.

## Brevo setup (one-time)

1. Create a free account at <https://www.brevo.com> (300 emails/day free).
2. **Verify a sender:** dashboard → *Senders, Domains & Dedicated IPs* → add the
   address you want mail to come **from** (e.g. your Gmail) and click the confirmation
   link Brevo emails you. This becomes `MAIL_FROM_EMAIL`.
3. **Create an API key:** dashboard → *SMTP & API → API Keys* → generate. This is
   `BREVO_API_KEY` (starts with `xkeysib-`).

## Run locally

```bash
cp .env.example .env     # then edit .env with real values
npm install
npm start                # http://localhost:3000  (npm run dev for auto-reload)
```

Quick test:

```bash
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","message":"hello"}'
```

## Environment variables

| Var               | Meaning                                                                  |
|-------------------|--------------------------------------------------------------------------|
| `BREVO_API_KEY`   | Brevo API key (`xkeysib-...`).                                            |
| `MAIL_TO`         | Inbox that receives submissions.                                         |
| `MAIL_TO_NAME`    | Optional display name for the recipient.                                 |
| `MAIL_FROM_EMAIL` | Sender address — **must be a verified sender/domain in Brevo**.          |
| `MAIL_FROM_NAME`  | Sender display name (default `Portfolio Contact`).                       |
| `ALLOWED_ORIGINS` | Comma-separated sites allowed to call the API (CORS). No trailing slash. |
| `PORT`            | Local port. Managed hosts set this automatically.                        |

## Deploy (Render — free tier works now)

1. Push this repo to GitHub.
2. Render → **New → Web Service** → connect the repo.
3. Build command `npm install`, start command `npm start`.
4. Add the env vars from the table above under **Environment** (do **not** upload `.env`).
5. Deploy. You'll get a URL like `https://contact-mailer-backend.onrender.com`.
6. In the portfolio's `assets/js/index-new.js`, set `MAILER_ENDPOINT` to
   `https://<your-service>.onrender.com/send`.

> Free Render instances sleep when idle, so the first request after a quiet period
> can take a few seconds to wake.

## Security notes

- `.env` is gitignored. Keep secrets out of git.
- Rotate the API key if it is ever pasted into a chat, screenshot, or commit.
- CORS + a honeypot field + rate limiting (20 sends / IP / 15 min) are built in.
