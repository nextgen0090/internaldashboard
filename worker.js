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
      --bg0: #070b12;
      --bg1: #101826;
      --card: rgba(18, 28, 42, 0.92);
      --border: rgba(120, 144, 168, 0.28);
      --text: #e8eef7;
      --muted: #9aabbd;
      --danger: #ef5350;
      --danger-soft: rgba(239, 83, 80, 0.14);
      --accent: #42a5f5;
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
        radial-gradient(ellipse 70% 50% at 50% -10%, rgba(66, 165, 245, 0.16), transparent 55%),
        radial-gradient(ellipse 50% 40% at 80% 100%, rgba(239, 83, 80, 0.1), transparent 50%),
        linear-gradient(160deg, var(--bg0), var(--bg1));
    }
    .card {
      width: min(440px, 100%);
      padding: 2rem 1.75rem 1.65rem;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: var(--card);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      text-align: center;
    }
    .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.15rem;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--danger-soft);
      border: 1px solid rgba(239, 83, 80, 0.35);
      color: var(--danger);
      font-size: 1.75rem;
      font-weight: 700;
      line-height: 1;
    }
    h1 {
      margin: 0 0 0.55rem;
      font-size: 1.45rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    p {
      margin: 0;
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1.55;
    }
    .ip-box {
      margin-top: 1.35rem;
      padding: 0.85rem 1rem;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: rgba(0, 0, 0, 0.28);
      text-align: left;
    }
    .ip-box span {
      display: block;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 0.35rem;
    }
    .ip-box code {
      font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--accent);
      word-break: break-all;
    }
    .hint {
      margin-top: 1.15rem;
      font-size: 0.8rem;
      color: var(--muted);
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
