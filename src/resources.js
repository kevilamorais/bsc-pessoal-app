// Only these columns and tables can appear in dynamically assembled SQL.
// All data values are sent to D1 through bound parameters.
const text = (max = 10000, required = false) => ({ type: 'text', max, required });
const choice = (values, required = false) => ({ type: 'enum', values, required });
const integer = (min, max, required = false) => ({ type: 'integer', min, max, required });
const number = () => ({ type: 'number' });
const reference = (table, required = false) => ({ type: 'reference', table, required });
const date = (required = false) => ({ type: 'date', required });
const object = (required = false) => ({ type: 'json', required, max: 20000 });
const flag = () => integer(0, 1);
export const FREQUENCIES = ['diaria', 'semanal', 'mensal', 'trimestral', 'semestral', 'anual', 'pontual', 'livre'];
export const VALUE_TYPES = ['numero', 'booleano', 'texto'];

export const PLAN_FIELDS = {
  titulo: text(200, true), missao: text(), visao: text(), diagnostico: text(),
  ano_inicio: integer(1900, 2200, true), ano_fim: integer(1900, 2200, true),
  status: choice(['rascunho', 'ativo', 'concluido', 'arquivado'], true),
  configuracoes_json: object(true),
};

export const PROFILE_FIELDS = {
  nome: text(120, true), fuso_horario: { type: 'timezone', required: true },
};

export const RESOURCES = {
  perspectivas: {
    label: 'perspectiva', updated: true, order: 'ordem, nome',
    defaults: { ordem: 0 },
    fields: { codigo: text(30, true), nome: text(200, true), descricao: text(), cor: { type: 'color' }, ordem: integer(0, 100000) },
  },
  ciclos: {
    label: 'ciclo', order: 'ordem, data_inicio', defaults: { ordem: 0 },
    fields: { nome: text(200, true), descricao: text(), data_inicio: date(true), data_fim: date(true), ordem: integer(0, 100000) },
  },
  objetivos: {
    label: 'objetivo', updated: true, order: 'ordem, codigo',
    defaults: { prioridade: 3, status: 'planejado', ordem: 0 },
    fields: {
      perspectiva_id: reference('perspectivas', true), ciclo_id: reference('ciclos'),
      codigo: text(30, true), titulo: text(240, true), descricao: text(),
      prioridade: integer(1, 5), status: choice(['planejado', 'em_andamento', 'pausado', 'concluido', 'arquivado']),
      data_limite: date(), ordem: integer(0, 100000),
    },
  },
  indicadores: {
    label: 'indicador', updated: true, order: 'codigo', defaults: { destaque_painel: 0, ativo: 1 },
    fields: {
      objetivo_id: reference('objetivos', true), codigo: text(40, true), nome: text(240, true), descricao: text(),
      tipo_valor: choice(VALUE_TYPES, true), unidade: text(50, true), frequencia: choice(FREQUENCIES, true),
      regra_apuracao: text(3000), destaque_painel: flag(), ativo: flag(),
    },
  },
  metas_indicador: {
    label: 'meta', updated: true, order: 'periodo_inicio DESC, indicador_id',
    defaults: { valor_minimo: null, valor_maximo: null },
    fields: {
      indicador_id: reference('indicadores', true), tipo_valor: choice(VALUE_TYPES), unidade: text(50),
      periodo_inicio: date(true), periodo_fim: date(true),
      regra: choice(['minimo', 'maximo', 'faixa', 'igual', 'avaliar', 'acompanhar'], true),
      valor_minimo: number(), valor_maximo: number(), descricao: text(3000, true),
    },
  },
  resultados_indicador: {
    label: 'resultado', updated: true, order: 'registrado_em DESC',
    defaults: { valor_numerico: null, valor_texto: null, atingiu_meta_manual: null },
    fields: {
      meta_id: reference('metas_indicador', true), tipo_valor: choice(VALUE_TYPES),
      valor_numerico: number(), valor_texto: text(), atingiu_meta_manual: flag(), observacoes: text(),
    },
  },
  iniciativas: {
    label: 'iniciativa', updated: true, order: 'criado_em DESC',
    defaults: { tipo: 'projeto', status: 'planejada', detalhes_json: '{}' },
    fields: {
      objetivo_id: reference('objetivos'), ciclo_id: reference('ciclos'), titulo: text(240, true), descricao: text(),
      tipo: choice(['projeto', 'experimento_carreira', 'habito', 'experiencia', 'outro']),
      status: choice(['planejada', 'em_andamento', 'pausada', 'concluida', 'cancelada']),
      data_inicio: date(), data_fim: date(), detalhes_json: object(),
    },
  },
  tarefas: {
    label: 'tarefa', updated: true, order: 'data_limite IS NULL, data_limite, prioridade, criado_em DESC',
    defaults: { status: 'pendente', prioridade: 3 },
    fields: {
      objetivo_id: reference('objetivos'), iniciativa_id: reference('iniciativas'), titulo: text(240, true),
      descricao: text(), grupo: text(100), status: choice(['pendente', 'em_andamento', 'concluida', 'cancelada']),
      prioridade: integer(1, 5), data_inicio: date(), data_limite: date(),
    },
    serverFields: ['concluida_em'],
  },
  rotinas: {
    label: 'rotina', updated: true, order: 'dia_semana, horario_local, titulo',
    defaults: { flexibilidade: 'padrao', ativa: 1 },
    fields: {
      perspectiva_id: reference('perspectivas'), titulo: text(240, true), dia_semana: integer(0, 6, true),
      horario_local: { type: 'time' }, duracao_minutos: integer(1, 1440),
      flexibilidade: choice(['minima', 'padrao', 'opcional']), observacoes: text(), ativa: flag(),
    },
  },
  revisoes: {
    label: 'revisão', updated: true, order: 'data_revisao DESC', defaults: {},
    fields: {
      frequencia: choice(['semanal', 'mensal', 'trimestral', 'anual', 'extraordinaria'], true),
      data_revisao: date(true), periodo_inicio: date(true), periodo_fim: date(true),
      aproximou_da_visao: text(), consumiu_energia: text(), simplificar_proximo_periodo: text(), decisoes: text(),
    },
  },
  itens_estrategicos: {
    label: 'item estratégico', updated: true, order: 'tipo, ordem, criado_em', defaults: { ordem: 0 },
    fields: {
      tipo: choice(['valor', 'forca', 'oportunidade', 'ponto_desenvolvimento', 'ameaca', 'prioridade', 'risco'], true),
      titulo: text(240, true), descricao: text(), prevencao: text(), contingencia: text(), ordem: integer(0, 100000),
    },
  },
  registros_pessoais: {
    label: 'registro pessoal', updated: true, order: 'data_registro DESC, criado_em DESC', defaults: { detalhes_json: '{}' },
    fields: {
      objetivo_id: reference('objetivos'), tipo: choice(['reflexao', 'experiencia', 'registro_cognitivo', 'experimento', 'outro'], true),
      data_registro: date(true), titulo: text(240, true), conteudo: text(), detalhes_json: object(),
    },
  },
  categorias_financeiras: {
    label: 'categoria financeira', order: 'nome', defaults: { ativa: 1 },
    fields: { nome: text(100, true), ativa: flag() },
  },
  lancamentos_financeiros: {
    label: 'lançamento financeiro', updated: true, order: 'data_lancamento DESC, criado_em DESC',
    defaults: { status: 'previsto', essencial: 0 },
    fields: {
      categoria_id: reference('categorias_financeiras'), tipo: choice(['receita', 'despesa', 'aporte', 'resgate'], true),
      descricao: text(500, true), valor_centavos: integer(1, Number.MAX_SAFE_INTEGER, true), data_lancamento: date(true),
      status: choice(['previsto', 'realizado', 'cancelado']), essencial: flag(), observacoes: text(),
    },
  },
  simulacoes: {
    label: 'simulação', updated: true, order: 'criado_em DESC', defaults: {},
    fields: {
      tipo: choice(['carreira', 'independencia_financeira', 'imovel', 'outro'], true),
      titulo: text(240, true), parametros_json: object(true), observacoes: text(),
    },
  },
};
