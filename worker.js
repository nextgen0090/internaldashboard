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
      return deny(
        'Access locked: no IPs configured.\n' +
          'Add your IP to ALLOWED_IPS in wrangler.toml and redeploy.\n' +
          'Your IP: ' + (clientIp || '(unknown)')
      );
    }

    if (!clientIp || !isIpAllowed(clientIp, allowed)) {
      return deny(
        'Access denied.\n' +
          'Your IP is not on the allowlist.\n' +
          'Your IP: ' + (clientIp || '(unknown)')
      );
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
    if (entry === '*' ) return true;
    if (entry.endsWith('.') && ip.startsWith(entry)) return true;
    if (entry === ip) return true;
  }
  return false;
}

function deny(message) {
  return new Response(message, {
    status: 403,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
