import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { createTestDB } from './d1-adapter.js';

const ORIGIN = 'http://localhost:8787';
const TEMPLATE = 'bsc_pessoal_2027_2036_v1';
const resourcePath = (planId, resource, id) => `/api/plans/${planId}/${resource}${id ? `/${id}` : ''}`;

function harness(t) {
  const DB = createTestDB();
  t.after(() => DB.close());

  async function request(path, {
    method = 'GET', body, email = 'a@example.test', headers: supplied = {}, rawBody,
  } = {}) {
    const headers = new Headers();
    if (['POST', 'PATCH', 'DELETE'].includes(method)) {
      headers.set('Origin', ORIGIN);
      headers.set('Content-Type', 'application/json');
    }
    for (const [key, value] of Object.entries(supplied)) {
      if (value === null) headers.delete(key);
      else headers.set(key, value);
    }
    const init = { method, headers };
    if (['POST', 'PATCH', 'DELETE'].includes(method)) {
      init.body = rawBody !== undefined ? rawBody : JSON.stringify(body ?? {});
    }
    const response = await worker.fetch(new Request(`${ORIGIN}${path}`, init), {
      DB, AUTH_MODE: 'local', LOCAL_USER_EMAIL: email, LOCAL_USER_NAME: 'Teste',
    });
    assert.match(response.headers.get('Content-Type') || '', /application\/json/i);
    const data = await response.json();
    return { response, status: response.status, data };
  }

  async function success(path, options, status = 200) {
    const result = await request(path, options);
    assert.equal(result.status, status, `${options?.method || 'GET'} ${path}: ${JSON.stringify(result.data)}`);
    return result.data;
  }

  async function createPlan({ email = 'a@example.test', importModel = true, title = 'Meu BSC de teste' } = {}) {
    const result = await success('/api/plans', {
      method: 'POST', email,
      body: { titulo: title, ano_inicio: 2027, ano_fim: 2036, modelo_id: TEMPLATE, importar_modelo: importModel },
    }, 201);
    assert.ok(result.data.id);
    return result.data;
  }

  async function snapshot(planId, email = 'a@example.test') {
    return success(`/api/plans/${planId}/snapshot`, { email });
  }

  async function createTarget(planId, indicatorId, month = '2027-01') {
    const [year, monthNumber] = month.split('-').map(Number);
    const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    return (await success(resourcePath(planId, 'metas_indicador'), {
      method: 'POST',
      body: { indicador_id: indicatorId, periodo_inicio: `${month}-01`, periodo_fim: end,
        regra: 'minimo', valor_minimo: 80, valor_maximo: null, descricao: 'Pelo menos 80% no período.' },
    }, 201)).data;
  }

  return { DB, request, success, createPlan, snapshot, createTarget };
}

test('bootstrap registra a identidade local e disponibiliza o modelo sem planos fictícios', async t => {
  const h = harness(t);
  const response = await h.request('/api/bootstrap');
  assert.equal(response.status, 200);
  assert.equal(response.data.authMode, 'local');
  assert.equal(response.data.user.email, 'a@example.test');
  assert.deepEqual(response.data.plans, []);
  assert.equal(response.data.templates.length, 1);
  assert.equal(response.data.templates[0].id, TEMPLATE);
  assert.match(response.response.headers.get('Cache-Control'), /no-store/);
  assert.equal(response.response.headers.get('X-Content-Type-Options'), 'nosniff');

  const again = await h.success('/api/bootstrap');
  assert.equal(again.user.id, response.data.user.id, 'a mesma identidade deve reutilizar o usuário');
  const template = await h.success(`/api/templates/${TEMPLATE}`);
  assert.equal(template.data.conteudo.perspectivas.length, 5);
});

test('criar um plano importa o BSC completo sem metas, resultados ou transações realizadas', async t => {
  const h = harness(t);
  const plan = await h.createPlan();
  const data = await h.snapshot(plan.id);
  assert.equal(data.plan.id, plan.id);
  assert.equal(data.perspectivas.length, 5);
  assert.equal(data.objetivos.length, 27);
  assert.equal(data.indicadores.length, 29);
  assert.equal(data.ciclos.length, 4);
  assert.equal(data.tarefas.length, 12);
  assert.equal(data.itens_estrategicos.filter(row => row.tipo === 'valor').length, 7);
  assert.equal(data.categorias_financeiras.length, 8);
  assert.deepEqual(data.metas_indicador, []);
  assert.deepEqual(data.resultados_indicador, []);
  assert.deepEqual(data.lancamentos_financeiros, []);
  assert.deepEqual(data.scorecard, []);
  assert.ok(data.tarefas.every(row => row.status === 'pendente' && row.concluida_em === null));
  assert.ok(data.tarefas.some(row => row.data_inicio === '2026-11-16'), 'a preparação anterior a 2027 deve ser preservada');
  assert.equal((await h.success('/api/plans')).data.length, 1);
  assert.deepEqual(h.DB.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
});

test('CRUD de tarefas persiste, controla a conclusão e permite reabrir ou excluir', async t => {
  const h = harness(t);
  const plan = await h.createPlan({ importModel: false });
  const created = (await h.success(resourcePath(plan.id, 'tarefas'), {
    method: 'POST', body: { titulo: 'Organizar a semana', prioridade: 2, data_limite: '2027-01-10' },
  }, 201)).data;
  assert.equal(created.status, 'pendente');
  assert.equal(created.concluida_em, null);

  const completed = (await h.success(resourcePath(plan.id, 'tarefas', created.id), {
    method: 'PATCH', body: { titulo: 'Revisar e organizar a semana', status: 'concluida' },
  })).data;
  assert.ok(completed.concluida_em);
  const readBack = (await h.success(resourcePath(plan.id, 'tarefas', created.id))).data;
  assert.equal(readBack.titulo, 'Revisar e organizar a semana');
  assert.equal(readBack.status, 'concluida');
  assert.equal((await h.snapshot(plan.id)).tarefas[0].id, created.id);

  const reopened = (await h.success(resourcePath(plan.id, 'tarefas', created.id), {
    method: 'PATCH', body: { status: 'pendente' },
  })).data;
  assert.equal(reopened.concluida_em, null);
  assert.deepEqual(await h.success(resourcePath(plan.id, 'tarefas', created.id), { method: 'DELETE' }), { ok: true });
  assert.equal((await h.request(resourcePath(plan.id, 'tarefas', created.id))).status, 404);
  assert.equal((await h.snapshot(plan.id)).tarefas.length, 0);
});

test('resultado zero permanece distinto de um período ainda não preenchido', async t => {
  const h = harness(t);
  const plan = await h.createPlan();
  const indicator = (await h.snapshot(plan.id)).indicadores.find(row => row.codigo === 'P1.1');
  const january = await h.createTarget(plan.id, indicator.id, '2027-01');
  const february = await h.createTarget(plan.id, indicator.id, '2027-02');
  const result = (await h.success(resourcePath(plan.id, 'resultados_indicador'), {
    method: 'POST', body: { meta_id: january.id, valor_numerico: 0 },
  }, 201)).data;
  assert.equal(result.tipo_valor, 'numero');
  assert.equal(result.valor_numerico, 0);

  const data = await h.snapshot(plan.id);
  const measured = data.scorecard.find(row => row.meta_id === january.id);
  const unmeasured = data.scorecard.find(row => row.meta_id === february.id);
  assert.equal(measured.resultado_numerico, 0);
  assert.equal(measured.situacao, 'nao_atingida');
  assert.equal(unmeasured.resultado_numerico, null);
  assert.equal(unmeasured.situacao, 'sem_resultado');
});

test('meta com resultado não muda retroativamente, mas o resultado pode ser corrigido', async t => {
  const h = harness(t);
  const plan = await h.createPlan();
  const indicator = (await h.snapshot(plan.id)).indicadores.find(row => row.codigo === 'P1.1');
  const target = await h.createTarget(plan.id, indicator.id);
  const result = (await h.success(resourcePath(plan.id, 'resultados_indicador'), {
    method: 'POST', body: { meta_id: target.id, valor_numerico: 70 },
  }, 201)).data;

  const denied = await h.request(resourcePath(plan.id, 'metas_indicador', target.id), {
    method: 'PATCH', body: { valor_minimo: 60 },
  });
  assert.equal(denied.status, 409);
  assert.equal(denied.data.code, 'historical_target');
  const unchanged = (await h.success(resourcePath(plan.id, 'metas_indicador', target.id))).data;
  assert.equal(unchanged.valor_minimo, 80);

  const corrected = (await h.success(resourcePath(plan.id, 'resultados_indicador', result.id), {
    method: 'PATCH', body: { valor_numerico: 90, observacoes: 'Correção do preenchimento.' },
  })).data;
  assert.equal(corrected.valor_numerico, 90);
  assert.equal((await h.snapshot(plan.id)).scorecard.find(row => row.meta_id === target.id).situacao, 'atingida');
});

test('o histórico preserva o vínculo do resultado e a unidade, o tipo e a frequência do indicador', async t => {
  const h = harness(t);
  const plan = await h.createPlan();
  const indicator = (await h.snapshot(plan.id)).indicadores.find(row => row.codigo === 'P1.1');
  const january = await h.createTarget(plan.id, indicator.id, '2027-01');
  const february = await h.createTarget(plan.id, indicator.id, '2027-02');
  const result = (await h.success(resourcePath(plan.id, 'resultados_indicador'), {
    method: 'POST', body: { meta_id: january.id, valor_numerico: 85 },
  }, 201)).data;

  const moved = await h.request(resourcePath(plan.id, 'resultados_indicador', result.id), {
    method: 'PATCH', body: { meta_id: february.id },
  });
  assert.equal(moved.status, 409);
  assert.equal(moved.data.code, 'immutable_result_link');
  for (const body of [{ unidade: 'horas' }, { tipo_valor: 'texto' }, { frequencia: 'anual' }]) {
    const changed = await h.request(resourcePath(plan.id, 'indicadores', indicator.id), { method: 'PATCH', body });
    assert.equal(changed.status, 409);
    assert.equal(changed.data.code, 'indicator_has_targets');
  }
  const snapshot = await h.snapshot(plan.id);
  assert.equal(snapshot.resultados_indicador.find(row => row.id === result.id).meta_id, january.id);
  assert.equal(snapshot.indicadores.find(row => row.id === indicator.id).unidade, '%');
  assert.equal(snapshot.scorecard.find(row => row.meta_id === february.id).situacao, 'sem_resultado');
});

test('metas validam o período e rejeitam duplicidade sem criar registros extras', async t => {
  const h = harness(t);
  const plan = await h.createPlan();
  const indicator = (await h.snapshot(plan.id)).indicadores.find(row => row.codigo === 'P1.1');
  const body = { indicador_id: indicator.id, periodo_inicio: '2027-01-01', periodo_fim: '2027-01-31',
    regra: 'minimo', valor_minimo: 80, descricao: 'Meta mensal' };
  await h.success(resourcePath(plan.id, 'metas_indicador'), { method: 'POST', body }, 201);
  const duplicate = await h.request(resourcePath(plan.id, 'metas_indicador'), { method: 'POST', body });
  assert.equal(duplicate.status, 409);
  const partial = await h.request(resourcePath(plan.id, 'metas_indicador'), {
    method: 'POST', body: { ...body, periodo_inicio: '2027-02-02', periodo_fim: '2027-02-28' },
  });
  assert.equal(partial.status, 422);
  assert.equal((await h.snapshot(plan.id)).metas_indicador.length, 1);
});

test('preparar mês cria somente os indicadores mensais e é idempotente', async t => {
  const h = harness(t);
  const plan = await h.createPlan();
  const indicators = (await h.snapshot(plan.id)).indicadores;
  const expected = indicators.filter(row => row.frequencia === 'mensal' && row.ativo === 1).length;
  assert.equal(expected, 13);
  const path = `/api/plans/${plan.id}/prepare-month`;
  const first = await h.success(path, { method: 'POST', body: { month: '2027-01' } });
  assert.deepEqual(first, { created: expected, skipped: 0 });
  const firstSnapshot = await h.snapshot(plan.id);
  const initialIds = firstSnapshot.metas_indicador.map(row => row.id).sort();
  assert.equal(firstSnapshot.scorecard.length, expected);
  assert.ok(firstSnapshot.scorecard.every(row => row.situacao === 'sem_resultado'));
  assert.equal(firstSnapshot.scorecard.filter(row => row.destaque_painel === 1).length, 5);

  const second = await h.success(path, { method: 'POST', body: { month: '2027-01' } });
  assert.deepEqual(second, { created: 0, skipped: expected });
  assert.deepEqual((await h.snapshot(plan.id)).metas_indicador.map(row => row.id).sort(), initialIds);
  const next = await h.success(path, { method: 'POST', body: { month: '2027-02' } });
  assert.deepEqual(next, { created: expected, skipped: 0 });
  assert.equal((await h.snapshot(plan.id)).metas_indicador.length, expected * 2);
});

test('lançamentos preservam centavos e rejeitam valores fracionários e datas impossíveis', async t => {
  const h = harness(t);
  const plan = await h.createPlan();
  const category = (await h.snapshot(plan.id)).categorias_financeiras[0];
  const body = { categoria_id: category.id, tipo: 'despesa', descricao: 'Compra de teste',
    valor_centavos: 15075, data_lancamento: '2027-01-15', status: 'realizado', essencial: 1 };
  const created = (await h.success(resourcePath(plan.id, 'lancamentos_financeiros'), {
    method: 'POST', body,
  }, 201)).data;
  assert.equal(created.valor_centavos, 15075);
  assert.equal(created.status, 'realizado');

  for (const invalid of [
    { ...body, valor_centavos: 150.75 },
    { ...body, valor_centavos: 0 },
    { ...body, valor_centavos: '15075' },
    { ...body, data_lancamento: '2027-02-29' },
    { ...body, data_lancamento: '2027-13-01' },
  ]) {
    const result = await h.request(resourcePath(plan.id, 'lancamentos_financeiros'), { method: 'POST', body: invalid });
    assert.equal(result.status, 422, JSON.stringify(result.data));
  }
  const persisted = await h.snapshot(plan.id);
  assert.equal(persisted.lancamentos_financeiros.length, 1);
  assert.equal(persisted.lancamentos_financeiros[0].valor_centavos, 15075);
});

test('usuário B não descobre, lê, altera, exporta ou exclui o plano de A', async t => {
  const h = harness(t);
  const planA = await h.createPlan();
  const taskA = (await h.snapshot(planA.id)).tarefas[0];
  const bootstrapB = await h.success('/api/bootstrap', { email: 'b@example.test' });
  assert.deepEqual(bootstrapB.plans, []);
  assert.notEqual(bootstrapB.user.id, planA.usuario_id);
  assert.deepEqual((await h.success('/api/plans', { email: 'b@example.test' })).data, []);

  const attempts = [
    [`/api/plans/${planA.id}`, 'GET'],
    [`/api/plans/${planA.id}/snapshot`, 'GET'],
    [`/api/plans/${planA.id}/export`, 'GET'],
    [resourcePath(planA.id, 'tarefas'), 'GET'],
    [resourcePath(planA.id, 'tarefas', taskA.id), 'GET'],
    [`/api/plans/${planA.id}`, 'PATCH', { titulo: 'Nome adulterado' }],
    [resourcePath(planA.id, 'tarefas'), 'POST', { titulo: 'Tarefa indevida' }],
    [resourcePath(planA.id, 'tarefas', taskA.id), 'PATCH', { titulo: 'Tarefa adulterada' }],
    [resourcePath(planA.id, 'tarefas', taskA.id), 'DELETE'],
    [`/api/plans/${planA.id}/prepare-month`, 'POST', { month: '2027-01' }],
    [`/api/plans/${planA.id}`, 'DELETE'],
  ];
  for (const [path, method, body] of attempts) {
    const result = await h.request(path, { method, body, email: 'b@example.test' });
    assert.equal(result.status, 404, `${method} ${path}: ${JSON.stringify(result.data)}`);
  }
  const unchanged = await h.snapshot(planA.id);
  assert.equal(unchanged.plan.titulo, planA.titulo);
  assert.equal(unchanged.tarefas.find(row => row.id === taskA.id).titulo, taskA.titulo);
  assert.equal(unchanged.tarefas.length, 12);
});

test('IDs de registros e referências de outro plano não atravessam o escopo autorizado', async t => {
  const h = harness(t);
  const planA = await h.createPlan();
  const source = await h.snapshot(planA.id);
  const otherOwnPlan = await h.createPlan({ importModel: false, title: 'Outro plano de A' });
  const planB = await h.createPlan({ email: 'b@example.test', importModel: false, title: 'Plano de B' });
  for (const [plan, email] of [[otherOwnPlan, 'a@example.test'], [planB, 'b@example.test']]) {
    const badParent = await h.request(resourcePath(plan.id, 'tarefas'), {
      method: 'POST', email, body: { titulo: 'Vínculo de outro plano', objetivo_id: source.objetivos[0].id },
    });
    assert.equal(badParent.status, 422);
    assert.equal(badParent.data.code, 'invalid_reference');
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      const result = await h.request(resourcePath(plan.id, 'tarefas', source.tarefas[0].id), {
        method, email, body: method === 'PATCH' ? { titulo: 'Inválido' } : undefined,
      });
      assert.equal(result.status, 404);
    }
    assert.equal((await h.snapshot(plan.id, email)).tarefas.length, 0);
  }
  assert.deepEqual(h.DB.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
});

test('mass assignment não permite substituir dono, IDs, plano ou campos calculados', async t => {
  const h = harness(t);
  const plan = await h.createPlan({ importModel: false });
  const createAttempts = [
    { titulo: 'Tentativa', plano_id: 'outro-plano' },
    { titulo: 'Tentativa', id: 'id-escolhido-no-cliente' },
    { titulo: 'Tentativa', usuario_id: 'outro-usuario' },
    { titulo: 'Tentativa', concluida_em: '2027-01-01T00:00:00Z' },
  ];
  for (const body of createAttempts) {
    const result = await h.request(resourcePath(plan.id, 'tarefas'), { method: 'POST', body });
    assert.equal(result.status, 400);
    assert.equal(result.data.code, 'unknown_field');
  }
  const changeOwner = await h.request(`/api/plans/${plan.id}`, {
    method: 'PATCH', body: { usuario_id: 'outro-usuario' },
  });
  assert.equal(changeOwner.status, 400);
  assert.equal((await h.success(`/api/plans/${plan.id}`)).data.usuario_id, plan.usuario_id);
  const createAsOther = await h.request('/api/plans', {
    method: 'POST', body: { titulo: 'Plano indevido', ano_inicio: 2027, ano_fim: 2036, usuario_id: 'outro-usuario' },
  });
  assert.equal(createAsOther.status, 400);
  assert.equal((await h.snapshot(plan.id)).tarefas.length, 0);
  assert.equal((await h.request(resourcePath(plan.id, 'usuarios'))).status, 404);
});

test('mutações exigem mesma origem e JSON, inclusive DELETE', async t => {
  const h = harness(t);
  const plan = await h.createPlan({ importModel: false });
  const path = resourcePath(plan.id, 'tarefas');
  for (const headers of [
    { Origin: 'https://site-de-terceiro.example' },
    { Origin: null },
    { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    const result = await h.request(path, { method: 'POST', body: { titulo: 'Indevida' }, headers });
    assert.equal(result.status, 403);
    assert.equal(result.data.code, 'ORIGIN_FORBIDDEN');
  }
  for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', null]) {
    const result = await h.request(path, { method: 'POST', body: { titulo: 'Indevida' }, headers: { 'Content-Type': contentType } });
    assert.equal(result.status, 415);
    assert.equal(result.data.code, 'JSON_REQUIRED');
  }
  const task = (await h.success(path, { method: 'POST', body: { titulo: 'Preservar' } }, 201)).data;
  const badDelete = await h.request(resourcePath(plan.id, 'tarefas', task.id), {
    method: 'DELETE', headers: { Origin: 'https://site-de-terceiro.example' },
  });
  assert.equal(badDelete.status, 403);
  assert.equal((await h.snapshot(plan.id)).tarefas.length, 1);
});

test('corpo inválido e referências obrigatórias ausentes recebem erro de cliente, sem falha interna', async t => {
  const h = harness(t);
  const plan = await h.createPlan();
  const taskPath = resourcePath(plan.id, 'tarefas');
  for (const rawBody of ['{', 'null', '[]']) {
    const response = await h.request(taskPath, { method: 'POST', rawBody });
    assert.equal(response.status, 400, JSON.stringify(response.data));
  }
  const missingIndicator = await h.request(resourcePath(plan.id, 'metas_indicador'), {
    method: 'POST', body: { periodo_inicio: '2027-01-01', periodo_fim: '2027-01-31', regra: 'acompanhar', descricao: 'Sem indicador' },
  });
  assert.equal(missingIndicator.status, 422, JSON.stringify(missingIndicator.data));
  const missingTarget = await h.request(resourcePath(plan.id, 'resultados_indicador'), {
    method: 'POST', body: { valor_numerico: 1 },
  });
  assert.equal(missingTarget.status, 422, JSON.stringify(missingTarget.data));
  const invalidTask = await h.request(taskPath, {
    method: 'POST', body: { titulo: 'Prioridade fracionária', prioridade: 1.5 },
  });
  assert.equal(invalidTask.status, 422);
  assert.equal((await h.snapshot(plan.id)).tarefas.length, 12);
});

test('objetos JSON rejeitam chaves perigosas e excesso de profundidade', async t => {
  const h = harness(t);
  const plan = await h.createPlan({ importModel: false });
  const path = resourcePath(plan.id, 'simulacoes');
  const rawBodies = [
    '{"titulo":"Inválida","tipo":"outro","parametros_json":{"__proto__":{"polluted":"sim"}}}',
    '{"titulo":"Inválida","tipo":"outro","parametros_json":{"nested":{"constructor":{"prototype":{"polluted":"sim"}}}}}',
    '{"titulo":"Inválida","tipo":"outro","parametros_json":"{\\"__proto__\\":{\\"polluted\\":\\"sim\\"}}"}',
  ];
  for (const rawBody of rawBodies) {
    const result = await h.request(path, { method: 'POST', rawBody });
    assert.equal(result.status, 400, JSON.stringify(result.data));
    assert.equal(result.data.code, 'invalid_json');
  }
  let nested = { valor: 1 };
  for (let depth = 0; depth < 25; depth++) nested = { nested };
  const tooDeep = await h.request(path, {
    method: 'POST', body: { titulo: 'Muito profunda', tipo: 'outro', parametros_json: nested },
  });
  assert.equal(tooDeep.status, 422);
  assert.equal({}.polluted, undefined);
  assert.equal((await h.snapshot(plan.id)).simulacoes.length, 0);
});

test('excluir um plano próprio remove seus dependentes e preserva o plano de outro usuário', async t => {
  const h = harness(t);
  const planA = await h.createPlan();
  const planB = await h.createPlan({ email: 'b@example.test', title: 'Plano preservado' });
  await h.success(`/api/plans/${planA.id}/prepare-month`, { method: 'POST', body: { month: '2027-01' } });
  assert.deepEqual(await h.success(`/api/plans/${planA.id}`, { method: 'DELETE' }), { ok: true });
  assert.equal((await h.request(`/api/plans/${planA.id}/snapshot`)).status, 404);
  assert.deepEqual((await h.success('/api/plans')).data, []);
  const preserved = await h.snapshot(planB.id, 'b@example.test');
  assert.equal(preserved.plan.titulo, 'Plano preservado');
  assert.equal(preserved.objetivos.length, 27);
  assert.equal(preserved.tarefas.length, 12);
  assert.deepEqual(h.DB.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
});
