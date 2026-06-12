require('dotenv').config();

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

const {
  EMAIL_USER,
  EMAIL_PASS,
  MAIL_TO,
  ALLOWED_ORIGINS = '',
  PORT = 3000,
} = process.env;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.error('Missing EMAIL_USER / EMAIL_PASS. Set them in .env (local) or your host\'s env vars.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // needed for correct client IPs behind Render/Railway proxies
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

// Gmail app passwords are shown as four space-separated groups; the spaces are cosmetic.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS.replace(/\s+/g, '') },
});

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const esc = (v = '') =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    await transporter.sendMail({
      from: `"Portfolio Contact" <${EMAIL_USER}>`,
      to: MAIL_TO || EMAIL_USER,
      replyTo: `"${name}" <${email}>`,
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
    console.error('sendMail failed:', err.message);
    return res.status(500).json({ ok: false, error: 'Could not send right now. Please try again later.' });
  }
});

app.listen(PORT, () => console.log(`contact-mailer listening on port ${PORT}`));
