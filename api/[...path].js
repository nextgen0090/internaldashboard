const BACKEND = (process.env.BACKEND_URL || 'https://gamevault222.com').replace(/\/$/, '');

function targetUrl(req) {
  const parts = req.query.path;
  const suffix = Array.isArray(parts) ? parts.join('/') : parts || '';
  const qIndex = req.url.indexOf('?');
  const qs = qIndex >= 0 ? req.url.slice(qIndex) : '';
  return `${BACKEND}/api/${suffix}${qs}`;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Accept, Content-Type, If-None-Match, If-Modified-Since'
    );
    res.setHeader('Access-Control-Expose-Headers', 'ETag, Last-Modified');
    res.status(204).end();
    return;
  }

  const url = targetUrl(req);
  const headers = {
    Accept: req.headers.accept || 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  if (req.headers['if-none-match']) headers['If-None-Match'] = req.headers['if-none-match'];
  if (req.headers['if-modified-since']) headers['If-Modified-Since'] = req.headers['if-modified-since'];

  try {
    const init = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body != null) {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const upstream = await fetch(url, init);
    const body = Buffer.from(await upstream.arrayBuffer());

    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    const etag = upstream.headers.get('etag');
    if (etag) res.setHeader('ETag', etag);
    const lastModified = upstream.headers.get('last-modified');
    if (lastModified) res.setHeader('Last-Modified', lastModified);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'ETag, Last-Modified');
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  } catch (err) {
    res.status(502).json({
      success: false,
      message: `Proxy error: ${err && err.message ? err.message : String(err)}`,
    });
  }
};
