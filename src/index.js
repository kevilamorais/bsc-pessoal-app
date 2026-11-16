import { authenticate } from './auth.js';
import { handleApi } from './api.js';

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:", "font-src 'self'", "connect-src 'self'",
  "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"
].join('; ');

function secure(response, isApi) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isApi) headers.set('Cache-Control', 'private, no-store');
  else if ((headers.get('Content-Type') || '').includes('text/html')) headers.set('Cache-Control', 'no-cache');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function error(status, code, message) {
  return Response.json({ error: message, code }, { status });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
    try {
      if (!isApi) {
        if (!['GET', 'HEAD'].includes(request.method)) {
          return secure(error(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.'), false);
        }
        if (!env.ASSETS?.fetch) return secure(error(503, 'ASSETS_MISSING', 'A interface ainda não está disponível.'), false);
        return secure(await env.ASSETS.fetch(request), false);
      }
      if (url.pathname === '/api/health' && request.method === 'GET') {
        return secure(Response.json({ ok: true, service: 'bsc-pessoal' }), true);
      }
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
        return secure(error(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.'), true);
      }
      if (['POST', 'PATCH', 'DELETE'].includes(request.method)) {
        if (request.headers.get('Origin') !== url.origin ||
            request.headers.get('Sec-Fetch-Site') === 'cross-site') {
          return secure(error(403, 'ORIGIN_FORBIDDEN', 'A alteração deve ser feita pelo próprio aplicativo.'), true);
        }
        if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
          return secure(error(415, 'JSON_REQUIRED', 'Envie os dados no formato JSON.'), true);
        }
      }
      const { user, mode } = await authenticate(request, env);
      const response = await handleApi(request, env, user, mode);
      return secure(response || error(404, 'NOT_FOUND', 'Recurso não encontrado.'), true);
    } catch (cause) {
      let status = Number.isInteger(cause?.status) ? cause.status : 500;
      let code = cause?.code || 'INTERNAL_ERROR';
      let message = status < 500 ? cause.message : 'Não foi possível concluir a operação. Tente novamente.';
      if (cause?.code && status === 503) message = cause.message;
      if (/no such table|no such column/.test(String(cause?.message))) {
        status = 503; code = 'DATABASE_NOT_READY';
        message = 'O banco precisa receber o script inicial do projeto antes do primeiro uso.';
      }
      // Nao registrar JWT, e-mail, SQL parametrizado ou conteudo pessoal nos logs.
      if (status >= 500) console.error(JSON.stringify({ status, code }));
      return secure(error(status, code, message), isApi);
    }
  }
};
