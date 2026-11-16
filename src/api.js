import { RESOURCES, PLAN_FIELDS, PROFILE_FIELDS } from './resources.js';
import {
  HttpError, jsonResponse, errorResponse, readJson, validId,
  sanitizeFields, checkDateOrder, assertCanonicalPeriod, isValidDate,
} from './validation.js';

const DEFAULT_TEMPLATE = 'bsc_pessoal_2027_2036_v1';
const SNAPSHOT_LIMIT = 5000;
const MAX_BINDINGS = 100;
const RESOURCE_NAMES = Object.keys(RESOURCES);

function pick(object, names) {
  return Object.fromEntries(names.filter(key => object[key] !== undefined).map(key => [key, object[key]]));
}

function changes(result) { return Number(result?.meta?.changes || 0); }

function checkMethod(request, allowed) {
  if (!allowed.includes(request.method)) throw new HttpError(405, 'Método não permitido.', 'method_not_allowed');
}

async function ownedPlan(db, userId, id) {
  validId(id);
  const row = await db.prepare('SELECT * FROM planos WHERE id = ? AND usuario_id = ?').bind(id, userId).first();
  if (!row) throw new HttpError(404, 'Plano não encontrado.', 'not_found');
  return row;
}

async function recordInPlan(db, resource, planId, id) {
  validId(id);
  const row = await db.prepare(`SELECT * FROM ${resource} WHERE plano_id = ? AND id = ?`).bind(planId, id).first();
  if (!row) throw new HttpError(404, 'Registro não encontrado neste plano.', 'not_found');
  return row;
}

async function referencesInPlan(db, definition, data, planId) {
  const fields = Object.entries(definition.fields).filter(([key, rule]) => rule.type === 'reference' && data[key] !== null && data[key] !== undefined);
  if (!fields.length) return {};
  const results = await db.batch(fields.map(([key, rule]) =>
    db.prepare(`SELECT * FROM ${rule.table} WHERE plano_id = ? AND id = ?`).bind(planId, data[key])
  ));
  const found = {};
  fields.forEach(([key], index) => {
    const row = results[index].results?.[0];
    if (!row) throw new HttpError(422, 'Um relacionamento escolhido não pertence a este plano ou foi removido.', 'invalid_reference', { field: key });
    found[key] = row;
  });
  return found;
}

function assertTarget(data) {
  const { regra: rule, tipo_valor: type, valor_minimo: lo, valor_maximo: hi } = data;
  let valid = false;
  if (rule === 'acompanhar') valid = lo == null && hi == null;
  if (rule === 'avaliar') valid = type === 'texto' && lo == null && hi == null;
  if (rule === 'minimo') valid = type === 'numero' && lo != null && hi == null;
  if (rule === 'maximo') valid = type === 'numero' && lo == null && hi != null;
  if (rule === 'faixa') valid = type === 'numero' && lo != null && hi != null && lo <= hi;
  if (rule === 'igual') valid = lo != null && hi == null && (type === 'numero' || (type === 'booleano' && [0, 1].includes(lo)));
  if (!valid) throw new HttpError(422, 'A regra da meta não combina com o tipo ou com os limites. Use mínimo, máximo ou faixa para números; avaliar para texto; igual a 0/1 para sim ou não. Acompanhamento não utiliza limites.', 'invalid_target');
}

function assertResult(data, meta) {
  const type = meta.tipo_valor;
  if (data.tipo_valor && data.tipo_valor !== type) throw new HttpError(422, 'O tipo do resultado precisa ser igual ao tipo da meta.', 'invalid_result');
  data.tipo_valor = type;
  if (type === 'texto') {
    if (!data.valor_texto?.trim() || data.valor_numerico != null) throw new HttpError(422, 'Preencha a avaliação textual e deixe o valor numérico vazio.', 'invalid_result');
  } else {
    if (typeof data.valor_numerico !== 'number' || !Number.isFinite(data.valor_numerico) || data.valor_texto != null || data.atingiu_meta_manual != null) {
      throw new HttpError(422, 'Preencha o valor numérico; texto e avaliação manual devem ficar vazios para este indicador.', 'invalid_result');
    }
    if (type === 'booleano' && ![0, 1].includes(data.valor_numerico)) throw new HttpError(422, 'Use 1 para sim ou 0 para não.', 'invalid_result');
    if (meta.unidade === 'escala_0_10' && (data.valor_numerico < 0 || data.valor_numerico > 10)) throw new HttpError(422, 'A avaliação precisa estar entre 0 e 10.', 'invalid_result');
  }
}

async function prepareRecord(db, resource, planId, data, current) {
  const definition = RESOURCES[resource];
  Object.assign(data, sanitizeFields(pick(data, Object.keys(definition.fields)), definition.fields, { required: true }));
  const related = await referencesInPlan(db, definition, data, planId);
  checkDateOrder(data.data_inicio, data.data_fim);
  checkDateOrder(data.data_inicio, data.data_limite);
  checkDateOrder(data.periodo_inicio, data.periodo_fim);
  if (resource === 'tarefas') {
    data.concluida_em = data.status === 'concluida'
      ? (current?.status === 'concluida' ? current.concluida_em : new Date().toISOString())
      : null;
    if (data.objetivo_id && related.iniciativa_id?.objetivo_id && data.objetivo_id !== related.iniciativa_id.objetivo_id) {
      throw new HttpError(422, 'A iniciativa e o objetivo escolhidos precisam corresponder. Escolha o objetivo da iniciativa ou deixe o objetivo da tarefa vazio.', 'inconsistent_reference');
    }
  }
  if (resource === 'metas_indicador') {
    const indicator = related.indicador_id;
    if (data.tipo_valor && data.tipo_valor !== indicator.tipo_valor) throw new HttpError(422, 'O tipo da meta precisa ser igual ao tipo do indicador.', 'invalid_target');
    data.tipo_valor = indicator.tipo_valor;
    if (!data.unidade) data.unidade = indicator.unidade;
    if (!current && data.unidade !== indicator.unidade) throw new HttpError(422, 'Use a unidade cadastrada no indicador para a nova meta.', 'invalid_target');
    assertCanonicalPeriod(data.periodo_inicio, data.periodo_fim, indicator.frequencia);
    assertTarget(data);
    if (current) {
      const measured = await db.prepare('SELECT 1 AS found FROM resultados_indicador WHERE plano_id = ? AND meta_id = ? LIMIT 1').bind(planId, current.id).first();
      if (measured) throw new HttpError(409, 'Esta meta já possui resultado. Você pode corrigir o resultado ou criar a meta de um novo período.', 'historical_target');
    }
  }
  if (resource === 'resultados_indicador') {
    if (current && current.meta_id !== data.meta_id) {
      throw new HttpError(409, 'Um resultado registrado não pode ser movido para outra meta. Corrija o valor do registro original ou cadastre outro resultado.', 'immutable_result_link');
    }
    assertResult(data, related.meta_id);
  }
  if (resource === 'indicadores' && current && (current.tipo_valor !== data.tipo_valor || current.frequencia !== data.frequencia || current.unidade !== data.unidade)) {
    const used = await db.prepare('SELECT 1 AS found FROM metas_indicador WHERE plano_id = ? AND indicador_id = ? LIMIT 1').bind(planId, current.id).first();
    if (used) throw new HttpError(409, 'Este indicador já tem metas. Para mudar seu tipo, unidade ou frequência, crie outro indicador e preserve o histórico.', 'indicator_has_targets');
  }
  const fields = sanitizeFields(pick(data, Object.keys(definition.fields)), definition.fields, { required: true });
  return { ...fields, ...pick(data, definition.serverFields || []) };
}

function targetNoOverlap(data, exceptId = null) {
  return {
    sql: `NOT EXISTS (SELECT 1 FROM metas_indicador occupied WHERE occupied.plano_id = ? AND occupied.indicador_id = ? AND occupied.periodo_inicio <= ? AND occupied.periodo_fim >= ?${exceptId ? ' AND occupied.id <> ?' : ''})`,
    params: [data.plano_id, data.indicador_id, data.periodo_fim, data.periodo_inicio, ...(exceptId ? [exceptId] : [])],
  };
}

async function createRecord(db, resource, planId, body) {
  const definition = RESOURCES[resource];
  const incoming = sanitizeFields(body, definition.fields);
  const values = await prepareRecord(db, resource, planId, { ...definition.defaults, ...incoming });
  const data = { id: crypto.randomUUID(), plano_id: planId, ...values };
  const columns = Object.keys(data);
  const placeholders = columns.map(() => '?').join(',');
  let query = `INSERT INTO ${resource} (${columns.join(',')})`;
  const params = Object.values(data);
  if (resource === 'metas_indicador') {
    const guard = targetNoOverlap(data);
    query += ` SELECT ${placeholders} WHERE ${guard.sql}`;
    params.push(...guard.params);
  } else query += ` VALUES (${placeholders})`;
  const outcome = await db.prepare(query).bind(...params).run();
  if (!changes(outcome)) throw new HttpError(409, 'Já existe uma meta para esse indicador em parte deste período.', 'overlapping_period');
  return recordInPlan(db, resource, planId, data.id);
}

async function updateRecord(db, resource, planId, current, body) {
  const definition = RESOURCES[resource];
  if (!Object.keys(body).length) throw new HttpError(400, 'Informe os campos que deseja atualizar.', 'empty_update');
  const incoming = sanitizeFields(body, definition.fields);
  const values = await prepareRecord(db, resource, planId, {
    ...pick(current, Object.keys(definition.fields)), ...incoming,
  }, current);
  const columns = Object.keys(values);
  const assignments = columns.map(name => `${name} = ?`);
  if (definition.updated) assignments.push('atualizado_em = CURRENT_TIMESTAMP');
  let query = `UPDATE ${resource} SET ${assignments.join(',')} WHERE plano_id = ? AND id = ?`;
  const params = [...Object.values(values), planId, current.id];
  if (resource === 'metas_indicador') {
    const guard = targetNoOverlap({ ...values, plano_id: planId }, current.id);
    query += ` AND ${guard.sql}`;
    params.push(...guard.params);
  }
  const outcome = await db.prepare(query).bind(...params).run();
  if (!changes(outcome)) throw new HttpError(409, resource === 'metas_indicador' ? 'O período se sobrepõe a outra meta deste indicador.' : 'O registro foi alterado ou removido. Atualize a página.', resource === 'metas_indicador' ? 'overlapping_period' : 'conflict');
  return recordInPlan(db, resource, planId, current.id);
}

function insertStatements(db, table, rows) {
  if (!rows.length) return [];
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const chunkSize = Math.max(1, Math.floor(MAX_BINDINGS / columns.length));
  const statements = [];
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const tuples = chunk.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    statements.push(db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples}`)
      .bind(...chunk.flatMap(row => columns.map(column => row[column] ?? null))));
  }
  return statements;
}

function modelRows(model, planId) {
  const rows = Object.fromEntries(RESOURCE_NAMES.map(name => [name, []]));
  const objectivesByCode = new Map();
  const suggestions = {};
  const put = (table, raw) => {
    const data = sanitizeFields({ ...RESOURCES[table].defaults, ...raw }, RESOURCES[table].fields, { required: true });
    const row = { id: crypto.randomUUID(), plano_id: planId, ...data };
    if (table === 'tarefas') row.concluida_em = null;
    rows[table].push(row);
    return row.id;
  };
  if (!Array.isArray(model.perspectivas) || model.perspectivas.length > 20) throw new HttpError(422, 'O modelo não possui perspectivas válidas.', 'invalid_template');
  for (const [areaIndex, area] of model.perspectivas.entries()) {
    const areaId = put('perspectivas', { codigo: area.codigo, nome: area.nome, cor: area.cor ?? null, descricao: area.descricao ?? null, ordem: area.ordem ?? areaIndex });
    if (!Array.isArray(area.objetivos) || area.objetivos.length > 100) throw new HttpError(422, 'O modelo possui objetivos inválidos.', 'invalid_template');
    for (const [goalIndex, goal] of area.objetivos.entries()) {
      const goalId = put('objetivos', { perspectiva_id: areaId, codigo: goal.codigo, titulo: goal.titulo, descricao: goal.descricao ?? null, data_limite: goal.data_limite ?? null, ordem: goalIndex });
      objectivesByCode.set(goal.codigo, goalId);
      if (!Array.isArray(goal.indicadores) || goal.indicadores.length > 20) throw new HttpError(422, 'O modelo possui indicadores inválidos.', 'invalid_template');
      for (const indicator of goal.indicadores) {
        put('indicadores', {
          objetivo_id: goalId, codigo: indicator.codigo, nome: indicator.nome, tipo_valor: indicator.tipo_valor,
          unidade: indicator.unidade, frequencia: indicator.frequencia, destaque_painel: indicator.destaque_painel ?? 0,
          descricao: indicator.descricao ?? null,
        });
        if (indicator.meta_sugerida && typeof indicator.meta_sugerida === 'object') suggestions[indicator.codigo] = indicator.meta_sugerida;
      }
    }
  }
  for (const [index, cycle] of (model.ciclos || []).entries()) {
    checkDateOrder(cycle.data_inicio, cycle.data_fim);
    put('ciclos', { nome: cycle.nome, descricao: cycle.descricao ?? null, data_inicio: cycle.data_inicio, data_fim: cycle.data_fim, ordem: cycle.ordem ?? index });
  }
  for (const task of model.tarefas_iniciais || []) {
    if (task.objetivo_codigo && !objectivesByCode.has(task.objetivo_codigo)) throw new HttpError(422, 'Uma tarefa do modelo referencia um objetivo inexistente.', 'invalid_template');
    checkDateOrder(task.data_inicio, task.data_limite);
    put('tarefas', {
      objetivo_id: task.objetivo_codigo ? objectivesByCode.get(task.objetivo_codigo) : null,
      titulo: task.titulo, grupo: task.grupo ?? null, data_inicio: task.data_inicio ?? null,
      data_limite: task.data_limite ?? null, status: 'pendente',
    });
  }
  for (const [index, value] of (model.valores || []).entries()) put('itens_estrategicos', { tipo: 'valor', titulo: value, ordem: index });
  for (const name of ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Pets', 'Lazer', 'Educação', 'Outras']) put('categorias_financeiras', { nome: name });
  return { rows, suggestions };
}

async function createPlan(db, userId, body) {
  const allowed = new Set([...Object.keys(PLAN_FIELDS), 'modelo_id', 'importar_modelo']);
  for (const field of Object.keys(body)) if (!allowed.has(field)) throw new HttpError(400, `O campo ${field} não pode ser alterado.`, 'unknown_field');
  if (body.importar_modelo !== undefined && typeof body.importar_modelo !== 'boolean') throw new HttpError(422, 'importar_modelo deve ser verdadeiro ou falso.', 'invalid_field');
  const importModel = body.importar_modelo === true;
  const modelId = importModel ? validId(body.modelo_id || DEFAULT_TEMPLATE) : null;
  let model = null;
  if (modelId) {
    const template = await db.prepare('SELECT conteudo_json FROM modelos_bsc WHERE id = ?').bind(modelId).first();
    if (!template) throw new HttpError(404, 'Modelo não encontrado. Confira se a migração inicial foi aplicada.', 'template_not_found');
    model = JSON.parse(template.conteudo_json);
  }
  const year = new Date().getUTCFullYear();
  const id = crypto.randomUUID();
  const imported = model ? modelRows(model, id) : null;
  const fields = sanitizeFields({
    titulo: model?.titulo || 'Meu planejamento', ano_inicio: model?.ano_inicio || year,
    ano_fim: model?.ano_fim || year + 9, status: 'ativo', configuracoes_json: '{}',
    ...(model?.missao ? { missao: model.missao } : {}),
    ...pick(body, Object.keys(PLAN_FIELDS)),
  }, PLAN_FIELDS, { required: true });
  if (fields.ano_fim < fields.ano_inicio) throw new HttpError(422, 'O ano final não pode ser anterior ao ano inicial.', 'invalid_period');
  if (imported) {
    fields.configuracoes_json = JSON.stringify({ ...JSON.parse(fields.configuracoes_json), metas_sugeridas: imported.suggestions });
    sanitizeFields({ configuracoes_json: fields.configuracoes_json }, PLAN_FIELDS);
  }
  const statements = insertStatements(db, 'planos', [{ id, usuario_id: userId, modelo_id: modelId, ...fields }]);
  if (imported) {
    for (const resource of ['perspectivas', 'ciclos', 'objetivos', 'indicadores', 'tarefas', 'itens_estrategicos', 'categorias_financeiras']) {
      statements.push(...insertStatements(db, resource, imported.rows[resource]));
    }
  }
  if (statements.length > 40) throw new HttpError(422, 'O modelo é grande demais para uma única importação. Divida-o em planos menores.', 'template_too_large');
  // D1 batch executes these statements sequentially in one transaction: no partial plan.
  await db.batch(statements);
  return ownedPlan(db, userId, id);
}

async function snapshot(db, plan) {
  const statements = RESOURCE_NAMES.map(name => db.prepare(`SELECT * FROM ${name} WHERE plano_id = ? ORDER BY ${RESOURCES[name].order} LIMIT ?`).bind(plan.id, SNAPSHOT_LIMIT + 1));
  statements.push(db.prepare('SELECT * FROM vw_scorecard WHERE usuario_id = ? AND plano_id = ? ORDER BY periodo_inicio DESC, ordem_perspectiva, objetivo_codigo LIMIT ?').bind(plan.usuario_id, plan.id, SNAPSHOT_LIMIT + 1));
  const result = await db.batch(statements);
  const data = { plan };
  RESOURCE_NAMES.forEach((name, index) => {
    const rows = result[index].results || [];
    if (rows.length > SNAPSHOT_LIMIT) throw new HttpError(413, `A tabela ${name} ultrapassou ${SNAPSHOT_LIMIT} registros neste plano. Use a API paginada para consultar os registros; a tela não carregou dados incompletos.`, 'snapshot_too_large', { resource: name, limit: SNAPSHOT_LIMIT });
    data[name] = rows;
  });
  data.scorecard = result[result.length - 1].results || [];
  return data;
}

function compatibleSuggestion(indicator, suggestion) {
  const fallback = { regra: 'acompanhar', valor_minimo: null, valor_maximo: null, descricao: 'Acompanhar o indicador neste período; definir uma meta quando houver referência suficiente.' };
  if (!suggestion || typeof suggestion !== 'object') return fallback;
  const proposed = {
    regra: suggestion.regra, valor_minimo: suggestion.valor_minimo ?? null,
    valor_maximo: suggestion.valor_maximo ?? null, descricao: suggestion.descricao,
  };
  try {
    sanitizeFields(proposed, RESOURCES.metas_indicador.fields);
    if (!proposed.descricao) return fallback;
    assertTarget({ ...proposed, tipo_valor: indicator.tipo_valor });
    return proposed;
  } catch { return fallback; }
}

async function prepareMonth(db, plan, body) {
  if (Object.keys(body).some(key => key !== 'month') || typeof body.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)) {
    throw new HttpError(422, 'Informe month no formato AAAA-MM.', 'invalid_period');
  }
  const start = `${body.month}-01`;
  if (!isValidDate(start)) throw new HttpError(422, 'Mês inválido.', 'invalid_period');
  const year = Number(body.month.slice(0, 4));
  const month = Number(body.month.slice(5, 7));
  if (year < 1900 || year > 2200) throw new HttpError(422, 'Escolha um ano entre 1900 e 2200.', 'invalid_period');
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const indicators = (await db.prepare("SELECT * FROM indicadores WHERE plano_id = ? AND ativo = 1 AND frequencia = 'mensal'").bind(plan.id).all()).results || [];
  if (indicators.length > 200) throw new HttpError(422, 'Prepare planos com até 200 indicadores mensais por vez.', 'too_many_indicators');
  if (!indicators.length) return { created: 0, skipped: 0 };
  const suggestions = JSON.parse(plan.configuracoes_json || '{}').metas_sugeridas || {};
  const rows = indicators.map(indicator => ({
    id: crypto.randomUUID(), plano_id: plan.id, indicador_id: indicator.id,
    tipo_valor: indicator.tipo_valor, unidade: indicator.unidade, periodo_inicio: start, periodo_fim: end,
    ...compatibleSuggestion(indicator, suggestions[indicator.codigo]),
  }));
  const columns = Object.keys(rows[0]);
  const chunkSize = Math.floor(MAX_BINDINGS / columns.length);
  const statements = [];
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const tuples = chunk.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    statements.push(db.prepare(`WITH novas (${columns.join(',')}) AS (VALUES ${tuples})
      INSERT INTO metas_indicador (${columns.join(',')})
      SELECT ${columns.map(column => `n.${column}`).join(',')} FROM novas n
      WHERE NOT EXISTS (
        SELECT 1 FROM metas_indicador occupied
        WHERE occupied.plano_id = n.plano_id AND occupied.indicador_id = n.indicador_id
          AND occupied.periodo_inicio <= n.periodo_fim AND occupied.periodo_fim >= n.periodo_inicio
      )
      ON CONFLICT (plano_id, indicador_id, periodo_inicio, periodo_fim) DO NOTHING`)
      .bind(...chunk.flatMap(row => columns.map(column => row[column] ?? null))));
  }
  const outcomes = await db.batch(statements);
  const created = outcomes.reduce((sum, result) => sum + changes(result), 0);
  return { created, skipped: rows.length - created };
}

async function handle(request, env, user, authMode) {
  if (!env.DB) throw new HttpError(503, 'A conexão DB com o Cloudflare D1 não foi configurada.', 'database_not_configured');
  if (!user?.id) throw new HttpError(401, 'Faça login para continuar.', 'unauthorized');
  const url = new URL(request.url);
  let path;
  try { path = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); }
  catch { throw new HttpError(400, 'Caminho inválido.', 'invalid_path'); }
  const db = env.DB;

  if (path.length === 2 && path[1] === 'bootstrap') {
    checkMethod(request, ['GET']);
    const results = await db.batch([
      db.prepare('SELECT * FROM planos WHERE usuario_id = ? ORDER BY criado_em DESC, id').bind(user.id),
      db.prepare('SELECT id, nome, descricao, versao FROM modelos_bsc ORDER BY nome'),
    ]);
    return jsonResponse({ user, plans: results[0].results || [], templates: results[1].results || [], authMode });
  }

  if (path.length === 3 && path[1] === 'templates') {
    checkMethod(request, ['GET']);
    const row = await db.prepare('SELECT id, nome, descricao, versao, conteudo_json FROM modelos_bsc WHERE id = ?').bind(validId(path[2])).first();
    if (!row) throw new HttpError(404, 'Modelo não encontrado.', 'not_found');
    const { conteudo_json, ...metadata } = row;
    return jsonResponse({ data: { ...metadata, conteudo: JSON.parse(conteudo_json) } });
  }

  if (path.length === 2 && path[1] === 'me') {
    checkMethod(request, ['GET', 'PATCH']);
    if (request.method === 'GET') return jsonResponse({ data: user });
    const body = await readJson(request);
    if (!Object.keys(body).length) throw new HttpError(400, 'Informe nome ou fuso horário.', 'empty_update');
    const fields = sanitizeFields(body, PROFILE_FIELDS);
    const names = Object.keys(fields);
    await db.prepare(`UPDATE usuarios SET ${names.map(name => `${name} = ?`).join(',')}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(...Object.values(fields), user.id).run();
    return jsonResponse({ data: await db.prepare('SELECT id, nome, email, fuso_horario, criado_em, atualizado_em FROM usuarios WHERE id = ?').bind(user.id).first() });
  }

  if (path[1] !== 'plans') throw new HttpError(404, 'Rota não encontrada.', 'not_found');
  if (path.length === 2) {
    checkMethod(request, ['GET', 'POST']);
    if (request.method === 'GET') return jsonResponse({ data: (await db.prepare('SELECT * FROM planos WHERE usuario_id = ? ORDER BY criado_em DESC, id').bind(user.id).all()).results || [] });
    return jsonResponse({ data: await createPlan(db, user.id, await readJson(request)) }, 201);
  }

  const plan = await ownedPlan(db, user.id, path[2]);
  if (path.length === 3) {
    checkMethod(request, ['GET', 'PATCH', 'DELETE']);
    if (request.method === 'GET') return jsonResponse({ data: plan });
    if (request.method === 'DELETE') {
      const body = await readJson(request);
      if (Object.keys(body).length) throw new HttpError(400, 'Envie um objeto vazio para excluir o plano.', 'unknown_field');
      await db.prepare('DELETE FROM planos WHERE id = ? AND usuario_id = ?').bind(plan.id, user.id).run();
      return jsonResponse({ ok: true });
    }
    const body = await readJson(request);
    if (!Object.keys(body).length) throw new HttpError(400, 'Informe os campos que deseja atualizar.', 'empty_update');
    const fields = sanitizeFields({ ...pick(plan, Object.keys(PLAN_FIELDS)), ...sanitizeFields(body, PLAN_FIELDS) }, PLAN_FIELDS, { required: true });
    if (fields.ano_fim < fields.ano_inicio) throw new HttpError(422, 'O ano final não pode ser anterior ao inicial.', 'invalid_period');
    await db.prepare(`UPDATE planos SET ${Object.keys(fields).map(name => `${name} = ?`).join(',')}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND usuario_id = ?`)
      .bind(...Object.values(fields), plan.id, user.id).run();
    return jsonResponse({ data: await ownedPlan(db, user.id, plan.id) });
  }

  if (path.length === 4 && ['snapshot', 'export'].includes(path[3])) {
    checkMethod(request, ['GET']);
    const data = await snapshot(db, plan);
    return jsonResponse(path[3] === 'export' ? { exportedAt: new Date().toISOString(), schemaVersion: 1, ...data } : data, 200,
      path[3] === 'export' ? { 'Content-Disposition': `attachment; filename="bsc-${plan.id}.json"` } : {});
  }
  if (path.length === 4 && path[3] === 'prepare-month') {
    checkMethod(request, ['POST']);
    return jsonResponse(await prepareMonth(db, plan, await readJson(request)));
  }

  const resource = path[3];
  const definition = Object.hasOwn(RESOURCES, resource) ? RESOURCES[resource] : null;
  if (!definition || path.length > 5) throw new HttpError(404, 'Recurso não encontrado.', 'not_found');
  if (path.length === 4) {
    checkMethod(request, ['GET', 'POST']);
    if (request.method === 'POST') return jsonResponse({ data: await createRecord(db, resource, plan.id, await readJson(request)) }, 201);
    const limit = Number(url.searchParams.get('limit') || 200);
    const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isSafeInteger(offset) || offset < 0) throw new HttpError(422, 'Paginação inválida. Use limit entre 1 e 500 e offset inteiro não negativo.', 'invalid_pagination');
    const rows = (await db.prepare(`SELECT * FROM ${resource} WHERE plano_id = ? ORDER BY ${definition.order} LIMIT ? OFFSET ?`).bind(plan.id, limit + 1, offset).all()).results || [];
    return jsonResponse({ data: rows.slice(0, limit), pagination: { limit, offset, hasMore: rows.length > limit, nextOffset: rows.length > limit ? offset + limit : null } });
  }

  checkMethod(request, ['GET', 'PATCH', 'DELETE']);
  const current = await recordInPlan(db, resource, plan.id, path[4]);
  if (request.method === 'GET') return jsonResponse({ data: current });
  if (request.method === 'PATCH') return jsonResponse({ data: await updateRecord(db, resource, plan.id, current, await readJson(request)) });
  const body = await readJson(request);
  if (Object.keys(body).length) throw new HttpError(400, 'Envie um objeto vazio para excluir o registro.', 'unknown_field');
  await db.prepare(`DELETE FROM ${resource} WHERE plano_id = ? AND id = ?`).bind(plan.id, current.id).run();
  return jsonResponse({ ok: true });
}

export async function handleApi(request, env, user, authMode = 'access') {
  if (!new URL(request.url).pathname.startsWith('/api/') && new URL(request.url).pathname !== '/api') return null;
  try { return await handle(request, env, user, authMode); }
  catch (error) { return errorResponse(error); }
}
