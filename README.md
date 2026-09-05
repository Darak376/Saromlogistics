# SLU Website

Static website for Sarom Logistics and Unloading Ltd. with a secure Vercel quote request endpoint.

## Secure Quote Email Setup

The quote form posts to `/api/send-quote`. Vercel deploys that file as a serverless function. The function sends cleanly formatted email to `jarnu.girdhar@gmail.com` over SMTP without exposing credentials in browser code.

Required hosting environment variables:

- `SMTP_HOST`: SMTP host from your mail provider.
- `SMTP_PORT`: usually `587` for STARTTLS or `465` for SSL.
- `SMTP_SECURE`: `true` for port `465`, otherwise `false`.
- `SMTP_USER`: SMTP username.
- `SMTP_PASS`: SMTP password or app password.
- `QUOTE_FROM_EMAIL`: verified sender identity, for example `SLU Website <quotes@your-domain.com>`.
- `ALLOWED_ORIGINS`: comma-separated production origins allowed to submit the form.

Local test:

```bash
npm install
cp .env.example .env.local
npx vercel dev --listen 3000
```

Security safeguards include strict JSON-only POST requests, same-origin/origin allow-list checks, payload size limits, honeypot spam trap, submit timing validation, IP rate limiting, field allow-lists, server-side sanitization, email validation, link-count checks, escaped HTML output, and no frontend secrets.
