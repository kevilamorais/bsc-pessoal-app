import test from 'node:test';
import assert from 'node:assert/strict';
import { accessConfig, identityFromRequest, verifyAccessToken, authenticate } from '../src/auth.js';
import { createTestDB } from './d1-adapter.js';

const issuer = 'https://test-bsc.cloudflareaccess.com';
const audience = 'a'.repeat(64);
const config = { issuer, audience };
const b64 = bytes => Buffer.from(bytes).toString('base64url');
const keys = await crypto.subtle.generateKey({
  name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'
}, true, ['sign', 'verify']);
const publicKey = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const now = 1800000000;
const validClaims = { iss: issuer, aud: [audience], sub: 'user-subject', email: 'pessoa@example.com', type: 'app', iat: now - 30, exp: now + 600 };
const fetcher = async url => {
  assert.equal(url, `${issuer}/cdn-cgi/access/certs`);
  return Response.json({ keys: [publicKey] });
};
async function token(claims = {}, header = {}) {
  const input = `${b64(JSON.stringify({ alg: 'RS256', kid: 'test-key', ...header }))}.${b64(JSON.stringify({ ...validClaims, ...claims }))}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(input));
  return `${input}.${b64(signature)}`;
}

test('Access aceita somente assinatura, emissor e audiência esperados', async () => {
  const claims = await verifyAccessToken(await token(), config, { fetcher, now });
  assert.equal(claims.sub, 'user-subject');
  const failures = [
    [{ iss: 'https://other.cloudflareaccess.com' }], [{ aud: ['outro'] }],
    [{ exp: now - 61 }], [{ nbf: now + 61 }], [{ iat: now + 61 }],
    [{ sub: '' }], [{ type: 'org' }], [{ email: '' }],
    [{}, { alg: 'HS256' }], [{}, { crit: ['custom'] }]
  ];
  for (const [claims, header] of failures) {
    await assert.rejects(verifyAccessToken(await token(claims, header), config, { fetcher, now }), err => err.status === 401);
  }
  const original = await token();
  const broken = `${original.slice(0, original.lastIndexOf('.') + 1)}${b64(new Uint8Array(256))}`;
  await assert.rejects(verifyAccessToken(broken, config, { fetcher, now }), err => err.status === 401);
});

test('configuração de Access rejeita placeholder e host não confiável', () => {
  assert.throws(() => accessConfig({ ACCESS_TEAM_DOMAIN: 'https://localhost', ACCESS_AUD: audience }));
  assert.throws(() => accessConfig({ ACCESS_TEAM_DOMAIN: 'https://SUA-EQUIPE.cloudflareaccess.com', ACCESS_AUD: audience }));
  assert.throws(() => accessConfig({ ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: 'COLE_O_AUD_DA_APLICACAO' }));
  assert.deepEqual(accessConfig({ ACCESS_TEAM_DOMAIN: `${issuer}/`, ACCESS_AUD: audience }), config);
});

test('modo local funciona apenas em localhost e ignora identidade enviada pelo cliente', async () => {
  const env = { AUTH_MODE: 'local', LOCAL_USER_EMAIL: 'local@example.test' };
  const request = new Request('http://127.0.0.1:8787/api/bootstrap', { headers: { 'X-User-Id': 'outra-pessoa' } });
  const identity = await identityFromRequest(request, env);
  assert.equal(identity.subject, 'local@example.test');
  await assert.rejects(identityFromRequest(new Request('https://bsc.example.workers.dev/api/bootstrap'), env), err => err.code === 'LOCAL_AUTH_FORBIDDEN');
  await assert.rejects(identityFromRequest(new Request('https://bsc.example.workers.dev/api/bootstrap'), {
    AUTH_MODE: 'access', ACCESS_TEAM_DOMAIN: issuer, ACCESS_AUD: audience
  }), err => err.code === 'AUTH_REQUIRED');
});

test('identidade persistida mantém o mesmo usuário e preserva nome editado', async () => {
  const DB = createTestDB();
  try {
    const env = { DB, AUTH_MODE: 'local', LOCAL_USER_EMAIL: 'local@example.test', LOCAL_USER_NAME: 'Nome inicial' };
    const request = new Request('http://127.0.0.1/api/bootstrap');
    const first = await authenticate(request, env);
    DB.sqlite.prepare('UPDATE usuarios SET nome = ? WHERE id = ?').run('Nome escolhido', first.user.id);
    const second = await authenticate(request, env);
    assert.equal(second.user.id, first.user.id);
    assert.equal(second.user.nome, 'Nome escolhido');
    assert.equal(DB.sqlite.prepare('SELECT count(*) AS n FROM usuarios').get().n, 1);
  } finally { DB.close(); }
});
