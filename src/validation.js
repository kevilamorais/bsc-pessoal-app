export class HttpError extends Error {
  constructor(status, message, code = 'invalid_request', details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(error) {
  if (error instanceof HttpError) {
    return jsonResponse({ error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) }, error.status);
  }
  const message = String(error?.message || '');
  if (/Meta com resultado registrado/i.test(message)) {
    return jsonResponse({ error: 'Esta meta já tem um resultado. Preserve o histórico e crie a meta de outro período.', code: 'historical_target' }, 409);
  }
  if (/UNIQUE constraint failed/i.test(message)) {
    return jsonResponse({ error: 'Já existe um registro com esses dados. Edite o registro existente ou use outro código/período.', code: 'duplicate_record' }, 409);
  }
  if (/FOREIGN KEY constraint failed/i.test(message)) {
    return jsonResponse({ error: 'O registro possui vínculos com outros dados. Confira os relacionamentos; para excluir, remova ou desvincule os dependentes primeiro.', code: 'linked_records' }, 409);
  }
  if (/CHECK constraint failed|NOT NULL constraint failed|datatype mismatch/i.test(message)) {
    return jsonResponse({ error: 'Um valor não atende às regras do banco. Confira os campos, tipos, datas e limites informados.', code: 'invalid_data' }, 422);
  }
  if (/no such table|no such column/i.test(message)) {
    return jsonResponse({ error: 'O banco ainda não possui a estrutura esperada. Aplique a migração SQL do projeto antes de usar o aplicativo.', code: 'database_not_initialized' }, 503);
  }
  // Do not log SQL, form contents, financial entries or personal notes.
  console.error('BSC API: falha interna', { name: error?.name || 'Error', code: error?.code || 'internal_error' });
  return jsonResponse({ error: 'Não foi possível concluir a operação. Tente novamente e consulte os logs do Worker se o problema continuar.', code: 'internal_error' }, 500);
}

export async function readJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'Envie o conteúdo como application/json.', 'unsupported_media_type');
  }
  const MAX_BYTES = 65536;
  const announced = Number(request.headers.get('content-length'));
  if (announced > MAX_BYTES) throw new HttpError(413, 'O formulário excede o limite de 64 KB.', 'body_too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'O formulário está vazio.', 'invalid_json');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new HttpError(413, 'O formulário excede o limite de 64 KB.', 'body_too_large');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  let data;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new HttpError(400, 'O formulário contém JSON inválido.', 'invalid_json'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpError(400, 'O formulário deve ser um objeto JSON.', 'invalid_json');
  }
  assertSafeObject(data);
  return data;
}

function assertSafeObject(value, depth = 0) {
  if (depth > 20) throw new HttpError(422, 'O JSON contém níveis demais de aninhamento.', 'invalid_json');
  if (value === null || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) {
      throw new HttpError(400, 'O JSON contém uma chave não permitida.', 'invalid_json');
    }
    assertSafeObject(value[key], depth + 1);
  }
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) {
    throw new HttpError(400, 'Identificador inválido.', 'invalid_id');
  }
  return value;
}

function invalid(field, message) {
  throw new HttpError(422, `${field}: ${message}`, 'invalid_field', { field });
}

export function sanitizeField(field, value, rule) {
  if (value === undefined) return undefined;
  if (value === null || (value === '' && !['text', 'json'].includes(rule.type))) {
    if (rule.required) invalid(field, 'preenchimento obrigatório.');
    return null;
  }
  if (rule.type === 'text') {
    if (typeof value !== 'string') invalid(field, 'informe um texto.');
    value = value.trim();
    if (!value && rule.required) invalid(field, 'preenchimento obrigatório.');
    if (value.length > rule.max) invalid(field, `use até ${rule.max} caracteres.`);
    return value || null;
  }
  if (rule.type === 'integer') {
    if (!Number.isSafeInteger(value) || value < rule.min || value > rule.max) invalid(field, `informe um inteiro entre ${rule.min} e ${rule.max}.`);
    return value;
  }
  if (rule.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) invalid(field, 'informe um número finito dentro da precisão suportada.');
    return value;
  }
  if (rule.type === 'enum') {
    if (!rule.values.includes(value)) invalid(field, 'opção inválida.');
    return value;
  }
  if (rule.type === 'reference') {
    try { return validId(value); }
    catch { invalid(field, 'identificador de relacionamento inválido.'); }
  }
  if (rule.type === 'date') {
    if (!isValidDate(value)) invalid(field, 'informe uma data existente no formato AAAA-MM-DD.');
    return value;
  }
  if (rule.type === 'time') {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) invalid(field, 'informe um horário no formato HH:MM.');
    return value;
  }
  if (rule.type === 'color') {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) invalid(field, 'use uma cor hexadecimal, como #0F766E.');
    return value;
  }
  if (rule.type === 'timezone') {
    if (typeof value !== 'string' || value.length > 80) invalid(field, 'fuso horário inválido.');
    try { new Intl.DateTimeFormat('pt-BR', { timeZone: value }).format(); }
    catch { invalid(field, 'fuso horário inválido.'); }
    return value;
  }
  if (rule.type === 'json') {
    let parsed = value;
    if (typeof value === 'string') {
      if (value.length > rule.max) invalid(field, `use até ${rule.max} caracteres.`);
      try { parsed = JSON.parse(value); } catch { invalid(field, 'JSON inválido.'); }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid(field, 'informe um objeto JSON.');
    assertSafeObject(parsed);
    const serialized = JSON.stringify(parsed);
    if (serialized.length > rule.max) invalid(field, `use até ${rule.max} caracteres.`);
    return serialized;
  }
  throw new Error(`Unknown validation rule: ${rule.type}`);
}

export function sanitizeFields(body, fields, { required = false } = {}) {
  const result = {};
  for (const key of Object.keys(body)) {
    if (!Object.hasOwn(fields, key)) throw new HttpError(400, `O campo ${key} não pode ser alterado nesta operação.`, 'unknown_field', { field: key });
    result[key] = sanitizeField(key, body[key], fields[key]);
  }
  if (required) {
    for (const [key, rule] of Object.entries(fields)) {
      if (rule.required && (result[key] === null || result[key] === undefined || result[key] === '')) invalid(key, 'preenchimento obrigatório.');
    }
  }
  return result;
}

export function checkDateOrder(start, end, label = 'período') {
  if (start && end && end < start) throw new HttpError(422, `O fim de ${label} não pode ser anterior ao início.`, 'invalid_period');
}

function dateText(value) { return value.toISOString().slice(0, 10); }

export function assertCanonicalPeriod(start, end, frequency) {
  checkDateOrder(start, end);
  const first = new Date(`${start}T00:00:00Z`);
  let expectedEnd = null;
  let validStart = true;
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const day = first.getUTCDate();
  if (frequency === 'diaria') expectedEnd = start;
  if (frequency === 'semanal') {
    validStart = first.getUTCDay() === 1;
    const last = new Date(first); last.setUTCDate(day + 6); expectedEnd = dateText(last);
  }
  if (frequency === 'mensal') {
    validStart = day === 1; expectedEnd = dateText(new Date(Date.UTC(year, month + 1, 0)));
  }
  if (frequency === 'trimestral') {
    validStart = day === 1 && month % 3 === 0; expectedEnd = dateText(new Date(Date.UTC(year, month + 3, 0)));
  }
  if (frequency === 'semestral') {
    validStart = day === 1 && month % 6 === 0; expectedEnd = dateText(new Date(Date.UTC(year, month + 6, 0)));
  }
  if (frequency === 'anual') {
    validStart = day === 1 && month === 0; expectedEnd = `${String(year).padStart(4, '0')}-12-31`;
  }
  if (!validStart || (expectedEnd && end !== expectedEnd)) {
    const hints = {
      diaria: 'use a mesma data no início e no fim', semanal: 'use uma semana completa, de segunda a domingo',
      mensal: 'use o primeiro e o último dia do mês', trimestral: 'use um trimestre civil completo (jan–mar, abr–jun, jul–set ou out–dez)',
      semestral: 'use um semestre completo (jan–jun ou jul–dez)', anual: 'use 1º de janeiro a 31 de dezembro',
    };
    throw new HttpError(422, `Para a frequência ${frequency}, ${hints[frequency]}.`, 'invalid_period');
  }
}
