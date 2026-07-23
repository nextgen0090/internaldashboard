/**
 * IP allowlist gate for the Internal Dashboard Worker.
 * Client IP comes from Cloudflare: CF-Connecting-IP
 * Allowlist: wrangler.toml → [vars] ALLOWED_IPS (comma-separated)
 */
export default {
  async fetch(request, env) {
    const clientIp = (request.headers.get('CF-Connecting-IP') || '').trim();
    const allowed = parseAllowlist(env.ALLOWED_IPS);

    if (!allowed.length) {
      return denyPage({
        title: 'Access locked',
        detail: 'No IPs are configured for this dashboard yet. Ask an admin to add ALLOWED_IPS and redeploy.',
        ip: clientIp || 'unknown',
      });
    }

    if (!clientIp || !isIpAllowed(clientIp, allowed)) {
      return denyPage({
        title: 'Access denied',
        detail: 'Your IP address is not on the allowlist for Game Vault Internal Dashboard.',
        ip: clientIp || 'unknown',
      });
    }

    return env.ASSETS.fetch(request);
  },
};

function parseAllowlist(raw) {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Exact match, or simple prefix like 203.0.113. (office range). */
function isIpAllowed(ip, allowed) {
  for (const entry of allowed) {
    if (entry === '*') return true;
    if (entry.endsWith('.') && ip.startsWith(entry)) return true;
    if (entry === ip) return true;
  }
  return false;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function denyPage({ title, detail, ip }) {
  const safeTitle = escapeHtml(title);
  const safeDetail = escapeHtml(detail);
  const safeIp = escapeHtml(ip);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle} · Internal Dashboard</title>
  <style>
    :root {
      --text: #f2f6fc;
      --muted: rgba(210, 222, 236, 0.78);
      --danger: #ff6b6b;
      --accent: #7ec8ff;
    }
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
      margin: 0;
    }
    body {
      min-height: 100%;
      display: grid;
      place-items: center;
      padding: 1.5rem;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 18% 22%, rgba(66, 165, 245, 0.42), transparent 34%),
        radial-gradient(circle at 82% 18%, rgba(239, 83, 80, 0.28), transparent 32%),
        radial-gradient(circle at 70% 78%, rgba(126, 87, 194, 0.35), transparent 36%),
        radial-gradient(circle at 28% 82%, rgba(38, 166, 154, 0.22), transparent 30%),
        linear-gradient(145deg, #050910 0%, #0d1624 45%, #121a2b 100%);
      background-attachment: fixed;
    }
    .card {
      width: min(440px, 100%);
      padding: 2.1rem 1.85rem 1.75rem;
      border-radius: 22px;
      text-align: center;
      background: linear-gradient(
        155deg,
        rgba(255, 255, 255, 0.16) 0%,
        rgba(255, 255, 255, 0.06) 45%,
        rgba(255, 255, 255, 0.03) 100%
      );
      border: 1px solid rgba(255, 255, 255, 0.28);
      box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.22);
      backdrop-filter: blur(22px) saturate(160%);
      -webkit-backdrop-filter: blur(22px) saturate(160%);
    }
    .icon {
      width: 68px;
      height: 68px;
      margin: 0 auto 1.2rem;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: linear-gradient(
        145deg,
        rgba(255, 107, 107, 0.35),
        rgba(255, 107, 107, 0.12)
      );
      border: 1px solid rgba(255, 140, 140, 0.45);
      box-shadow:
        0 8px 24px rgba(239, 83, 80, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.25);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      color: var(--danger);
      font-size: 1.85rem;
      font-weight: 700;
      line-height: 1;
    }
    h1 {
      margin: 0 0 0.55rem;
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      text-shadow: 0 1px 12px rgba(0, 0, 0, 0.35);
    }
    p {
      margin: 0;
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1.55;
    }
    .ip-box {
      margin-top: 1.4rem;
      padding: 0.9rem 1.05rem;
      border-radius: 14px;
      text-align: left;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .ip-box span {
      display: block;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: rgba(210, 222, 236, 0.7);
      margin-bottom: 0.35rem;
    }
    .ip-box code {
      font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
      font-size: 1.08rem;
      font-weight: 650;
      color: var(--accent);
      text-shadow: 0 0 18px rgba(126, 200, 255, 0.35);
      word-break: break-all;
    }
    .hint {
      margin-top: 1.2rem;
      font-size: 0.8rem;
      color: rgba(210, 222, 236, 0.65);
    }
  </style>
</head>
<body>
  <main class="card" role="alert">
    <div class="icon" aria-hidden="true">!</div>
    <h1>${safeTitle}</h1>
    <p>${safeDetail}</p>
    <div class="ip-box">
      <span>Your IP address</span>
      <code>${safeIp}</code>
    </div>
    <p class="hint">Contact an admin to add this IP to the allowlist.</p>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 403,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
