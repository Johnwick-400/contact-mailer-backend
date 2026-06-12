# contact-mailer-backend

Tiny Express + Nodemailer service that delivers portfolio contact-form submissions
through Gmail SMTP. **Credentials live only in environment variables** (`.env` locally,
host env vars in production) — they are never committed and never reach the browser.

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

| Var               | Meaning                                                                 |
|-------------------|-------------------------------------------------------------------------|
| `EMAIL_USER`      | Gmail account used for SMTP auth (the sender).                          |
| `EMAIL_PASS`      | Gmail **App Password** (not your normal password). Spaces are stripped. |
| `MAIL_TO`         | Inbox that receives submissions.                                        |
| `ALLOWED_ORIGINS` | Comma-separated sites allowed to call the API (CORS). No trailing slash.|
| `PORT`            | Local port. Managed hosts set this automatically.                       |

Generate an App Password: enable 2-Step Verification, then
<https://myaccount.google.com/apppasswords>.

## Deploy (Render — free tier)

1. Push this repo to GitHub.
2. Render → **New → Web Service** → connect the repo.
3. Build command `npm install`, start command `npm start`.
4. Add the env vars from the table above under **Environment** (do **not** upload `.env`).
5. Deploy. You'll get a URL like `https://contact-mailer-backend.onrender.com`.
6. In the portfolio's `assets/js/index-new.js`, set `MAILER_ENDPOINT` to
   `https://<your-service>.onrender.com/send`.

Railway/Fly.io/any Node host work the same way: set the env vars in the dashboard.

> Free Render instances sleep when idle, so the first request after a quiet period
> can take a few seconds to wake.

## Security notes

- `.env` is gitignored. Keep secrets out of git.
- Rotate the App Password if it is ever pasted into a chat, screenshot, or commit.
- CORS + a honeypot field + rate limiting (20 sends / IP / 15 min) are built in.
