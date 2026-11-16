/** Cloudflare Access: validacao RS256 sem dependencias de runtime. */
const keysCache = new Map();
const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const CLOCK_TOLERANCE = 30;

export class AuthError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function invalid() {
  return new AuthError(401, 'AUTH_INVALID', 'Sua sessão expirou ou não é válida. Entre novamente.');
}

function bytes(part) {
  if (typeof part !== 'string' || !/^[A-Za-z0-9_-]+$/.test(part)) throw invalid();
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)), c => c.charCodeAt(0));
  } catch { throw invalid(); }
}

function jsonPart(part) {
  try {
    const value = JSON.parse(decoder.decode(bytes(part)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    return value;
  } catch { throw invalid(); }
}

export function accessConfig(env) {
  const raw = String(env.ACCESS_TEAM_DOMAIN || '').trim();
  const audience = String(env.ACCESS_AUD || '').trim();
  let url;
  try { url = new URL(raw); } catch { /* erro de configuracao abaixo */ }
  if (!url || url.protocol !== 'https:' || url.port || url.username || url.password ||
      !/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(url.hostname) ||
      !['', '/'].includes(url.pathname) || url.search || url.hash ||
      /sua-equipe/i.test(raw) || audience.length < 16 || /COLE_|PLACEHOLDER/i.test(audience)) {
    throw new AuthError(503, 'AUTH_NOT_CONFIGURED',
      'O acesso ainda não foi configurado. Siga a etapa de login nas instruções do projeto.');
  }
  return { issuer: url.origin, audience };
}

async function fetchKeys(issuer, fetcher, force = false) {
  const now = Date.now();
  const previous = keysCache.get(issuer);
  if (previous?.promise) return previous.promise;
  if (previous?.keys && now < previous.expires && (!force || now - previous.loaded < 60000)) {
    return previous.keys;
  }
  const promise = (async () => {
    let response;
    try {
      response = await fetcher(`${issuer}/cdn-cgi/access/certs`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        redirect: 'error'
      });
      if (!response.ok) throw new Error('JWKS unavailable');
      const data = await response.json();
      if (!Array.isArray(data.keys) || data.keys.length < 1 || data.keys.length > 50) {
        throw new Error('Invalid JWKS');
      }
      keysCache.set(issuer, { keys: data.keys, expires: now + 300000, loaded: now });
      return data.keys;
    } catch {
      keysCache.delete(issuer);
      throw new AuthError(503, 'AUTH_UNAVAILABLE', 'O serviço de acesso está indisponível. Tente novamente em instantes.');
    }
  })();
  keysCache.set(issuer, { ...previous, promise });
  return promise;
}

/** fetcher/now sao injetaveis para testar assinatura/expiracao sem acessar servicos externos. */
export async function verifyAccessToken(token, config, { fetcher = fetch, now = Math.floor(Date.now() / 1000) } = {}) {
  if (typeof token !== 'string' || token.length > 16384) throw invalid();
  const parts = token.split('.');
  if (parts.length !== 3) throw invalid();
  const header = jsonPart(parts[0]);
  const claims = jsonPart(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid || header.kid.length > 256 ||
      header.crit !== undefined || header.b64 !== undefined) throw invalid();
  const audiences = typeof claims.aud === 'string' ? [claims.aud] : claims.aud;
  if (claims.iss !== config.issuer || !Array.isArray(audiences) || !audiences.includes(config.audience) ||
      !Number.isFinite(claims.exp) || claims.exp <= now - CLOCK_TOLERANCE ||
      (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + CLOCK_TOLERANCE)) ||
      (claims.iat !== undefined && (!Number.isFinite(claims.iat) || claims.iat > now + CLOCK_TOLERANCE)) ||
      claims.type !== 'app' || typeof claims.sub !== 'string' || !claims.sub.trim() || claims.sub.length > 512 ||
      typeof claims.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) || claims.email.length > 320) {
    throw invalid();
  }
  let keys = await fetchKeys(config.issuer, fetcher);
  const matches = k => k.kid === header.kid && k.kty === 'RSA' &&
    (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig');
  let jwk = keys.find(matches);
  if (!jwk) {
    keys = await fetchKeys(config.issuer, fetcher, true);
    jwk = keys.find(matches);
  }
  if (!jwk) throw invalid();
  let verified = false;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`));
  } catch { throw invalid(); }
  if (!verified) throw invalid();
  return claims;
}

export async function identityFromRequest(request, env, options = {}) {
  const mode = env.AUTH_MODE || 'access';
  if (mode === 'local') {
    const host = new URL(request.url).hostname;
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) {
      throw new AuthError(403, 'LOCAL_AUTH_FORBIDDEN', 'O modo de desenvolvimento só funciona em localhost.');
    }
    const email = String(env.LOCAL_USER_EMAIL || 'voce@example.test').trim().toLowerCase();
    return {
      mode: 'local', provider: 'local', subject: email, email,
      name: String(env.LOCAL_USER_NAME || 'Você').slice(0, 120)
    };
  }
  if (mode !== 'access') throw new AuthError(503, 'AUTH_NOT_CONFIGURED', 'Modo de acesso inválido.');
  const config = accessConfig(env);
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new AuthError(401, 'AUTH_REQUIRED', 'Entre pelo endereço protegido do aplicativo para continuar.');
  const claims = await verifyAccessToken(token, config, options);
  return {
    mode: 'access', provider: `cloudflare-access:${new URL(config.issuer).hostname}`,
    subject: claims.sub, email: claims.email.toLowerCase(),
    name: (typeof claims.name === 'string' && claims.name.trim() ? claims.name : claims.email.split('@')[0]).slice(0, 120)
  };
}

export async function authenticate(request, env) {
  const identity = await identityFromRequest(request, env);
  if (!env.DB?.prepare) throw new AuthError(503, 'DATABASE_NOT_CONFIGURED', 'A conexão com o banco ainda não foi configurada.');
  let user = await env.DB.prepare(
    'SELECT id, nome, email, fuso_horario FROM usuarios WHERE provedor_auth = ? AND sujeito_auth = ?'
  ).bind(identity.provider, identity.subject).first();
  if (!user) {
    await env.DB.prepare(
      'INSERT INTO usuarios (id, provedor_auth, sujeito_auth, nome, email) VALUES (?, ?, ?, ?, ?) ON CONFLICT (provedor_auth, sujeito_auth) DO NOTHING'
    ).bind(crypto.randomUUID(), identity.provider, identity.subject, identity.name, identity.email).run();
    user = await env.DB.prepare(
      'SELECT id, nome, email, fuso_horario FROM usuarios WHERE provedor_auth = ? AND sujeito_auth = ?'
    ).bind(identity.provider, identity.subject).first();
  } else if (user.email !== identity.email) {
    await env.DB.prepare('UPDATE usuarios SET email = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(identity.email, user.id).run();
    user.email = identity.email;
  }
  if (!user) throw new AuthError(503, 'USER_UNAVAILABLE', 'Não foi possível carregar sua conta. Tente novamente.');
  return { user, mode: identity.mode };
}
