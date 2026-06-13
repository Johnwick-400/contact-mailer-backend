require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const {
  BREVO_API_KEY,
  MAIL_TO,
  MAIL_TO_NAME = '',
  MAIL_FROM_EMAIL,
  MAIL_FROM_NAME = 'Portfolio Contact',
  ALLOWED_ORIGINS = '',
  PORT = 3000,
} = process.env;

if (!BREVO_API_KEY || !MAIL_TO || !MAIL_FROM_EMAIL) {
  console.error('Missing BREVO_API_KEY / MAIL_TO / MAIL_FROM_EMAIL. Set them in .env (local) or your host\'s env vars.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // correct client IPs behind Render's proxy
app.use(express.json({ limit: '10kb' }));

// Only let the browsers we trust call this API.
const allowList = ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / curl / server-to-server (no Origin header) and any allow-listed site.
      if (!origin || allowList.includes(origin)) return cb(null, true);
      return cb(new Error('Origin not allowed'));
    },
    methods: ['POST', 'GET'],
  })
);

// Throttle abuse: 20 sends per IP per 15 minutes.
const sendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many messages. Please try again later.' },
});

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const esc = (v = '') =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Send through Brevo's transactional email API (HTTPS / port 443) — works on
// hosts like Render free that block outbound SMTP.
async function sendEmail({ replyToEmail, replyToName, subject, text, html }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: MAIL_FROM_NAME, email: MAIL_FROM_EMAIL },
        to: [{ email: MAIL_TO, name: MAIL_TO_NAME || undefined }],
        replyTo: { email: replyToEmail, name: replyToName },
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: controller.signal,
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      throw new Error(`Brevo responded ${r.status}: ${detail}`);
    }
    return r.json();
  } finally {
    clearTimeout(timer);
  }
}

app.get('/', (_req, res) => res.json({ ok: true, service: 'contact-mailer' }));

app.post('/send', sendLimiter, async (req, res) => {
  const { name, email, company, service, message, tel } = req.body || {};

  // Honeypot: real users never see/fill the "tel" field. Bots do — pretend success and drop it.
  if (tel) return res.json({ ok: true });

  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: 'Name, email and message are required.' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
  }

  try {
    await sendEmail({
      replyToEmail: email,
      replyToName: name,
      subject: `New portfolio message from ${name}`,
      text:
        `Name: ${name}\n` +
        `Email: ${email}\n` +
        `Company: ${company || '-'}\n` +
        `Service: ${service || '-'}\n\n` +
        `${message}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto">
          <h2 style="margin:0 0 16px">New portfolio message</h2>
          <p><strong>Name:</strong> ${esc(name)}</p>
          <p><strong>Email:</strong> ${esc(email)}</p>
          <p><strong>Company:</strong> ${esc(company) || '-'}</p>
          <p><strong>Service:</strong> ${esc(service) || '-'}</p>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:16px 0">
          <p style="white-space:pre-wrap">${esc(message)}</p>
        </div>
      `,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('send failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not send right now. Please try again later.' });
  }
});

app.listen(PORT, () => console.log(`contact-mailer listening on port ${PORT}`));
