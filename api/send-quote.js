"use strict";

const RECIPIENT_EMAIL = ["operations@saromlogistics.ca", "containerservices.slu@gmail.com"];
const MAX_BODY_BYTES = 8192;
const MIN_FORM_SECONDS = 3;
const MAX_FORM_SECONDS = 60 * 60 * 2;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitBuckets = new Map();

const allowedServices = new Set([
  "Container Unloading",
  "Warehouse Labor Support",
  "Receiving and Staging",
  "Forklift Support"
]);

const allowedWorkTypes = new Set([
  "",
  "Urgent Same-Day",
  "Scheduled Shift",
  "Recurring Support"
]);

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function getClientIp(request) {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.socket && request.socket.remoteAddress ? request.socket.remoteAddress : "unknown";
}

function isRateLimited(ipAddress) {
  const now = Date.now();
  const existing = rateLimitBuckets.get(ipAddress) || [];
  const recentRequests = existing.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recentRequests.length >= RATE_LIMIT_MAX) {
    rateLimitBuckets.set(ipAddress, recentRequests);
    return true;
  }

  recentRequests.push(now);
  rateLimitBuckets.set(ipAddress, recentRequests);
  return false;
}

function isAllowedOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  const configuredOrigins = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!origin) {
    return true;
  }

  if (configuredOrigins.includes(origin)) {
    return true;
  }

  return host && (origin === `https://${host}` || origin === `http://${host}`);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let rawBody = "";

    request.on("data", (chunk) => {
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        reject(new Error("REQUEST_TOO_LARGE"));
        request.destroy();
        return;
      }

      rawBody += chunk;
    });

    request.on("end", () => resolve(rawBody));
    request.on("error", reject);
  });
}

function normalizeText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizePhone(value) {
  return String(value || "")
    .replace(/[^0-9+()\-\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

function normalizeEmail(value) {
  const email = normalizeText(value, 120).toLowerCase();
  const emailPattern = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  return emailPattern.test(email) ? email : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function countLinks(value) {
  const matches = String(value || "").match(/\b(?:https?:\/\/|www\.)/gi);
  return matches ? matches.length : 0;
}

function sanitizePayload(payload) {
  const startedAt = Number(payload.startedAt);
  const elapsedSeconds = Number.isFinite(startedAt) ? (Date.now() - startedAt) / 1000 : 0;
  const sanitized = {
    website: normalizeText(payload.website, 80),
    startedAt,
    elapsedSeconds,
    service: normalizeText(payload.service, 80),
    workType: normalizeText(payload.workType, 80),
    company: normalizeText(payload.company, 80),
    name: normalizeText(payload.name, 70),
    email: normalizeEmail(payload.email),
    phone: normalizePhone(payload.phone),
    city: normalizeText(payload.city, 50),
    dateNeeded: normalizeText(payload.dateNeeded, 40),
    notes: normalizeText(payload.notes, 280)
  };

  return sanitized;
}

function validatePayload(payload) {
  if (payload.website) {
    return "Unable to accept this request.";
  }

  if (payload.elapsedSeconds < MIN_FORM_SECONDS || payload.elapsedSeconds > MAX_FORM_SECONDS) {
    return "Please refresh the page and try the form again.";
  }

  if (!payload.name || !payload.email || !payload.phone || !payload.city || !payload.service) {
    return "Please enter a name, phone, valid email, city, and service needed.";
  }

  if (!allowedServices.has(payload.service) || !allowedWorkTypes.has(payload.workType)) {
    return "Please select a valid service and type of work.";
  }

  if (countLinks(payload.notes) > 1) {
    return "Please remove extra links from the details field.";
  }

  return "";
}

function buildEmail(payload, request) {
  const submittedAt = new Date().toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Edmonton"
  });

  const rows = [
    ["Service Needed", payload.service],
    ["Type of Work", payload.workType || "Not specified"],
    ["Name", payload.name],
    ["Company", payload.company || "Not provided"],
    ["Phone", payload.phone],
    ["Email", payload.email],
    ["Location / City", payload.city],
    ["Date Needed", payload.dateNeeded || "Not specified"],
    ["Additional Details", payload.notes || "Not provided"],
    ["Submitted At", submittedAt],
    ["Source", request.headers.referer || "Website quote form"]
  ];

  const text = [
    "New SLU Website Quote Request",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`)
  ].join("\n");

  const htmlRows = rows.map(([label, value]) => (
    `<tr><th align="left" style="padding:8px 12px;border-bottom:1px solid #e5e5e5;background:#f7f7f7;">${escapeHtml(label)}</th><td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;">${escapeHtml(value)}</td></tr>`
  )).join("");

  const html = `<!doctype html><html><body style="margin:0;font-family:Arial,sans-serif;color:#111;background:#fff;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;border:1px solid #dedede;"><tr><td style="padding:20px;background:#080808;color:#fff;"><h1 style="margin:0;font-size:24px;">New SLU Website Quote Request</h1></td></tr><tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${htmlRows}</table></td></tr></table></body></html>`;

  return { text, html };
}

function getSmtpConfig() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
  const requiredValues = [
    process.env.SMTP_HOST,
    process.env.SMTP_USER,
    process.env.SMTP_PASS,
    process.env.QUOTE_FROM_EMAIL
  ];

  if (requiredValues.some((value) => !value)) {
    throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  }

  return {
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  };
}

async function sendEmail(payload, request) {
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport(getSmtpConfig());
  const email = buildEmail(payload, request);

  await transporter.sendMail({
    from: process.env.QUOTE_FROM_EMAIL,
    to: RECIPIENT_EMAIL,
    replyTo: payload.email,
    subject: `SLU Quote Request - ${payload.service} - ${payload.city}`,
    text: email.text,
    html: email.html
  });
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "POST, OPTIONS");
    return sendJson(response, 204, {});
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { message: "Method not allowed." });
  }

  if (!isAllowedOrigin(request)) {
    return sendJson(response, 403, { message: "Request origin is not allowed." });
  }

  if (!String(request.headers["content-type"] || "").includes("application/json")) {
    return sendJson(response, 415, { message: "Unsupported request format." });
  }

  if (isRateLimited(getClientIp(request))) {
    return sendJson(response, 429, { message: "Too many quote requests. Please try again later." });
  }

  try {
    const rawBody = typeof request.body === "string"
      ? request.body
      : request.body && typeof request.body === "object"
        ? JSON.stringify(request.body)
        : await readBody(request);
    const parsedBody = JSON.parse(rawBody || "{}");
    const payload = sanitizePayload(parsedBody);
    const validationMessage = validatePayload(payload);

    if (validationMessage) {
      return sendJson(response, 400, { message: validationMessage });
    }

    await sendEmail(payload, request);
    return sendJson(response, 200, { message: "Quote request sent." });
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") {
      return sendJson(response, 413, { message: "Request is too large." });
    }

    if (error instanceof SyntaxError) {
      return sendJson(response, 400, { message: "Invalid request body." });
    }

    return sendJson(response, 500, { message: "Email service is unavailable. Please call +1 (587) 647-4000." });
  }
};
