'use strict';

// Interface sem dependências. Dados pessoais são lidos e gravados pela API.
// O armazenamento do navegador contém apenas preferências de navegação.
const app = document.getElementById('app');
const editor = document.getElementById('editor-dialog');
const editorContent = document.getElementById('dialog-content');
const confirmDialog = document.getElementById('confirm-dialog');
const state = { user: null, plans: [], templates: [], authMode: 'access', planId: null, data: null, view: 'dashboard', month: '', search: '', filter: '', tab: '', mobileOpen: false, refreshing: false };
let editorState = null;
let toastTimer;

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".7"/>',
  chart: '<path d="M4 20h16M7 16v-5m5 5V5m5 11V9"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  tasks: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 3h6v4H9zM8 12l2 2 5-5M8 18h8"/>',
  wallet: '<path d="M4 6h14a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12v2"/><path d="M20 11h-5v5h5m-3-2.5h.01"/>',
  review: '<path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/><path d="M12 7v5l3 2"/>',
  book: '<path d="M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zm0 0v15"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  edit: '<path d="m16 3 5 5L9 20l-6 1 1-6L16 3zM13 6l5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-12 4h.01m5 0h.01m-5 3h.01"/>',
  heart: '<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-4 4 2 9 8 14 6-5 12-10 8-14z"/>',
  person: '<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
  career: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12l9 4 9-4m-9 2v4"/>',
  leaf: '<path d="M20 3C7 3 2 8 4 15c2 7 16 5 16-12zM4 21l11-11"/>',
  sparkle: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
};
const icon = (name, extra = '') => `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${icons[name] || icons.grid}</svg>`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = esc;
const uuidPath = (value) => encodeURIComponent(value);
const storage = { get: (key) => { try { return localStorage.getItem(key); } catch { return null; } }, set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* Preferences are optional. */ } } };
const rows = (name) => state.data?.[name] || [];
const byId = (name, id) => rows(name).find((row) => row.id === id);
const number = (value, digits = 2) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(Number(value));
const money = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
const fmtDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : 'Sem prazo';
function today() {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: state.user?.fuso_horario || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}
function monthBounds(month = state.month || today().slice(0, 7)) {
  const [y, m] = month.split('-').map(Number);
  return [month + '-01', `${y}-${String(m).padStart(2, '0')}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`];
}
function periodFor(indicator) {
  const month = state.month || today().slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const end = (year, lastMonth) => `${year}-${String(lastMonth).padStart(2, '0')}-${new Date(Date.UTC(year, lastMonth, 0)).getUTCDate()}`;
  if (indicator.frequencia === 'anual') return [`${y}-01-01`, `${y}-12-31`];
  if (indicator.frequencia === 'semestral') { const first = m <= 6 ? 1 : 7; return [`${y}-${String(first).padStart(2, '0')}-01`, end(y, first + 5)]; }
  if (indicator.frequencia === 'trimestral') { const first = Math.floor((m - 1) / 3) * 3 + 1; return [`${y}-${String(first).padStart(2, '0')}-01`, end(y, first + 2)]; }
  const base = month === today().slice(0, 7) ? today() : month + '-01';
  if (indicator.frequencia === 'diaria') return [base, base];
  if (indicator.frequencia === 'semanal') { const first = new Date(base + 'T12:00:00Z'); first.setUTCDate(first.getUTCDate() - (first.getUTCDay() + 6) % 7); const last = new Date(first); last.setUTCDate(last.getUTCDate() + 6); return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)]; }
  if (indicator.frequencia === 'pontual') { const due = byId('objetivos', indicator.objetivo_id)?.data_limite; if (due) return [due.slice(0, 4) + '-01-01', due]; }
  return monthBounds(month);
}
const labels = {
  ativo: 'Ativo', ativa: 'Ativa', rascunho: 'Rascunho', concluido: 'Concluído', concluida: 'Concluída', arquivado: 'Arquivado',
  planejado: 'Planejado', planejada: 'Planejada', em_andamento: 'Em andamento', pausado: 'Pausado', pausada: 'Pausada', pendente: 'Pendente', cancelada: 'Cancelada', cancelado: 'Cancelado',
  diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', pontual: 'Pontual', livre: 'Livre', extraordinaria: 'Extraordinária',
  numero: 'Número', booleano: 'Sim / não', texto: 'Avaliação textual', minimo: 'Pelo menos', maximo: 'No máximo', faixa: 'Dentro de uma faixa', igual: 'Igual a', avaliar: 'Avaliação qualitativa', acompanhar: 'Acompanhar sem alvo',
  sem_resultado: 'Sem resultado', atingida: 'Atingida', nao_atingida: 'Não atingida', aguarda_avaliacao: 'Aguardando avaliação', acompanhamento: 'Acompanhamento',
  receita: 'Receita', despesa: 'Despesa', aporte: 'Aporte', resgate: 'Resgate', previsto: 'Previsto', realizado: 'Realizado',
  projeto: 'Projeto', experimento_carreira: 'Experimento de carreira', habito: 'Hábito', experiencia: 'Experiência', outro: 'Outro', minima: 'Mínima', padrao: 'Padrão', opcional: 'Opcional',
  valor: 'Valor pessoal', forca: 'Força', oportunidade: 'Oportunidade', ponto_desenvolvimento: 'Ponto de desenvolvimento', ameaca: 'Ameaça', prioridade: 'Prioridade', risco: 'Risco',
  reflexao: 'Reflexão', registro_cognitivo: 'Registro de pensamentos', experimento: 'Experimento', carreira: 'Carreira', independencia_financeira: 'Independência financeira', imovel: 'Imóvel',
};
const label = (value) => labels[value] || value || '';
const unitLabels = {
  '%': '%', horas: 'horas', experiencias: 'experiências', revisoes: 'revisões',
  momentos: 'momentos', conversas: 'conversas', encontros: 'encontros',
  avaliacao: 'avaliação', sim_nao: 'sim/não', experimentos: 'experimentos',
  entregas: 'entregas', dias: 'dias', horas_por_noite: 'h/noite',
  escala_0_10: 'pontos de 0 a 10', BRL: 'R$', meses: 'meses', unidades: 'unidades',
};
const unitLabel = (value) => unitLabels[value] || value || '';
const enums = (...values) => values.map((value) => [value, label(value)]);
const badge = (status) => `<span class="badge ${['atingida', 'concluida', 'concluido', 'realizado', 'ativo'].includes(status) ? 'good' : ['nao_atingida', 'cancelada', 'cancelado'].includes(status) ? 'bad' : ['em_andamento', 'aguarda_avaliacao', 'previsto'].includes(status) ? 'warn' : 'neutral'}">${esc(label(status))}</span>`;
const actionButton = (action, title, iconName, data = '', css = '') => `<button type="button" class="icon-button ${css}" data-action="${action}" ${data} aria-label="${attr(title)}" title="${attr(title)}">${icon(iconName)}</button>`;
const createButton = (resource, title, extra = '') => `<button type="button" class="button" data-action="create" data-resource="${resource}" ${extra}>${icon('plus')}${esc(title)}</button>`;

async function api(path, { method = 'GET', body } = {}) {
  const options = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body !== undefined || ['POST', 'PATCH', 'DELETE'].includes(method)) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body ?? {});
  }
  let response;
  try { response = await fetch(path, options); } catch { throw Object.assign(new Error('Não foi possível conectar. Confira sua conexão e atualize a página para renovar a sessão.'), { status: 0 }); }
  if (!response.headers.get('content-type')?.includes('application/json')) throw Object.assign(new Error('Sua sessão precisa ser renovada. Atualize a página para entrar novamente.'), { status: 401 });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Não foi possível concluir a operação.'), { status: response.status, code: data.code, details: data.details });
  return data;
}
const resourceUrl = (resource, id) => `/api/plans/${uuidPath(state.planId)}/${resource}${id ? '/' + uuidPath(id) : ''}`;
function toast(message, error = false) {
  const region = document.getElementById('toast-region');
  clearTimeout(toastTimer);
  region.innerHTML = `<div class="toast${error ? ' error' : ''}">${esc(message)}</div>`;
  toastTimer = setTimeout(() => { region.replaceChildren(); }, error ? 8000 : 4500);
}
async function refreshSnapshot() {
  state.data = await api(`/api/plans/${uuidPath(state.planId)}/snapshot`);
  const i = state.plans.findIndex((p) => p.id === state.planId);
  if (i >= 0) state.plans[i] = state.data.plan;
}
async function afterMutation(message) {
  state.refreshing = true;
  app.setAttribute('aria-busy', 'true');
  try { await refreshSnapshot(); render(); toast(message); }
  catch (error) { toast(`${message} A lista não pôde ser atualizada: ${error.message}`, true); }
  finally { state.refreshing = false; app.setAttribute('aria-busy', 'false'); }
}
async function start() {
  try {
    const boot = await api('/api/bootstrap');
    state.user = boot.user; state.plans = boot.plans || []; state.templates = boot.templates || []; state.authMode = boot.authMode;
    state.month = today().slice(0, 7);
    const preferred = storage.get('bsc-plan');
    state.planId = state.plans.find((p) => p.id === preferred)?.id || state.plans[0]?.id;
    state.view = ['dashboard', 'objectives', 'metrics', 'tasks', 'finance', 'reviews', 'plan', 'more'].includes(storage.get('bsc-view')) ? storage.get('bsc-view') : 'dashboard';
    if (state.planId) await refreshSnapshot();
    render();
  } catch (error) { renderError(error); }
}

function renderError(error) {
  app.setAttribute('aria-busy', 'false');
  app.innerHTML = `<main class="initial-screen"><div class="error-screen"><div class="brand-symbol" aria-hidden="true">b.</div><span class="eyebrow">BSC pessoal</span><h1>${error.status === 401 ? 'Vamos renovar sua sessão' : 'Ainda não conseguimos abrir seu planejamento'}</h1><p>${esc(error.message)}</p>${error.status === 503 ? '<div class="setup-details"><strong>Primeiro acesso?</strong><p>Quem publicou este aplicativo precisa concluir a conexão com o banco e a configuração do acesso. As instruções estão no README do projeto.</p></div>' : ''}<button class="button" data-action="reload">${icon('review')}Tentar novamente</button></div></main>`;
}
const navItems = [ ['dashboard', 'Visão geral', 'grid'], ['objectives', 'Objetivos', 'target'], ['metrics', 'Metas e resultados', 'chart'], ['tasks', 'Tarefas', 'tasks'], ['finance', 'Finanças', 'wallet'], ['reviews', 'Revisões', 'review'], ['plan', 'Meu plano', 'book'], ['more', 'Mais registros', 'more'] ];
function render() {
  app.setAttribute('aria-busy', 'false');
  if (!state.planId || !state.data) { renderOnboarding(); return; }
  const name = state.user?.nome || 'Minha conta';
  const initial = name.split(/\s+/).filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase();
  const current = navItems.find((item) => item[0] === state.view);
  const pending = rows('tarefas').filter((t) => ['pendente', 'em_andamento'].includes(t.status)).length;
  app.innerHTML = `<div class="app-shell">
    <div class="mobile-overlay${state.mobileOpen ? ' open' : ''}" data-action="toggle-menu"></div>
    <aside class="sidebar${state.mobileOpen ? ' open' : ''}" aria-label="Menu principal">
      <div class="brand"><div class="brand-symbol" aria-hidden="true">b.</div><div><div class="brand-name">BSC pessoal</div><div class="brand-caption">Planejar para viver</div></div></div>
      <div class="nav-label">MEU PLANEJAMENTO</div>
      <nav class="nav-group">${navItems.map(([key, title, image]) => `<button class="nav-button${state.view === key ? ' active' : ''}" data-action="navigate" data-view="${key}" ${state.view === key ? 'aria-current="page"' : ''}>${icon(image)}<span>${title}</span>${key === 'tasks' && pending ? `<span class="badge">${pending}</span>` : ''}</button>`).join('')}</nav>
      <div class="sidebar-bottom"><div class="sidebar-note"><strong>Um passo de cada vez.</strong>Seu plano pode mudar junto com você.</div><div class="account"><div class="avatar" aria-hidden="true">${esc(initial)}</div><div><div class="account-name">${esc(name)}</div><div class="account-details">${state.authMode === 'local' ? 'Ambiente local' : 'Seu espaço pessoal'}</div></div></div>${state.authMode !== 'local' ? '<a class="signout" href="/cdn-cgi/access/logout">Sair da conta</a>' : ''}</div>
    </aside>
    <div class="workspace"><header class="topbar"><div class="topbar-leading"><button class="icon-button menu-button" data-action="toggle-menu" aria-label="Abrir menu" aria-expanded="${state.mobileOpen}">${icon('menu')}</button><div class="breadcrumb">Meu espaço <span>/ ${current[1]}</span></div></div><div class="topbar-right"><span class="connection-pill"><span class="connection-dot"></span>${state.authMode === 'local' ? 'Ambiente local' : 'Conectado ao seu espaço'}</span><label class="sr-only" for="plan-switch">Plano atual</label><select id="plan-switch" class="plan-select" aria-label="Plano atual">${state.plans.map((p) => `<option value="${attr(p.id)}"${p.id === state.planId ? ' selected' : ''}>${esc(p.titulo)}</option>`).join('')}</select>${actionButton('new-plan', 'Criar outro plano', 'plus')}</div></header>
    <main id="main" class="content" tabindex="-1">${state.authMode === 'local' ? '<div class="status-banner info">'+icon('info')+'<p>Modo local: você está usando os dados de teste deste computador.</p></div>' : ''}${renderView()}</main></div></div>`;
}
function renderView() {
  switch (state.view) {
    case 'objectives': return objectivesView();
    case 'metrics': return metricsView();
    case 'tasks': return tasksView();
    case 'finance': return financeView();
    case 'reviews': return reviewsView();
    case 'plan': return planView();
    case 'more': return moreView();
    default: return dashboardView();
  }
}
function heading(title, subtitle, actions = '', eyebrow = 'Seu planejamento pessoal') {
  return `<div class="page-heading"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1><p class="page-description">${esc(subtitle)}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>`;
}
function emptyState(title, description, button = '', compact = false, image = 'leaf') {
  return `<div class="empty-state${compact ? ' compact' : ''}"><div class="empty-icon">${icon(image)}</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${button}</div>`;
}
function monthInput() { return `<label class="toolbar-label">Período <input class="input small-input" id="month-filter" type="month" value="${attr(state.month)}" aria-label="Mês de referência"></label>`; }
function searchInput(placeholder) { return `<div class="search-wrap">${icon('search')}<input id="search" type="search" value="${attr(state.search)}" placeholder="${attr(placeholder)}" aria-label="${attr(placeholder)}"></div>`; }
function includesSearch(row, fields) { const query = state.search.toLocaleLowerCase('pt-BR').trim(); return !query || fields.some((field) => String(row[field] || '').toLocaleLowerCase('pt-BR').includes(query)); }
function resourceActions(resource, row) { return `<div class="data-card-actions">${actionButton('edit', 'Editar', 'edit', `data-resource="${resource}" data-id="${attr(row.id)}"`)}${actionButton('delete', 'Excluir', 'trash', `data-resource="${resource}" data-id="${attr(row.id)}"`, 'delete')}</div>`; }

function dashboardView() {
  const goals = rows('objetivos').filter((o) => o.status !== 'arquivado');
  const allTasks = rows('tarefas').filter((t) => t.status !== 'cancelada');
  const doneTasks = allTasks.filter((t) => t.status === 'concluida');
  const metrics = rows('scorecard').filter((m) => !state.month || m.periodo_fim.startsWith(state.month));
  const measured = metrics.filter((m) => m.situacao !== 'sem_resultado');
  const achieved = metrics.filter((m) => m.situacao === 'atingida');
  const todo = allTasks.filter((t) => t.status !== 'concluida').sort((a, b) => (a.data_limite || '9999').localeCompare(b.data_limite || '9999')).slice(0, 4);
  const firstName = (state.user?.nome || '').split(' ')[0];
  const stats = [ ['Objetivos em foco', goals.length, 'Nas suas perspectivas de vida', 'target'], ['Tarefas concluídas', doneTasks.length, `${allTasks.length} tarefas no planejamento`, 'tasks'], ['Resultados registrados', measured.length, `${metrics.length} metas com término no período`, 'chart'], ['Metas atingidas', achieved.length, 'Cada indicador tem seu próprio critério', 'leaf'] ];
  const shortAreaNames = { P: 'Vida pessoal', R: 'Relacionamentos', C: 'Carreira', S: 'Saúde e bem-estar', F: 'Finanças' };
  const areaIcons = { P: 'person', R: 'heart', C: 'career', S: 'leaf', F: 'wallet' };
  return heading(firstName ? `Olá, ${firstName}. Vamos ao próximo passo?` : 'Vamos ao próximo passo?', 'Acompanhe o que importa e ajuste o plano ao ritmo da sua vida.', monthInput(), 'Visão geral') +
    `<div class="stats-grid">${stats.map(([title, value, caption, image]) => `<div class="stat-card"><div class="stat-top"><span class="stat-title">${title}</span><span class="stat-icon">${icon(image)}</span></div><div class="stat-value">${value}</div><div class="stat-caption">${caption}</div></div>`).join('')}</div>
    <section aria-labelledby="perspectives-title"><div class="section-heading"><div><h2 id="perspectives-title">Suas perspectivas</h2><p class="section-caption">Um olhar para cada área da sua vida</p></div><button class="button ghost" data-action="navigate" data-view="objectives">Ver objetivos ${icon('arrow')}</button></div>
    ${rows('perspectivas').length ? `<div class="perspective-grid">${rows('perspectivas').map((a) => { const areaGoals = goals.filter((o) => o.perspectiva_id === a.id); const completed = areaGoals.filter((o) => o.status === 'concluido').length; const met = metrics.filter((m) => m.perspectiva_id === a.id); const recorded = met.filter((m) => m.situacao !== 'sem_resultado').length; return `<article class="perspective-card"><div class="perspective-top"><span class="area-symbol ${['P','R','C','S','F'].includes(a.codigo) ? a.codigo : ''}">${icon(areaIcons[a.codigo] || 'leaf')}</span><div><div class="perspective-name">${esc(shortAreaNames[a.codigo] || a.nome)}</div><div class="perspective-code">${areaGoals.length} objetivos</div></div></div><div class="perspective-number">${completed} <span>de ${areaGoals.length} concluídos</span></div><div class="perspective-caption">Avanço dos objetivos</div><div class="progress-track" aria-label="${completed} de ${areaGoals.length} objetivos concluídos">${areaGoals.length ? areaGoals.map((g) => `<span class="progress-segment${g.status === 'concluido' ? ' done' : ''}"></span>`).join('') : '<span class="progress-segment"></span>'}</div><div class="perspective-bottom"><span>${recorded ? recorded + (recorded === 1 ? ' resultado no período' : ' resultados no período') : 'Ainda sem resultados'}</span><button data-action="area-goals" data-id="${attr(a.id)}">Abrir ${icon('arrow', 'width="12" height="12"')}</button></div></article>`; }).join('')}</div>` : emptyState('Quais áreas importam para você?', 'Adicione perspectivas para organizar seus objetivos.', createButton('perspectivas', 'Adicionar perspectiva'))}</section>
    <div class="dashboard-bottom"><section class="panel"><div class="section-heading"><div><h2>Próximas ações</h2><p class="section-caption">Pequenos passos que colocam o plano em movimento</p></div><button class="button ghost" data-action="navigate" data-view="tasks">Ver todas ${icon('arrow')}</button></div>${todo.length ? todo.map(taskRow).join('') : emptyState('Tudo em dia por aqui', 'Escolha uma pequena ação para o seu próximo passo.', createButton('tarefas', 'Criar tarefa'), true, 'tasks')}</section><section class="panel"><div class="section-heading"><div><h2>Uma pausa para revisar</h2><p class="section-caption">Clareza também vem de olhar para trás</p></div></div><div class="review-prompt"><div class="prompt-icon">${icon('leaf')}</div><h3>O que aproximou você da vida que deseja?</h3><p>Registre o que funcionou, o que consumiu energia e o que pode ficar mais simples.</p><button class="button secondary" data-action="create" data-resource="revisoes">${icon('review')}Fazer uma revisão</button></div></section></div>
    <div class="footer-note">Seu planejamento é um guia. Ajustar o caminho também é avançar.</div>`;
}

function objectivesView() {
  const filter = `<label class="toolbar-label">Perspectiva <select class="input small-input" id="resource-filter"><option value="">Todas</option>${rows('perspectivas').map((p) => `<option value="${attr(p.id)}"${state.filter === p.id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>`;
  const data = rows('objetivos').filter((o) => (!state.filter || o.perspectiva_id === state.filter) && includesSearch(o, ['titulo', 'codigo', 'descricao']));
  let body = '';
  for (const area of rows('perspectivas')) {
    const goals = data.filter((o) => o.perspectiva_id === area.id);
    if (!goals.length) continue;
    body += `<div class="group-label">${icon('target')} ${esc(area.nome)} <span class="badge">${goals.length}</span></div><div class="data-list">${goals.map((goal) => `<article class="data-card"><div class="data-card-heading"><div><h3 class="data-card-title">${esc(goal.codigo)} · ${esc(goal.titulo)}</h3><div class="data-card-meta">${badge(goal.status)}<span>Prioridade ${goal.prioridade}</span>${goal.data_limite ? `<span>Até ${fmtDate(goal.data_limite)}</span>` : ''}</div></div>${resourceActions('objetivos', goal)}</div>${goal.descricao ? `<p class="data-card-description">${esc(goal.descricao)}</p>` : ''}<div class="objective-kpis">${rows('indicadores').filter((i) => i.objetivo_id === goal.id).map((i) => `<div class="kpi-row"><span class="kpi-row-name">${icon('chart')}<span>${esc(i.nome)} <span class="muted">· ${esc(label(i.frequencia))}${i.ativo ? '' : ' · Inativo'}</span></span></span><span class="table-actions">${actionButton('new-target', 'Criar meta para este indicador', 'plus', `data-id="${attr(i.id)}"`)}${actionButton('edit', 'Editar indicador', 'edit', `data-resource="indicadores" data-id="${attr(i.id)}"`)}${actionButton('delete', 'Excluir indicador', 'trash', `data-resource="indicadores" data-id="${attr(i.id)}"`, 'delete')}</span></div>`).join('')}<button class="button ghost small-button" data-action="create" data-resource="indicadores" data-goal="${attr(goal.id)}">${icon('plus')}Adicionar indicador</button></div></article>`).join('')}</div>`;
  }
  return heading('Objetivos que fazem sentido', 'Organize suas prioridades e escolha como acompanhar cada uma.', createButton('objetivos', 'Novo objetivo'), 'Objetivos') + `<div class="toolbar">${searchInput('Buscar objetivo…')}${filter}<span class="selection-count">${data.length} objetivos</span></div>` + (body || emptyState('Nenhum objetivo por aqui', state.search || state.filter ? 'Ajuste os filtros para encontrar outros objetivos.' : 'Comece com um objetivo concreto para uma área da sua vida.', createButton('objetivos', 'Criar objetivo'), false, 'target'));
}
function targetLabel(meta) {
  if (meta.regra === 'minimo') return `≥ ${number(meta.valor_minimo)} ${unitLabel(meta.unidade)}`;
  if (meta.regra === 'maximo') return `≤ ${number(meta.valor_maximo)} ${unitLabel(meta.unidade)}`;
  if (meta.regra === 'faixa') return `${number(meta.valor_minimo)}–${number(meta.valor_maximo)} ${unitLabel(meta.unidade)}`;
  if (meta.regra === 'igual') return meta.tipo_valor === 'booleano' ? (meta.valor_minimo === 1 ? 'Sim / concluído' : 'Não') : `${number(meta.valor_minimo)} ${unitLabel(meta.unidade)}`;
  return label(meta.regra);
}
function metricsView() {
  const data = rows('metas_indicador').filter((m) => (!state.month || m.periodo_fim.startsWith(state.month)) && (!state.filter || m.indicador_id === state.filter) && includesSearch({ nome: byId('indicadores', m.indicador_id)?.nome, descricao: m.descricao }, ['nome', 'descricao'])).sort((a, b) => b.periodo_fim.localeCompare(a.periodo_fim) || b.periodo_inicio.localeCompare(a.periodo_inicio) || (byId('indicadores', a.indicador_id)?.codigo || '').localeCompare(byId('indicadores', b.indicador_id)?.codigo || '', 'pt-BR', { numeric: true }));
  const filter = `<label class="toolbar-label">Indicador <select class="input small-input" id="resource-filter"><option value="">Todos</option>${rows('indicadores').map((i) => `<option value="${attr(i.id)}"${state.filter === i.id ? ' selected' : ''}>${esc(i.codigo)} · ${esc(i.nome)}</option>`).join('')}</select></label>`;
  return heading('Metas e resultados', 'Defina um período, registre o que aconteceu e acompanhe sua evolução.', `<button class="button secondary" data-action="prepare-month">${icon('calendar')}Preparar mês</button>${createButton('metas_indicador', 'Nova meta')}`, 'Acompanhamento') + `<div class="toolbar">${searchInput('Buscar indicador…')}${monthInput()}<button class="filter-chip${!state.month ? ' active' : ''}" data-action="all-periods">Todos os períodos</button></div><div class="toolbar">${filter}<span class="selection-count">${data.length} metas${state.month ? ' · término no mês selecionado' : ''}</span></div>` +
    (data.length ? `<div class="table-wrap"><table><thead><tr><th>Indicador / período</th><th>Meta</th><th>Resultado</th><th>Situação</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${data.map((m) => { const i = byId('indicadores', m.indicador_id); const result = rows('resultados_indicador').find((r) => r.meta_id === m.id); const status = rows('scorecard').find((s) => s.meta_id === m.id)?.situacao || 'sem_resultado'; return `<tr><td><span class="cell-title">${esc(i?.nome || 'Indicador')}</span><span class="cell-sub">${fmtDate(m.periodo_inicio)} – ${fmtDate(m.periodo_fim)}</span></td><td><span>${esc(targetLabel(m))}</span><span class="cell-sub">${esc(m.descricao)}</span></td><td>${result ? `<span class="result-value">${esc(m.tipo_valor === 'texto' ? (result.valor_texto.length > 70 ? result.valor_texto.slice(0, 70) + '…' : result.valor_texto) : m.tipo_valor === 'booleano' ? (result.valor_numerico === 1 ? 'Sim' : 'Não') : number(result.valor_numerico))}</span>` : '<span class="result-empty">Não preenchido</span>'}</td><td>${badge(status)}</td><td><div class="table-actions"><button class="button secondary small-button" data-action="result" data-id="${attr(m.id)}">${result ? 'Editar resultado' : 'Registrar resultado'}</button>${result ? actionButton('historical-meta', 'Meta preservada no histórico', 'lock') : actionButton('edit', 'Editar meta', 'edit', `data-resource="metas_indicador" data-id="${attr(m.id)}"`)}${!result ? actionButton('delete', 'Excluir meta sem resultado', 'trash', `data-resource="metas_indicador" data-id="${attr(m.id)}"`, 'delete') : ''}</div></td></tr>`; }).join('')}</tbody></table></div><p class="model-note">Cada meta mantém sua regra e seu período. Depois de registrar um resultado, a definição da meta fica preservada no histórico.</p>` : emptyState('Pronto para acompanhar seu próximo passo?', 'Use Preparar mês para criar as metas dos indicadores mensais com suas sugestões. Para metas semanais, anuais ou pontuais, escolha Nova meta.', createButton('metas_indicador', 'Criar primeira meta'), false, 'chart'));
}
function taskRow(task) {
  return `<div class="task-row"><button class="task-check${task.status === 'concluida' ? ' completed' : ''}" data-action="toggle-task" data-id="${attr(task.id)}" aria-label="${task.status === 'concluida' ? 'Reabrir' : 'Concluir'} tarefa: ${attr(task.titulo)}">${task.status === 'concluida' ? icon('check') : ''}</button><div class="task-body"><span class="task-title${task.status === 'concluida' ? ' completed' : ''}">${esc(task.titulo)}</span><div class="task-meta">${task.grupo ? `<span>${esc(task.grupo)}</span>` : ''}${task.objetivo_id ? `<span>${esc(byId('objetivos', task.objetivo_id)?.codigo || '')}</span>` : ''}<span>Prioridade ${task.prioridade}</span></div></div><span class="task-date${task.data_limite && task.data_limite < today() && task.status !== 'concluida' ? ' overdue' : ''}">${fmtDate(task.data_limite)}</span>${actionButton('edit', 'Editar tarefa', 'edit', `data-resource="tarefas" data-id="${attr(task.id)}"`)}</div>`;
}
function tasksView() {
  const data = rows('tarefas').filter((t) => (!state.filter || t.status === state.filter) && includesSearch(t, ['titulo', 'descricao', 'grupo'])).sort((a, b) => (a.data_limite || '9999').localeCompare(b.data_limite || '9999'));
  return heading('Uma ação de cada vez', 'Tire seus objetivos do papel com tarefas claras e possíveis.', createButton('tarefas', 'Nova tarefa'), 'Tarefas') + `<div class="toolbar">${searchInput('Buscar tarefa…')}<label class="toolbar-label">Status <select class="input small-input" id="resource-filter"><option value="">Todos</option>${enums('pendente', 'em_andamento', 'concluida', 'cancelada').map(([v, l]) => `<option value="${v}"${state.filter === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label><span class="selection-count">${data.length} tarefas</span></div>` + (data.length ? `<div class="panel">${data.map(taskRow).join('')}</div>` : emptyState('Nenhuma tarefa neste filtro', 'Adicione uma ação pequena, com prazo e prioridade, ou ajuste a seleção.', createButton('tarefas', 'Criar tarefa'), false, 'tasks'));
}

function financeView() {
  const categories = state.tab === 'categories';
  const tx = rows('lancamentos_financeiros').filter((t) => (!state.month || t.data_lancamento.startsWith(state.month)) && includesSearch(t, ['descricao']));
  const actual = tx.filter((t) => t.status === 'realizado');
  const totals = Object.fromEntries(['receita', 'despesa', 'aporte', 'resgate'].map((type) => [type, actual.filter((t) => t.tipo === type).reduce((n, t) => n + t.valor_centavos, 0)]));
  const stats = [ ['Receitas realizadas', totals.receita, 'Entradas confirmadas', 'wallet'], ['Despesas realizadas', totals.despesa, 'Saídas de consumo confirmadas', 'tasks'], ['Saldo de receitas e despesas', totals.receita - totals.despesa, 'Antes de aportes e resgates', 'chart'], ['Aportes realizados', totals.aporte, 'Transferências para investimentos', 'leaf'] ];
  return heading('Finanças com mais clareza', 'Registre o que entrou, o que saiu e o que você está construindo.', createButton(categories ? 'categorias_financeiras' : 'lancamentos_financeiros', categories ? 'Nova categoria' : 'Novo lançamento'), 'Finanças') + `<div class="tab-bar"><button class="tab${!categories ? ' active' : ''}" data-action="tab" data-tab="transactions">Lançamentos</button><button class="tab${categories ? ' active' : ''}" data-action="tab" data-tab="categories">Categorias</button></div>` + (categories ? genericList('categorias_financeiras') : `<div class="toolbar">${searchInput('Buscar lançamento…')}${monthInput()}<button class="filter-chip${!state.month ? ' active' : ''}" data-action="all-periods">Todos os períodos</button></div><div class="stats-grid">${stats.map(([title, value, caption, image]) => `<div class="stat-card"><div class="stat-top"><span class="stat-title">${title}</span><span class="stat-icon">${icon(image)}</span></div><div class="stat-value" style="font-size:22px">${esc(money(value))}</div><div class="stat-caption">${caption}</div></div>`).join('')}</div>${tx.length ? `<div class="table-wrap"><table><thead><tr><th>Lançamento</th><th>Tipo</th><th>Valor</th><th>Data</th><th>Status</th><th></th></tr></thead><tbody>${tx.sort((a, b) => b.data_lancamento.localeCompare(a.data_lancamento)).map((t) => `<tr><td><span class="cell-title">${esc(t.descricao)}</span><span class="cell-sub">${esc(byId('categorias_financeiras', t.categoria_id)?.nome || 'Sem categoria')}${t.essencial ? ' · Essencial' : ''}</span></td><td>${esc(label(t.tipo))}</td><td class="result-value ${t.tipo === 'receita' ? 'finance-positive' : t.tipo === 'despesa' ? 'finance-negative' : ''}">${esc(money(t.valor_centavos))}</td><td class="nowrap">${fmtDate(t.data_lancamento)}</td><td>${badge(t.status)}</td><td>${resourceActions('lancamentos_financeiros', t)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Seu orçamento começa com o primeiro registro', 'Cadastre receitas e despesas. Separe o que está previsto do que já foi realizado.', createButton('lancamentos_financeiros', 'Registrar lançamento'), false, 'wallet')}<p class="model-note">Os cartões consideram apenas lançamentos realizados. Aportes e resgates são transferências; não entram como receita ou despesa de consumo.</p>`);
}
function reviewsView() {
  return heading('Revisar para seguir melhor', 'O que funcionou? O que custou energia? O que você quer simplificar?', createButton('revisoes', 'Nova revisão'), 'Revisões') + `<div class="toolbar">${searchInput('Buscar nas revisões…')}</div>` + genericList('revisoes');
}
function planView() {
  const p = state.data.plan;
  return heading('O plano é seu', 'Revise sua direção e mantenha espaço para o que faz sentido agora.', `<button class="button secondary" data-action="export">${icon('download')}Exportar meus dados</button><button class="button" data-action="edit-plan">${icon('edit')}Editar plano</button>`, 'Meu plano') + `<div class="form-section"><div class="section-heading"><div><h2>${esc(p.titulo)}</h2><p class="muted small">Horizonte ${p.ano_inicio}–${p.ano_fim}</p></div>${badge(p.status)}</div><div class="form-grid"><div class="field full"><span class="field-label">Minha missão</span><p class="prewrap small muted">${esc(p.missao || 'O que dá sentido à sua vida? Edite o plano para registrar sua missão.')}</p></div><div class="field full"><span class="field-label">Minha visão de futuro</span><p class="prewrap small muted">${esc(p.visao || 'Como você gostaria de viver no futuro?')}</p></div>${p.diagnostico ? `<div class="field full"><span class="field-label">Meu ponto de partida</span><p class="prewrap small muted">${esc(p.diagnostico)}</p></div>` : ''}</div></div><div class="section-heading"><h2>Perspectivas do plano</h2>${createButton('perspectivas', 'Nova perspectiva')}</div>${genericList('perspectivas')}<div class="subsection form-section"><div class="section-heading"><h2>Minha conta</h2><button class="button secondary" data-action="edit-profile">Editar perfil</button></div><p class="small muted">${esc(state.user.nome)}${state.user.email ? ' · ' + esc(state.user.email) : ''}<br>Fuso horário: ${esc(state.user.fuso_horario)}</p></div><div class="form-actions"><button class="text-link" data-action="new-plan">Criar outro plano</button></div>`;
}
const moreTabs = [ ['iniciativas', 'Iniciativas'], ['rotinas', 'Rotina'], ['itens_estrategicos', 'Estratégia'], ['registros_pessoais', 'Diário'], ['ciclos', 'Ciclos'], ['simulacoes', 'Simulações'] ];
function moreView() {
  const resource = moreTabs.some(([key]) => key === state.tab) ? state.tab : 'iniciativas';
  const texts = {
    iniciativas: ['Projetos e experiências', 'Organize iniciativas que ajudam seus objetivos a acontecer.', 'Nova iniciativa'],
    rotinas: ['Sua semana, com espaço para viver', 'Planeje blocos de tempo sem preencher todos os espaços disponíveis.', 'Novo bloco'],
    itens_estrategicos: ['O que orienta suas escolhas', 'Registre valores, prioridades, forças, oportunidades e riscos.', 'Novo item'],
    registros_pessoais: ['Seu espaço de reflexão', 'Guarde experiências, aprendizados e pensamentos que merecem atenção.', 'Novo registro'],
    ciclos: ['Cada fase tem seu momento', 'Divida o planejamento em ciclos com direção e margem para ajustes.', 'Novo ciclo'],
    simulacoes: ['Explore possibilidades', 'Compare hipóteses antes de transformá-las em decisões.', 'Nova simulação'],
  };
  const [title, description, button] = texts[resource];
  return heading(title, description, createButton(resource, button), 'Mais registros') + `<div class="tab-bar">${moreTabs.map(([key, text]) => `<button class="tab${key === resource ? ' active' : ''}" data-action="tab" data-tab="${key}">${text}</button>`).join('')}</div><div class="toolbar">${searchInput('Buscar registro…')}</div>` + genericList(resource);
}
function genericList(resource) {
  let data = rows(resource).filter((r) => includesSearch(r, ['titulo', 'nome', 'descricao', 'conteudo', 'decisoes', 'aproximou_da_visao', 'consumiu_energia', 'simplificar_proximo_periodo']));
  if (resource === 'rotinas') data = data.slice().sort((a, b) => ((a.dia_semana + 6) % 7) - ((b.dia_semana + 6) % 7) || (a.horario_local || '').localeCompare(b.horario_local || ''));
  if (resource === 'revisoes') data = data.slice().sort((a, b) => b.data_revisao.localeCompare(a.data_revisao));
  if (resource === 'registros_pessoais') data = data.slice().sort((a, b) => b.data_registro.localeCompare(a.data_registro));
  if (!data.length) return emptyState('Ainda não há registros aqui', state.search ? 'Tente outro termo de busca.' : 'Comece com o que for útil para você. Os demais campos podem esperar.', createButton(resource, 'Adicionar registro'), false, resource === 'revisoes' ? 'review' : 'book');
  return `<div class="data-list">${data.map((r) => {
    let title = r.titulo || r.nome || (resource === 'revisoes' ? `Revisão ${label(r.frequencia).toLowerCase()} · ${fmtDate(r.data_revisao)}` : 'Registro');
    let meta = [];
    let description = r.descricao || r.conteudo || '';
    if (r.status) meta.push(badge(r.status));
    if (r.tipo) meta.push(`<span>${esc(label(r.tipo))}</span>`);
    if (r.objetivo_id) meta.push(`<span>${esc(byId('objetivos', r.objetivo_id)?.codigo || '')}</span>`);
    if (resource === 'perspectivas') meta.push(`<span>Código ${esc(r.codigo)} · ordem ${r.ordem}</span>`);
    if (resource === 'categorias_financeiras') meta.push(`<span>${r.ativa ? 'Ativa' : 'Inativa'}</span>`);
    if (resource === 'ciclos') meta.push(`<span>${fmtDate(r.data_inicio)} – ${fmtDate(r.data_fim)}</span>`);
    if (resource === 'registros_pessoais') meta.push(`<span>${fmtDate(r.data_registro)}</span>`);
    if (resource === 'rotinas') { meta.push(`<span>${['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'][r.dia_semana]}${r.horario_local ? ' · '+esc(r.horario_local) : ''}${r.duracao_minutos ? ' · '+r.duracao_minutos+' min' : ''}</span>`, `<span>${esc(label(r.flexibilidade))}${r.ativa ? '' : ' · Inativa'}</span>`); description = r.observacoes || ''; }
    if (resource === 'revisoes') { meta.push(`<span>${fmtDate(r.periodo_inicio)} – ${fmtDate(r.periodo_fim)}</span>`); description = [r.aproximou_da_visao && 'O que funcionou: '+r.aproximou_da_visao, r.consumiu_energia && 'O que consumiu energia: '+r.consumiu_energia, r.simplificar_proximo_periodo && 'O que simplificar: '+r.simplificar_proximo_periodo, r.decisoes && 'Decisões: '+r.decisoes].filter(Boolean).join('\n\n'); }
    if (resource === 'itens_estrategicos') description = [r.descricao, r.prevencao && 'Prevenção: '+r.prevencao, r.contingencia && 'Se acontecer: '+r.contingencia].filter(Boolean).join('\n\n');
    if (resource === 'simulacoes') { const params = parseJSON(r.parametros_json); if (r.tipo === 'independencia_financeira' && params.renda_mensal_centavos && params.taxa_retirada_anual_percentual > 0) { description = `Renda mensal desejada: ${money(params.renda_mensal_centavos)}\nTaxa anual hipotética: ${number(params.taxa_retirada_anual_percentual)}%\nPatrimônio de referência: ${money(Math.round(params.renda_mensal_centavos * 12 / (params.taxa_retirada_anual_percentual / 100)))}\n\nEstimativa ilustrativa, sem promessa de rendimento ou duração do patrimônio.${r.observacoes ? '\n\n'+r.observacoes : ''}`; } else description = r.observacoes || 'Hipóteses salvas para comparar possibilidades.'; }
    return `<article class="data-card"><div class="data-card-heading"><div><h3 class="data-card-title">${esc(title)}</h3><div class="data-card-meta">${meta.join('')}</div></div>${resourceActions(resource, r)}</div>${description ? `<p class="data-card-description">${esc(description)}</p>` : ''}</article>`;
  }).join('')}</div>`;
}

function renderOnboarding() {
  const template = state.templates[0];
  app.innerHTML = `<main id="main" class="onboarding"><div class="onboarding-heading"><div class="brand-symbol" aria-hidden="true">b.</div><span class="eyebrow">Seu espaço para planejar</span><h1>Uma vida com mais intenção.</h1><p>Reúna seus objetivos, transforme prioridades em pequenas ações e acompanhe o que faz sentido para você.</p></div><form id="onboarding-form" class="welcome-card"><h2>Vamos criar seu primeiro plano</h2><p class="muted small">Você poderá ajustar todos os campos depois.</p><div class="template-summary"><span>5 perspectivas de vida</span><span>Objetivos e tarefas</span><span>Metas e revisões</span></div><div id="onboarding-error"></div><div class="form-grid"><div class="field full"><label for="onboarding-title">Nome do plano</label><input class="input" id="onboarding-title" name="titulo" required maxlength="200" value="Meu planejamento de vida"></div><div class="field"><label for="onboarding-start">Ano inicial</label><input class="input" id="onboarding-start" name="ano_inicio" type="number" min="1900" max="2200" step="1" value="2027" required></div><div class="field"><label for="onboarding-end">Ano final</label><input class="input" id="onboarding-end" name="ano_fim" type="number" min="1900" max="2200" step="1" value="2036" required></div>${template ? `<div class="field full checkbox-field"><input type="checkbox" id="import-model" name="importar_modelo" checked><label for="import-model">Começar com o modelo BSC pessoal 2027–2036</label></div><div class="field full"><span class="field-help">O modelo inclui perspectivas, objetivos e 12 tarefas iniciais com datas de 16/11/2026 a 14/02/2027. Ajuste as sugestões ao seu momento. Nenhum resultado é preenchido automaticamente.</span></div>` : ''}</div><div class="form-actions"><button class="button" type="submit">Criar meu plano ${icon('arrow')}</button></div></form><p class="onboarding-footer">Seu planejamento pode mudar. O importante é ter um ponto de partida.</p></main>`;
}
function parseJSON(value) { try { return typeof value === 'string' ? JSON.parse(value) : (value || {}); } catch { return {}; } }

// Formulários por recurso. Campos de identidade/ownership nunca vêm do navegador.
const f = (name, text, type = 'text', options = {}) => ({ name, text, type, ...options });
const link = (name, text, source, required = false) => f(name, text, 'select', { source, required });
const statuses = ['planejado', 'em_andamento', 'pausado', 'concluido', 'arquivado'];
const forms = {
  perspectivas: { title: 'perspectiva', fields: [f('codigo','Código','text',{required:true,max:12}),f('nome','Nome','text',{required:true}),f('descricao','O que esta perspectiva representa','textarea',{full:true}),f('cor','Cor','color',{default:'#176756'}),f('ordem','Ordem de exibição','number',{default:0,min:0,step:1})] },
  objetivos: { title: 'objetivo', fields: [link('perspectiva_id','Perspectiva','perspectivas',true),f('codigo','Código','text',{required:true,help:'Exemplo: P1, C2, F3.'}),f('titulo','O que você deseja alcançar','text',{required:true,full:true}),f('descricao','Por que isso importa','textarea',{full:true}),link('ciclo_id','Ciclo estratégico','ciclos'),f('status','Status','select',{options:enums(...statuses),default:'planejado'}),f('prioridade','Prioridade','select',{numeric:true,options:[[1,'1 · Mais alta'],[2,'2 · Alta'],[3,'3 · Média'],[4,'4 · Baixa'],[5,'5 · Mais baixa']],default:3}),f('data_limite','Prazo','date'),f('ordem','Ordem de exibição','number',{min:0,step:1,default:0})] },
  indicadores: { title: 'indicador', fields: [link('objetivo_id','Objetivo','objetivos',true),f('codigo','Código','text',{required:true,help:'Exemplo: P1.1.'}),f('nome','O que você vai acompanhar','text',{required:true,full:true}),f('tipo_valor','Tipo de resultado','select',{options:enums('numero','booleano','texto'),required:true,default:'numero'}),f('unidade','Unidade','text',{required:true,default:'%',help:'Exemplos: %, horas, R$, pontos de 0 a 10.'}),f('frequencia','Frequência','select',{options:enums('diaria','semanal','mensal','trimestral','semestral','anual','pontual','livre'),required:true,default:'mensal'}),f('regra_apuracao','Como apurar o resultado','textarea',{full:true,help:'Exemplo: tarefas concluídas ÷ tarefas planejadas × 100. O resultado consolidado é informado por você.'}),f('descricao','Observações','textarea',{full:true}),f('destaque_painel','Destacar no painel','checkbox',{default:0}),f('ativo','Indicador ativo','checkbox',{default:1})] },
  metas_indicador: { title: 'meta', description: 'Escolha o indicador e o período. As sugestões são um ponto de partida.', fields: [link('indicador_id','Indicador','indicadores',true),f('regra','Como avaliar','select',{options:enums('minimo','maximo','faixa','igual','avaliar','acompanhar'),default:'acompanhar',required:true}),f('periodo_inicio','Início do período','date',{required:true}),f('periodo_fim','Fim do período','date',{required:true}),f('valor_minimo','Valor mínimo / valor esperado','number',{step:'any'}),f('valor_maximo','Valor máximo','number',{step:'any'}),f('descricao','Descrição da meta','textarea',{full:true,required:true})] },
  tarefas: { title:'tarefa',fields:[f('titulo','O que precisa ser feito','text',{required:true,full:true}),f('descricao','Detalhes','textarea',{full:true}),link('objetivo_id','Objetivo','objetivos'),link('iniciativa_id','Iniciativa','iniciativas'),f('grupo','Grupo / etapa','text',{help:'Exemplo: Dias 1–30, Casa, Estudos.'}),f('status','Status','select',{options:enums('pendente','em_andamento','concluida','cancelada'),default:'pendente'}),f('prioridade','Prioridade','select',{numeric:true,options:[[1,'1 · Mais alta'],[2,'2 · Alta'],[3,'3 · Média'],[4,'4 · Baixa'],[5,'5 · Mais baixa']],default:3}),f('data_inicio','Data de início','date'),f('data_limite','Prazo','date')]},
  lancamentos_financeiros:{title:'lançamento',fields:[f('descricao','Descrição','text',{required:true,full:true}),f('tipo','Tipo','select',{options:enums('receita','despesa','aporte','resgate'),default:'despesa',required:true}),f('valor_reais','Valor em reais','money',{required:true,help:'Exemplo: 150,75. Informe um valor positivo.'}),link('categoria_id','Categoria','categorias_financeiras'),f('status','Situação','select',{options:enums('previsto','realizado','cancelado'),default:'previsto'}),f('data_lancamento','Data','date',{required:true,default:()=>today()}),f('essencial','Despesa essencial','checkbox',{default:0}),f('observacoes','Observações','textarea',{full:true})]},
  categorias_financeiras:{title:'categoria',fields:[f('nome','Nome da categoria','text',{required:true,full:true}),f('ativa','Categoria ativa','checkbox',{default:1})]},
  revisoes:{title:'revisão',description:'Reserve alguns minutos para perceber o que funcionou e escolher o próximo ajuste.',fields:[f('frequencia','Tipo de revisão','select',{options:enums('semanal','mensal','trimestral','anual','extraordinaria'),default:'mensal'}),f('data_revisao','Data da revisão','date',{required:true,default:()=>today()}),f('periodo_inicio','Início do período revisado','date',{required:true,default:()=>monthBounds()[0]}),f('periodo_fim','Fim do período revisado','date',{required:true,default:()=>monthBounds()[1]}),f('aproximou_da_visao','O que me aproximou da vida que desejo?','textarea',{full:true}),f('consumiu_energia','O que consumiu mais energia do que deveria?','textarea',{full:true}),f('simplificar_proximo_periodo','O que quero simplificar no próximo período?','textarea',{full:true}),f('decisoes','Decisões e próximos passos','textarea',{full:true})]},
  iniciativas:{title:'iniciativa',fields:[f('titulo','Nome da iniciativa','text',{required:true,full:true}),f('tipo','Tipo','select',{options:enums('projeto','experimento_carreira','habito','experiencia','outro'),default:'projeto'}),f('status','Status','select',{options:enums('planejada','em_andamento','pausada','concluida','cancelada'),default:'planejada'}),link('objetivo_id','Objetivo','objetivos'),link('ciclo_id','Ciclo','ciclos'),f('data_inicio','Data de início','date'),f('data_fim','Data final','date'),f('descricao','O que você pretende fazer e aprender','textarea',{full:true})]},
  rotinas:{title:'bloco da rotina',fields:[f('titulo','Atividade','text',{required:true,full:true}),link('perspectiva_id','Perspectiva','perspectivas'),f('dia_semana','Dia da semana','select',{required:true,numeric:true,default:1,options:[[1,'Segunda-feira'],[2,'Terça-feira'],[3,'Quarta-feira'],[4,'Quinta-feira'],[5,'Sexta-feira'],[6,'Sábado'],[0,'Domingo']]}),f('horario_local','Horário','time'),f('duracao_minutos','Duração em minutos','number',{min:1,step:1}),f('flexibilidade','Nível de compromisso','select',{options:enums('minima','padrao','opcional'),default:'padrao'}),f('ativa','Bloco ativo','checkbox',{default:1}),f('observacoes','Observações','textarea',{full:true})]},
  itens_estrategicos:{title:'item estratégico',fields:[f('tipo','Tipo','select',{options:enums('valor','forca','oportunidade','ponto_desenvolvimento','ameaca','prioridade','risco'),default:'valor'}),f('ordem','Ordem de exibição','number',{default:0,min:0,step:1}),f('titulo','Título','text',{required:true,full:true}),f('descricao','Descrição','textarea',{full:true}),f('prevencao','Como prevenir / preparar','textarea',{full:true}),f('contingencia','O que fazer se acontecer','textarea',{full:true})]},
  registros_pessoais:{title:'registro pessoal',fields:[f('titulo','Título','text',{required:true,full:true}),f('tipo','Tipo','select',{options:enums('reflexao','experiencia','registro_cognitivo','experimento','outro'),default:'reflexao'}),f('data_registro','Data','date',{required:true,default:()=>today()}),link('objetivo_id','Objetivo relacionado','objetivos'),f('conteudo','Seu registro','textarea',{full:true}),f('situacao','O que aconteceu?','textarea',{full:true}),f('pensamento','O que pensei ou esperei de mim?','textarea',{full:true}),f('resposta_alternativa','Outra forma de olhar / o que aprendi','textarea',{full:true})]},
  ciclos:{title:'ciclo',fields:[f('nome','Nome do ciclo','text',{required:true,full:true}),f('descricao','Direção para esta fase','textarea',{full:true}),f('data_inicio','Data inicial','date',{required:true}),f('data_fim','Data final','date',{required:true}),f('ordem','Ordem de exibição','number',{default:0,min:0,step:1})]},
  simulacoes:{title:'simulação financeira',description:'Explore um patrimônio de referência a partir de uma renda mensal desejada e uma taxa anual hipotética.',fields:[f('titulo','Nome da simulação','text',{required:true,full:true,default:'Minha independência financeira'}),f('renda_reais','Renda mensal desejada (R$)','money',{required:true}),f('taxa_percentual','Taxa anual de retirada hipotética (%)','number',{required:true,min:0.01,max:100,step:0.01,default:3.5}),f('observacoes','Premissas e observações','textarea',{full:true,help:'O cálculo é ilustrativo. Não inclui impostos, custos ou outras fontes de renda e não garante a duração do patrimônio.'})]},
  planos:{title:'plano',fields:[f('titulo','Nome do plano','text',{required:true,full:true}),f('ano_inicio','Ano inicial','number',{required:true,min:1900,max:2200,step:1,default:2027}),f('ano_fim','Ano final','number',{required:true,min:1900,max:2200,step:1,default:2036}),f('status','Status','select',{options:enums('rascunho','ativo','concluido','arquivado'),default:'ativo'}),f('missao','Minha missão','textarea',{full:true}),f('visao','Minha visão de futuro','textarea',{full:true}),f('diagnostico','Meu ponto de partida','textarea',{full:true})]},
  perfil:{title:'perfil',fields:[f('nome','Seu nome','text',{required:true,full:true}),f('fuso_horario','Fuso horário','select',{required:true,options:[['America/Sao_Paulo','Brasília / São Paulo'],['America/Manaus','Manaus'],['America/Rio_Branco','Rio Branco'],['America/Noronha','Fernando de Noronha'],['Europe/Lisbon','Lisboa'],['Etc/UTC','UTC']]})]},
};
function fieldOptions(field) {
  if (field.source) return rows(field.source).map((row) => [row.id, (row.codigo ? row.codigo + ' · ' : '') + (row.titulo || row.nome)]);
  return field.options || [];
}
function renderField(field, values) {
  let value = values[field.name];
  if (value === undefined) value = typeof field.default === 'function' ? field.default() : field.default;
  const id = 'edit-' + field.name;
  const labelHTML = `<label for="${id}">${esc(field.text)}${field.required ? '<span class="required" aria-hidden="true">*</span>' : ''}</label>`;
  const attrs = `id="${id}" name="${field.name}" ${field.required ? 'required' : ''} ${field.min !== undefined ? `min="${attr(field.min)}"` : ''} ${field.max !== undefined && field.type === 'number' ? `max="${attr(field.max)}"` : ''} ${field.step !== undefined ? `step="${attr(field.step)}"` : ''}`;
  if (field.type === 'checkbox') return `<div class="field checkbox-field${field.full ? ' full' : ''}"><input ${attrs} type="checkbox"${value ? ' checked' : ''}>${labelHTML}</div>`;
  let input;
  if (field.type === 'select') input = `<select class="input" ${attrs}>${(field.source && !field.required) || field.name === 'atingiu_meta_manual' || value === undefined || value === null || value === '' ? `<option value="">${field.required ? 'Selecione…' : 'Nenhum / não informado'}</option>` : ''}${fieldOptions(field).map(([v, text]) => `<option value="${attr(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
  else if (field.type === 'textarea') input = `<textarea class="input textarea" ${attrs} maxlength="20000" rows="${field.name === 'conteudo' ? 5 : 3}">${esc(value)}</textarea>`;
  else input = `<input class="input" ${attrs} type="${field.type === 'money' ? 'text' : field.type}" ${field.type === 'money' ? 'inputmode="decimal" placeholder="0,00"' : ''} ${field.type === 'text' ? `maxlength="${field.max || 500}"` : ''} value="${attr(value)}">`;
  return `<div class="field${field.full ? ' full' : ''}" data-field="${field.name}">${labelHTML}${input}${field.help ? `<span class="field-help">${esc(field.help)}</span>` : ''}</div>`;
}
function openEditor(resource, id, extra = {}) {
  let record = id ? byId(resource, id) : null;
  if (resource === 'planos' && id) record = state.data.plan;
  if (resource === 'perfil') record = state.user;
  if (resource === 'metas_indicador' && id && rows('resultados_indicador').some((r) => r.meta_id === id)) { toast('Esta meta já faz parte do histórico. Edite o resultado ou crie um novo período.'); return; }
  if (resource === 'simulacoes' && record && record.tipo !== 'independencia_financeira') { toast('Esta simulação foi criada em outro formato. A interface atual edita simulações de independência financeira.', true); return; }
  const definition = forms[resource];
  if (!definition) { toast('Formulário indisponível.', true); return; }
  const values = { ...record, ...extra };
  if (resource === 'indicadores' && record) values.unidade = unitLabel(record.unidade);
  if (resource === 'lancamentos_financeiros' && record) values.valor_reais = centsInput(record.valor_centavos);
  if (resource === 'registros_pessoais') Object.assign(values, parseJSON(record?.detalhes_json));
  if (resource === 'simulacoes' && record) { const p = parseJSON(record.parametros_json); values.renda_reais = centsInput(p.renda_mensal_centavos); values.taxa_percentual = p.taxa_retirada_anual_percentual; }
  if (resource === 'perfil' && !definition.fields[1].options.some(([v]) => v === values.fuso_horario)) definition.fields[1].options.push([values.fuso_horario, values.fuso_horario]);
  if (resource === 'metas_indicador' && !id) { values.indicador_id ||= rows('indicadores').find((i) => i.ativo)?.id; if (values.indicador_id) Object.assign(values, defaultsForMeta(values.indicador_id)); }
  editorState = { resource, id: record?.id || null, fields: definition.fields, record, extra };
  const isNewPlan = resource === 'planos' && !id;
  const fields = isNewPlan ? definition.fields.filter((field) => ['titulo','ano_inicio','ano_fim'].includes(field.name)) : definition.fields;
  editorState.fields = fields;
  editorContent.innerHTML = `<form id="editor-form" class="dialog-content"><div class="dialog-heading"><h2 id="dialog-title">${record ? 'Editar' : 'Adicionar'} ${esc(definition.title)}</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="Fechar">${icon('close')}</button></div><p class="dialog-description">${esc(definition.description || 'Atualize os dados e salve quando estiver pronto.')}</p><div id="editor-error"></div><div class="form-grid">${fields.map((field) => renderField(field, values)).join('')}${isNewPlan && state.templates.length ? '<div class="field full checkbox-field"><input type="checkbox" id="edit-importar_modelo" name="importar_modelo" checked><label for="edit-importar_modelo">Usar o modelo BSC pessoal 2027–2036</label></div><div class="field full"><span class="field-help">O modelo mantém suas datas originais. Você poderá ajustar as tarefas após criar o plano.</span></div>' : ''}</div>${resource === 'simulacoes' ? '<div id="simulation-preview" class="status-banner info subsection"></div>' : ''}<div class="dialog-actions"><button type="button" class="button secondary" data-action="close-dialog">Cancelar</button><button type="submit" class="button">${icon('check')}Salvar</button></div></form>`;
  editor.showModal();
  if (resource === 'metas_indicador') updateMetaDependencies(false);
  if (resource === 'simulacoes') updateSimulationPreview();
  editor.querySelector('input:not([type=checkbox]),select,textarea')?.focus();
}
function defaultsForMeta(indicatorId) {
  const indicator = byId('indicadores', indicatorId);
  if (!indicator) return {};
  const config = parseJSON(state.data.plan.configuracoes_json);
  const suggested = config.metas_sugeridas?.[indicator.codigo] || {};
  const [start, end] = periodFor(indicator);
  return { indicador_id: indicatorId, periodo_inicio: start, periodo_fim: end, regra: suggested.regra || (indicator.tipo_valor === 'texto' ? 'avaliar' : 'acompanhar'), valor_minimo: suggested.valor_minimo ?? null, valor_maximo: suggested.valor_maximo ?? null, descricao: suggested.descricao || `Acompanhar ${indicator.nome.toLocaleLowerCase('pt-BR')} no período.` };
}
function updateMetaDependencies(changedIndicator) {
  const form = document.getElementById('editor-form');
  const selected = byId('indicadores', form.elements.indicador_id.value);
  if (!selected) return;
  if (changedIndicator) { const defaults = defaultsForMeta(selected.id); for (const [key, value] of Object.entries(defaults)) if (form.elements[key]) form.elements[key].value = value ?? ''; }
  const allowed = selected.tipo_valor === 'texto' ? ['avaliar', 'acompanhar'] : selected.tipo_valor === 'booleano' ? ['igual', 'acompanhar'] : ['minimo', 'maximo', 'faixa', 'igual', 'acompanhar'];
  const ruleEl = form.elements.regra;
  for (const option of ruleEl.options) option.disabled = option.value && !allowed.includes(option.value);
  if (!allowed.includes(ruleEl.value)) ruleEl.value = allowed[0];
  const rule = ruleEl.value;
  for (const name of ['valor_minimo', 'valor_maximo']) {
    const enabled = name === 'valor_minimo' ? ['minimo','faixa','igual'].includes(rule) : ['maximo','faixa'].includes(rule);
    const input = form.elements[name];
    input.disabled = !enabled; input.required = enabled;
    input.closest('.field').hidden = !enabled;
    if (!enabled) input.value = '';
    if (selected.tipo_valor === 'booleano') { input.min = '0'; input.max = '1'; input.step = '1'; }
    else { input.removeAttribute('min'); input.removeAttribute('max'); input.step = 'any'; }
  }
}
function openResult(metaId) {
  const meta = byId('metas_indicador', metaId);
  if (!meta) return;
  const record = rows('resultados_indicador').find((r) => r.meta_id === metaId);
  const indicator = byId('indicadores', meta.indicador_id);
  const fields = meta.tipo_valor === 'texto' ? [f('valor_texto','O que você observou / realizou','textarea',{required:true,full:true}), ...(meta.regra === 'avaliar' ? [f('atingiu_meta_manual','Como você avalia a meta?','select',{numeric:true,options:[[1,'Atingida'],[0,'Não atingida']],full:true})] : [])] : [f('valor_numerico',meta.tipo_valor === 'booleano' ? 'O marco foi concluído?' : `Resultado (${unitLabel(meta.unidade)})`,meta.tipo_valor === 'booleano' ? 'select' : 'number',{required:true,full:true,step:'any',numeric:true,options:[[1,'Sim'],[0,'Não']]})];
  fields.push(f('observacoes','Observações / contexto','textarea',{full:true}));
  editorState = { resource: 'resultados_indicador', id: record?.id || null, fields, record, extra: { meta_id: meta.id, tipo_valor: meta.tipo_valor } };
  editorContent.innerHTML = `<form id="editor-form" class="dialog-content"><div class="dialog-heading"><h2 id="dialog-title">${record ? 'Editar' : 'Registrar'} resultado</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="Fechar">${icon('close')}</button></div><p class="dialog-description">${esc(indicator?.nome)}<br>${fmtDate(meta.periodo_inicio)} a ${fmtDate(meta.periodo_fim)} · ${esc(targetLabel(meta))}</p><div id="editor-error"></div><div class="form-grid">${fields.map((field) => renderField(field, record || {})).join('')}</div><div class="dialog-actions"><button class="button secondary" type="button" data-action="close-dialog">Cancelar</button><button type="submit" class="button">${icon('check')}Salvar resultado</button></div></form>`;
  editor.showModal();
  editor.querySelector('input,textarea,select')?.focus();
}
function centsInput(value) { if (value === undefined || value === null) return ''; const cents = Number(value); return `${Math.trunc(cents / 100)},${String(Math.abs(cents % 100)).padStart(2,'0')}`; }
function parseMoney(value) {
  const raw = String(value).trim().replace(/\s/g,'').replace(/^R\$/,'');
  // Aceita 150,75; 150.75; 1.250,75. No máximo duas casas, sem arredondamento silencioso.
  let normalized;
  if (raw.includes(',')) normalized = raw.replace(/\./g, '').replace(',', '.');
  else normalized = raw;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Informe um valor válido em reais, com até duas casas decimais. Exemplo: 150,75.');
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2,'0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('O valor deve ser positivo e estar dentro de um limite válido.');
  return cents;
}
function updateSimulationPreview() {
  const target = document.getElementById('simulation-preview');
  if (!target) return;
  try { const form = document.getElementById('editor-form'); const cents = parseMoney(form.elements.renda_reais.value); const rate = Number(form.elements.taxa_percentual.value); if (!(rate > 0 && rate <= 100)) throw new Error(); target.textContent = `Patrimônio de referência: ${money(Math.round(cents * 12 / (rate / 100)))}. Valor ilustrativo em poder de compra atual.`; }
  catch { target.textContent = 'Informe os dois valores para explorar uma estimativa.'; }
}
function readForm(form, definition) {
  const values = {};
  for (const field of definition.fields) {
    const element = form.elements[field.name];
    if (!element) continue;
    if (field.type === 'checkbox') { values[field.name] = element.checked ? 1 : 0; continue; }
    const raw = element.value.trim();
    if (element.disabled) { values[field.name] = null; continue; }
    if (!raw) { values[field.name] = null; continue; }
    if (field.type === 'number' || field.numeric) {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Confira o campo “${field.text}”.`);
      values[field.name] = value;
    } else values[field.name] = raw;
  }
  if (definition.resource === 'lancamentos_financeiros') { values.valor_centavos = parseMoney(values.valor_reais); delete values.valor_reais; }
  if (definition.resource === 'indicadores') {
    // O rótulo humano é apenas apresentação. Edições que não mudam a unidade
    // preservam exatamente o código já gravado, inclusive unidades personalizadas.
    if (definition.record && values.unidade === unitLabel(definition.record.unidade)) values.unidade = definition.record.unidade;
    else { const known = Object.entries(unitLabels).find(([, display]) => display.toLocaleLowerCase('pt-BR') === values.unidade?.toLocaleLowerCase('pt-BR')); if (known) values.unidade = known[0]; }
  }
  if (definition.resource === 'metas_indicador') {
    const indicator = byId('indicadores', values.indicador_id);
    if (!indicator) throw new Error('Selecione um indicador.');
    values.tipo_valor = indicator.tipo_valor; values.unidade = indicator.unidade;
    if (values.periodo_fim < values.periodo_inicio) throw new Error('O fim do período deve ser igual ou posterior ao início.');
    if (values.regra === 'faixa' && values.valor_maximo < values.valor_minimo) throw new Error('O limite máximo deve ser igual ou maior que o mínimo.');
  }
  if (definition.resource === 'resultados_indicador') {
    Object.assign(values, definition.extra);
    values.valor_numerico ??= null; values.valor_texto ??= null; values.atingiu_meta_manual ??= null;
  }
  if (definition.resource === 'registros_pessoais') {
    const details = { ...parseJSON(definition.record?.detalhes_json), situacao: values.situacao || '', pensamento: values.pensamento || '', resposta_alternativa: values.resposta_alternativa || '' };
    values.detalhes_json = JSON.stringify(details); delete values.situacao; delete values.pensamento; delete values.resposta_alternativa;
  }
  if (definition.resource === 'simulacoes') { values.tipo = 'independencia_financeira'; values.parametros_json = JSON.stringify({ renda_mensal_centavos: parseMoney(values.renda_reais), taxa_retirada_anual_percentual: values.taxa_percentual }); delete values.renda_reais; delete values.taxa_percentual; }
  if (definition.resource === 'planos' && values.ano_fim < values.ano_inicio) throw new Error('O ano final deve ser igual ou posterior ao ano inicial.');
  return values;
}
async function submitEditor(form) {
  const def = editorState;
  if (!def) return;
  const errorBox = document.getElementById('editor-error');
  errorBox.replaceChildren();
  const button = form.querySelector('button[type=submit]');
  try {
    const payload = readForm(form, def);
    button.disabled = true;
    if (def.resource === 'planos') {
      if (def.id) await api('/api/plans/' + uuidPath(def.id), { method: 'PATCH', body: payload });
      else { payload.importar_modelo = !!form.elements.importar_modelo?.checked; payload.modelo_id = payload.importar_modelo ? state.templates[0]?.id : null; const created = await api('/api/plans', { method: 'POST', body: payload }); const plan = created.data || created.plan; if (!plan?.id) throw new Error('O plano foi criado. Atualize a página para abri-lo.'); state.plans.push(plan); state.planId = plan.id; storage.set('bsc-plan', plan.id); state.view = 'dashboard'; }
    } else if (def.resource === 'perfil') { const updated = await api('/api/me', { method: 'PATCH', body: payload }); state.user = updated.data || updated.user || { ...state.user, ...payload }; }
    else await api(resourceUrl(def.resource, def.id), { method: def.id ? 'PATCH' : 'POST', body: payload });
    editor.close(); editorState = null;
    await afterMutation('Alterações salvas.');
  } catch (error) { errorBox.innerHTML = `<p class="error-message" role="alert">${esc(error.message)}</p>`; errorBox.scrollIntoView({ block: 'nearest' }); }
  finally { button.disabled = false; }
}
async function submitOnboarding(form) {
  const button = form.querySelector('button[type=submit]');
  const errorBox = document.getElementById('onboarding-error');
  try {
    button.disabled = true; errorBox.replaceChildren();
    const first = Number(form.elements.ano_inicio.value); const last = Number(form.elements.ano_fim.value);
    if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) throw new Error('Confira os anos: o ano final deve ser igual ou posterior ao inicial.');
    const useTemplate = !!form.elements.importar_modelo?.checked;
    const created = await api('/api/plans', { method:'POST', body:{ titulo: form.elements.titulo.value.trim(), ano_inicio: first, ano_fim: last, modelo_id: useTemplate ? state.templates[0]?.id : null, importar_modelo: useTemplate } });
    const plan = created.data || created.plan;
    if (!plan?.id) throw new Error('O plano foi criado. Atualize a página para abri-lo.');
    state.plans.push(plan); state.planId = plan.id; state.view = 'dashboard'; storage.set('bsc-plan', plan.id);
    await refreshSnapshot(); render(); toast('Seu plano está pronto. Faça os ajustes que quiser.');
  } catch (error) { errorBox.innerHTML = `<p class="error-message" role="alert">${esc(error.message)}</p>`; }
  finally { button.disabled = false; }
}
async function confirmDelete(resource, id) {
  const row = byId(resource,id); if (!row) return;
  const title = row.titulo || row.nome || row.descricao || 'este registro';
  document.getElementById('confirm-title').textContent = 'Excluir registro?';
  let message = `Você vai excluir “${title}”. Esta ação não pode ser desfeita pela interface.`;
  if (['perspectivas','objetivos','indicadores'].includes(resource)) message += ' Indicadores, metas e resultados dependentes também podem ser removidos. Outros vínculos precisam ser desvinculados antes.';
  document.getElementById('confirm-message').textContent = message;
  confirmDialog.returnValue = '';
  confirmDialog.showModal();
  const result = await new Promise((resolve) => confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue), { once: true }));
  if (result !== 'confirm') return;
  try { await api(resourceUrl(resource,id), { method:'DELETE', body:{} }); await afterMutation('Registro excluído.'); }
  catch(error) { toast(error.message,true); }
}
function navigate(view) { state.view = view; state.search = ''; state.filter = ''; state.tab = ''; state.mobileOpen = false; storage.set('bsc-view',view); render(); document.getElementById('main')?.focus({ preventScroll:true }); window.scrollTo({ top:0 }); }
async function changePlan(id) {
  if (id === state.planId || state.refreshing) return;
  state.refreshing = true;
  app.setAttribute('aria-busy', 'true');
  const selector = document.getElementById('plan-switch');
  if (selector) selector.disabled = true;
  try {
    const nextData = await api(`/api/plans/${uuidPath(id)}/snapshot`);
    state.planId = id; state.data = nextData;
    storage.set('bsc-plan',id); state.search = ''; state.filter = '';
  }
  catch(error) { toast(error.message,true); }
  finally { state.refreshing = false; render(); }
}
function exportData() {
  const content = JSON.stringify({ exported_at:new Date().toISOString(), schema:'bsc-pessoal-v1', plan:state.data },null,2);
  const blob = new Blob([content],{ type:'application/json' }); const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `bsc-pessoal-${today()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000); toast('Exportação preparada para download.');
}

document.addEventListener('click',async(event) => {
  const element = event.target.closest('[data-action]'); if (!element || element.disabled) return;
  if (state.refreshing) return;
  const { action, resource, id, view, tab, goal } = element.dataset;
  if (action === 'navigate') navigate(view);
  else if (action === 'reload') location.reload();
  else if (action === 'toggle-menu') { state.mobileOpen = !state.mobileOpen; render(); }
  else if (action === 'new-plan') openEditor('planos');
  else if (action === 'edit-plan') openEditor('planos',state.planId);
  else if (action === 'edit-profile') openEditor('perfil',state.user.id);
  else if (action === 'create') openEditor(resource,null,goal ? { objetivo_id:goal } : {});
  else if (action === 'edit') openEditor(resource,id);
  else if (action === 'delete') await confirmDelete(resource,id);
  else if (action === 'close-dialog') { editor.close(); editorState = null; }
  else if (action === 'result') openResult(id);
  else if (action === 'new-target') openEditor('metas_indicador',null,{ indicador_id:id });
  else if (action === 'prepare-month') {
    if (!state.month) { toast('Escolha o mês de referência antes de preparar as metas.'); document.getElementById('month-filter')?.focus(); return; }
    element.disabled = true;
    try { const outcome = await api(`/api/plans/${uuidPath(state.planId)}/prepare-month`, { method:'POST',body:{month:state.month} }); await afterMutation(`${outcome.created} metas mensais criadas. ${outcome.skipped} indicadores já tinham meta ou foram preservados.`); }
    catch(error) { toast(error.message,true); element.disabled = false; }
  }
  else if (action === 'historical-meta') toast('A definição desta meta está preservada. Você pode corrigir o resultado ou criar uma meta para outro período.');
  else if (action === 'area-goals') { navigate('objectives'); state.filter = id; render(); }
  else if (action === 'all-periods') { state.month = ''; render(); }
  else if (action === 'tab') { state.tab = tab; state.search = ''; state.filter = ''; render(); }
  else if (action === 'export') exportData();
  else if (action === 'toggle-task') {
    const task = byId('tarefas',id); if (!task) return; element.disabled = true;
    try { const completed = task.status !== 'concluida'; await api(resourceUrl('tarefas',id),{ method:'PATCH',body:{ status:completed ? 'concluida' : 'pendente' } }); await afterMutation(completed ? 'Tarefa concluída.' : 'Tarefa reaberta.'); }
    catch(error) { toast(error.message,true); element.disabled = false; }
  }
});
document.addEventListener('submit',(event) => {
  if (event.target.id === 'editor-form') { event.preventDefault(); submitEditor(event.target); }
  if (event.target.id === 'onboarding-form') { event.preventDefault(); submitOnboarding(event.target); }
});
document.addEventListener('change',(event) => {
  if (state.refreshing) return;
  if (event.target.id === 'plan-switch') changePlan(event.target.value);
  if (event.target.id === 'month-filter') { state.month = event.target.value; render(); }
  if (event.target.id === 'resource-filter') { state.filter = event.target.value; render(); }
  if (editorState?.resource === 'metas_indicador' && event.target.name === 'indicador_id') updateMetaDependencies(true);
  if (editorState?.resource === 'metas_indicador' && event.target.name === 'regra') updateMetaDependencies(false);
});
document.addEventListener('input',(event) => {
  if (event.target.id === 'search') { const position = event.target.selectionStart; state.search = event.target.value; const main = document.getElementById('main'); main.innerHTML = renderView(); const search = document.getElementById('search'); search?.focus({ preventScroll:true }); search?.setSelectionRange(position,position); }
  if (editorState?.resource === 'simulacoes' && ['renda_reais','taxa_percentual'].includes(event.target.name)) updateSimulationPreview();
});
editor.addEventListener('cancel',() => { editorState = null; });
document.addEventListener('keydown',(event) => { if (event.key === 'Escape' && state.mobileOpen && !editor.open) { state.mobileOpen = false; render(); } });
start();
