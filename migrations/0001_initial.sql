-- BSC PESSOAL | Cloudflare D1 / SQLite | esquema inicial v1
-- Base: planejamento pessoal 2027-2036 fornecido nesta conversa.
--
-- CRIACAO DO BANCO (no terminal; nao e SQL):
--   npx wrangler@latest d1 create bsc-pessoal
-- IMPORTACAO (apos configurar o binding DB no projeto):
--   npx wrangler@latest d1 execute bsc-pessoal --remote --file=./bsc_pessoal_d1.sql
--
-- CONVENCOES
-- 1. Este arquivo cria a estrutura de UM banco, com varias tabelas relacionadas.
-- 2. IDs pessoais: TEXT, gerados pela API (por exemplo, crypto.randomUUID()).
-- 3. Datas: YYYY-MM-DD. Timestamps: UTC. O fuso do usuario fica em usuarios.
-- 4. Percentuais: escala 0-100. Dinheiro no livro financeiro: centavos inteiros.
-- 5. A API deve atualizar atualizado_em em cada UPDATE, com CURRENT_TIMESTAMP.
-- 6. Toda leitura/escrita pessoal exige autorizacao pelo dono de planos.
--    Chaves estrangeiras validam relacionamentos; nao substituem autorizacao.
-- 7. Nao ha senha local: provedor_auth + sujeito_auth identificam o login externo.
-- 8. Arquivar e o fluxo normal. DELETE de usuario/plano apaga dados dependentes.
--    Relacoes opcionais devem ser desvinculadas antes de apagar seus pais.
-- 9. O template e uma proposta, nao registros reais nem resultados realizados.
-- 10. IF NOT EXISTS permite repetir a instalacao do mesmo esquema. Mudancas
--     futuras de colunas/constraints exigem novas migrations.
-- D1 ja aplica foreign keys. Nao desabilitar foreign_keys nem usar CREATE DATABASE.

-- 01. IDENTIDADE E MODELO INICIAL

CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY NOT NULL,
    provedor_auth TEXT NOT NULL,
    sujeito_auth TEXT NOT NULL,
    nome TEXT NOT NULL,
    email TEXT,
    fuso_horario TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provedor_auth, sujeito_auth)
);

CREATE TABLE IF NOT EXISTS modelos_bsc (
    id TEXT PRIMARY KEY NOT NULL,
    nome TEXT NOT NULL,
    versao INTEGER NOT NULL CHECK (typeof(versao) = 'integer' AND versao > 0),
    descricao TEXT NOT NULL,
    conteudo_json TEXT NOT NULL
        CHECK (CASE WHEN json_valid(conteudo_json)
                    THEN json_type(conteudo_json) = 'object' ELSE 0 END),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 02. PLANO, PERSPECTIVAS E CICLOS

CREATE TABLE IF NOT EXISTS planos (
    id TEXT PRIMARY KEY NOT NULL,
    usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    modelo_id TEXT REFERENCES modelos_bsc(id),
    titulo TEXT NOT NULL,
    missao TEXT,
    visao TEXT,
    diagnostico TEXT,
    ano_inicio INTEGER NOT NULL CHECK (typeof(ano_inicio) = 'integer' AND ano_inicio BETWEEN 1900 AND 2200),
    ano_fim INTEGER NOT NULL CHECK (typeof(ano_fim) = 'integer' AND ano_fim BETWEEN ano_inicio AND 2200),
    status TEXT NOT NULL DEFAULT 'ativo'
        CHECK (status IN ('rascunho', 'ativo', 'concluido', 'arquivado')),
    configuracoes_json TEXT NOT NULL DEFAULT '{}'
        CHECK (CASE WHEN json_valid(configuracoes_json)
                    THEN json_type(configuracoes_json) = 'object' ELSE 0 END),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS perspectivas (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    codigo TEXT NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    cor TEXT,
    ordem INTEGER NOT NULL DEFAULT 0 CHECK (typeof(ordem) = 'integer' AND ordem >= 0),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plano_id, id),
    UNIQUE (plano_id, codigo)
);

CREATE TABLE IF NOT EXISTS ciclos (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    descricao TEXT,
    data_inicio TEXT NOT NULL
        CHECK (length(data_inicio) = 10 AND date(data_inicio, '+0 days') IS data_inicio),
    data_fim TEXT NOT NULL
        CHECK (length(data_fim) = 10 AND date(data_fim, '+0 days') IS data_fim),
    ordem INTEGER NOT NULL DEFAULT 0 CHECK (typeof(ordem) = 'integer' AND ordem >= 0),
    UNIQUE (plano_id, id),
    CHECK (data_fim >= data_inicio)
);

-- 03. OBJETIVOS E INDICADORES

CREATE TABLE IF NOT EXISTS objetivos (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    perspectiva_id TEXT NOT NULL,
    ciclo_id TEXT,
    codigo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    prioridade INTEGER NOT NULL DEFAULT 3 CHECK (typeof(prioridade) = 'integer' AND prioridade BETWEEN 1 AND 5),
    status TEXT NOT NULL DEFAULT 'planejado'
        CHECK (status IN ('planejado', 'em_andamento', 'pausado', 'concluido', 'arquivado')),
    data_limite TEXT
        CHECK (data_limite IS NULL OR
               (length(data_limite) = 10 AND date(data_limite, '+0 days') IS data_limite)),
    ordem INTEGER NOT NULL DEFAULT 0 CHECK (typeof(ordem) = 'integer' AND ordem >= 0),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plano_id, id),
    UNIQUE (plano_id, codigo),
    FOREIGN KEY (plano_id, perspectiva_id)
        REFERENCES perspectivas(plano_id, id) ON DELETE CASCADE,
    FOREIGN KEY (plano_id, ciclo_id) REFERENCES ciclos(plano_id, id)
);

CREATE TABLE IF NOT EXISTS indicadores (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    objetivo_id TEXT NOT NULL,
    codigo TEXT NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    tipo_valor TEXT NOT NULL CHECK (tipo_valor IN ('numero', 'booleano', 'texto')),
    unidade TEXT NOT NULL,
    frequencia TEXT NOT NULL
        CHECK (frequencia IN ('diaria', 'semanal', 'mensal', 'trimestral',
                              'semestral', 'anual', 'pontual', 'livre')),
    regra_apuracao TEXT,
    destaque_painel INTEGER NOT NULL DEFAULT 0 CHECK (destaque_painel IN (0, 1)),
    ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plano_id, id),
    UNIQUE (plano_id, id, tipo_valor),
    UNIQUE (plano_id, codigo),
    FOREIGN KEY (plano_id, objetivo_id)
        REFERENCES objetivos(plano_id, id) ON DELETE CASCADE
);

-- Uma meta por indicador e periodo. Inicio/fim sao inclusivos.
-- Exemplos: semana 2027-01-04 a 2027-01-10; mes 2027-01-01 a 2027-01-31.
-- A API deve usar periodos canonicos para a frequencia e impedir sobreposicoes.
-- Tipo, unidade e regra ficam registrados na meta para preservar o historico.
-- Metas indefinidas usam regra 'acompanhar', com limites NULL, nunca zero ficticio.

CREATE TABLE IF NOT EXISTS metas_indicador (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    indicador_id TEXT NOT NULL,
    tipo_valor TEXT NOT NULL CHECK (tipo_valor IN ('numero', 'booleano', 'texto')),
    unidade TEXT NOT NULL,
    periodo_inicio TEXT NOT NULL
        CHECK (length(periodo_inicio) = 10 AND date(periodo_inicio, '+0 days') IS periodo_inicio),
    periodo_fim TEXT NOT NULL
        CHECK (length(periodo_fim) = 10 AND date(periodo_fim, '+0 days') IS periodo_fim),
    regra TEXT NOT NULL
        CHECK (regra IN ('minimo', 'maximo', 'faixa', 'igual', 'avaliar', 'acompanhar')),
    valor_minimo REAL,
    valor_maximo REAL,
    descricao TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plano_id, id),
    UNIQUE (plano_id, id, tipo_valor),
    UNIQUE (plano_id, indicador_id, periodo_inicio, periodo_fim),
    FOREIGN KEY (plano_id, indicador_id, tipo_valor)
        REFERENCES indicadores(plano_id, id, tipo_valor) ON DELETE CASCADE,
    CHECK (periodo_fim >= periodo_inicio),
    CHECK (valor_minimo IS NULL OR typeof(valor_minimo) IN ('integer', 'real')),
    CHECK (valor_maximo IS NULL OR typeof(valor_maximo) IN ('integer', 'real')),
    CHECK (
        (regra = 'acompanhar' AND valor_minimo IS NULL AND valor_maximo IS NULL)
        OR (regra = 'avaliar' AND tipo_valor = 'texto'
            AND valor_minimo IS NULL AND valor_maximo IS NULL)
        OR (regra = 'minimo' AND tipo_valor = 'numero'
            AND valor_minimo IS NOT NULL AND valor_maximo IS NULL)
        OR (regra = 'maximo' AND tipo_valor = 'numero'
            AND valor_minimo IS NULL AND valor_maximo IS NOT NULL)
        OR (regra = 'faixa' AND tipo_valor = 'numero'
            AND valor_minimo IS NOT NULL AND valor_maximo IS NOT NULL
            AND valor_minimo <= valor_maximo)
        OR (regra = 'igual' AND valor_minimo IS NOT NULL AND valor_maximo IS NULL
            AND (tipo_valor = 'numero'
                 OR (tipo_valor = 'booleano' AND valor_minimo IN (0, 1))))
    )
);

-- Um resultado CONSOLIDADO por meta/periodo. Nao e uma tabela de eventos diarios.
-- A API calcula soma/media/contagem conforme regra_apuracao, quando necessario.
-- Ausencia de linha significa 'nao informado'; 0 e uma medicao real.

CREATE TABLE IF NOT EXISTS resultados_indicador (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    meta_id TEXT NOT NULL,
    tipo_valor TEXT NOT NULL CHECK (tipo_valor IN ('numero', 'booleano', 'texto')),
    valor_numerico REAL,
    valor_texto TEXT,
    atingiu_meta_manual INTEGER CHECK (atingiu_meta_manual IN (0, 1)),
    observacoes TEXT,
    registrado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plano_id, meta_id),
    FOREIGN KEY (plano_id, meta_id, tipo_valor)
        REFERENCES metas_indicador(plano_id, id, tipo_valor) ON DELETE CASCADE,
    CHECK (tipo_valor = 'texto' OR atingiu_meta_manual IS NULL),
    CHECK (
        (tipo_valor = 'numero' AND valor_numerico IS NOT NULL
            AND typeof(valor_numerico) IN ('integer', 'real') AND valor_texto IS NULL)
        OR (tipo_valor = 'booleano' AND valor_numerico IS NOT NULL
            AND typeof(valor_numerico) IN ('integer', 'real')
            AND valor_numerico IN (0, 1) AND valor_texto IS NULL)
        OR (tipo_valor = 'texto' AND valor_numerico IS NULL
            AND valor_texto IS NOT NULL AND length(trim(valor_texto)) > 0)
    )
);

-- Impede alterar retroativamente a definicao de uma meta que ja possui resultado.
-- Para uma nova meta, crie outro periodo; correcoes de resultados usam UPDATE.
CREATE TRIGGER IF NOT EXISTS trg_preservar_meta_com_resultado
BEFORE UPDATE OF plano_id, indicador_id, tipo_valor, unidade, periodo_inicio,
                 periodo_fim, regra, valor_minimo, valor_maximo, descricao
ON metas_indicador
WHEN EXISTS (
    SELECT 1 FROM resultados_indicador r
    WHERE r.plano_id = OLD.plano_id AND r.meta_id = OLD.id
)
BEGIN
    SELECT RAISE(ABORT, 'Meta com resultado registrado: preserve o historico e crie um novo periodo.');
END;

-- 04. INICIATIVAS, TAREFAS E ROTINA

CREATE TABLE IF NOT EXISTS iniciativas (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    objetivo_id TEXT,
    ciclo_id TEXT,
    titulo TEXT NOT NULL,
    descricao TEXT,
    tipo TEXT NOT NULL DEFAULT 'projeto'
        CHECK (tipo IN ('projeto', 'experimento_carreira', 'habito', 'experiencia', 'outro')),
    status TEXT NOT NULL DEFAULT 'planejada'
        CHECK (status IN ('planejada', 'em_andamento', 'pausada', 'concluida', 'cancelada')),
    data_inicio TEXT CHECK (data_inicio IS NULL OR
        (length(data_inicio) = 10 AND date(data_inicio, '+0 days') IS data_inicio)),
    data_fim TEXT CHECK (data_fim IS NULL OR
        (length(data_fim) = 10 AND date(data_fim, '+0 days') IS data_fim)),
    detalhes_json TEXT NOT NULL DEFAULT '{}'
        CHECK (CASE WHEN json_valid(detalhes_json)
                    THEN json_type(detalhes_json) = 'object' ELSE 0 END),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plano_id, id),
    FOREIGN KEY (plano_id, objetivo_id) REFERENCES objetivos(plano_id, id),
    FOREIGN KEY (plano_id, ciclo_id) REFERENCES ciclos(plano_id, id),
    CHECK (data_inicio IS NULL OR data_fim IS NULL OR data_fim >= data_inicio)
);

CREATE TABLE IF NOT EXISTS tarefas (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    objetivo_id TEXT,
    iniciativa_id TEXT,
    titulo TEXT NOT NULL,
    descricao TEXT,
    grupo TEXT,
    status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
    prioridade INTEGER NOT NULL DEFAULT 3 CHECK (typeof(prioridade) = 'integer' AND prioridade BETWEEN 1 AND 5),
    data_inicio TEXT CHECK (data_inicio IS NULL OR
        (length(data_inicio) = 10 AND date(data_inicio, '+0 days') IS data_inicio)),
    data_limite TEXT CHECK (data_limite IS NULL OR
        (length(data_limite) = 10 AND date(data_limite, '+0 days') IS data_limite)),
    concluida_em TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plano_id, objetivo_id) REFERENCES objetivos(plano_id, id),
    FOREIGN KEY (plano_id, iniciativa_id) REFERENCES iniciativas(plano_id, id),
    CHECK (data_inicio IS NULL OR data_limite IS NULL OR data_limite >= data_inicio),
    CHECK ((status = 'concluida' AND concluida_em IS NOT NULL)
        OR (status <> 'concluida' AND concluida_em IS NULL))
);

-- Blocos semanais planejados; a API cria ocorrencias/lembretes se essa funcao existir.
-- dia_semana: 0=domingo ... 6=sabado. horario_local pode ser NULL se ainda nao definido.
CREATE TABLE IF NOT EXISTS rotinas (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    perspectiva_id TEXT,
    titulo TEXT NOT NULL,
    dia_semana INTEGER NOT NULL CHECK (typeof(dia_semana) = 'integer' AND dia_semana BETWEEN 0 AND 6),
    horario_local TEXT CHECK (horario_local IS NULL OR
        (length(horario_local) = 5 AND horario_local GLOB '[0-2][0-9]:[0-5][0-9]'
         AND substr(horario_local, 1, 2) BETWEEN '00' AND '23')),
    duracao_minutos INTEGER CHECK (duracao_minutos IS NULL OR
        (typeof(duracao_minutos) = 'integer' AND duracao_minutos > 0)),
    flexibilidade TEXT NOT NULL DEFAULT 'padrao'
        CHECK (flexibilidade IN ('minima', 'padrao', 'opcional')),
    observacoes TEXT,
    ativa INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1)),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plano_id, perspectiva_id) REFERENCES perspectivas(plano_id, id)
);

-- 05. REVISOES, SWOT, VALORES, PRIORIDADES E REGISTROS PESSOAIS

CREATE TABLE IF NOT EXISTS revisoes (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    frequencia TEXT NOT NULL
        CHECK (frequencia IN ('semanal', 'mensal', 'trimestral', 'anual', 'extraordinaria')),
    data_revisao TEXT NOT NULL
        CHECK (length(data_revisao) = 10 AND date(data_revisao, '+0 days') IS data_revisao),
    periodo_inicio TEXT NOT NULL
        CHECK (length(periodo_inicio) = 10 AND date(periodo_inicio, '+0 days') IS periodo_inicio),
    periodo_fim TEXT NOT NULL
        CHECK (length(periodo_fim) = 10 AND date(periodo_fim, '+0 days') IS periodo_fim),
    aproximou_da_visao TEXT,
    consumiu_energia TEXT,
    simplificar_proximo_periodo TEXT,
    decisoes TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (periodo_fim >= periodo_inicio)
);

CREATE TABLE IF NOT EXISTS itens_estrategicos (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN (
        'valor', 'forca', 'oportunidade', 'ponto_desenvolvimento',
        'ameaca', 'prioridade', 'risco'
    )),
    titulo TEXT NOT NULL,
    descricao TEXT,
    prevencao TEXT,
    contingencia TEXT,
    ordem INTEGER NOT NULL DEFAULT 0 CHECK (typeof(ordem) = 'integer' AND ordem >= 0),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- detalhes_json permite registros cognitivos/experimentos sem impor um prontuario:
-- {"situacao":"...", "pensamento":"...", "resposta_alternativa":"..."}
CREATE TABLE IF NOT EXISTS registros_pessoais (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    objetivo_id TEXT,
    tipo TEXT NOT NULL
        CHECK (tipo IN ('reflexao', 'experiencia', 'registro_cognitivo', 'experimento', 'outro')),
    data_registro TEXT NOT NULL
        CHECK (length(data_registro) = 10 AND date(data_registro, '+0 days') IS data_registro),
    titulo TEXT NOT NULL,
    conteudo TEXT,
    detalhes_json TEXT NOT NULL DEFAULT '{}'
        CHECK (CASE WHEN json_valid(detalhes_json)
                    THEN json_type(detalhes_json) = 'object' ELSE 0 END),
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plano_id, objetivo_id) REFERENCES objetivos(plano_id, id)
);

-- 06. FINANCAS E SIMULACOES

CREATE TABLE IF NOT EXISTS categorias_financeiras (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    ativa INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1)),
    UNIQUE (plano_id, id),
    UNIQUE (plano_id, nome)
);

-- Aporte/resgate sao transferencias, nao receita/despesa de consumo.
-- Categoria NULL permite medir despesas ainda nao categorizadas.
-- Saldos de divida/reserva/patrimonio ficam nos respectivos KPIs, por periodo.
CREATE TABLE IF NOT EXISTS lancamentos_financeiros (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    categoria_id TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa', 'aporte', 'resgate')),
    descricao TEXT NOT NULL,
    valor_centavos INTEGER NOT NULL
        CHECK (typeof(valor_centavos) = 'integer' AND valor_centavos > 0),
    data_lancamento TEXT NOT NULL
        CHECK (length(data_lancamento) = 10 AND date(data_lancamento, '+0 days') IS data_lancamento),
    status TEXT NOT NULL DEFAULT 'previsto'
        CHECK (status IN ('previsto', 'realizado', 'cancelado')),
    essencial INTEGER NOT NULL DEFAULT 0 CHECK (essencial IN (0, 1)),
    observacoes TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plano_id, categoria_id) REFERENCES categorias_financeiras(plano_id, id)
);

-- Guarda entradas de simuladores e da matriz de carreira. Calculo fica na API/UI.
-- Notas de carreira e taxas financeiras sao hipoteses, nao fatos realizados.
CREATE TABLE IF NOT EXISTS simulacoes (
    id TEXT PRIMARY KEY NOT NULL,
    plano_id TEXT NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('carreira', 'independencia_financeira', 'imovel', 'outro')),
    titulo TEXT NOT NULL,
    parametros_json TEXT NOT NULL
        CHECK (CASE WHEN json_valid(parametros_json)
                    THEN json_type(parametros_json) = 'object' ELSE 0 END),
    observacoes TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 07. INDICES PARA OS ACESSOS MAIS COMUNS

CREATE INDEX IF NOT EXISTS idx_planos_usuario ON planos(usuario_id, status);
CREATE INDEX IF NOT EXISTS idx_planos_modelo ON planos(modelo_id);
CREATE INDEX IF NOT EXISTS idx_objetivos_perspectiva ON objetivos(plano_id, perspectiva_id, ordem);
CREATE INDEX IF NOT EXISTS idx_objetivos_ciclo ON objetivos(plano_id, ciclo_id);
CREATE INDEX IF NOT EXISTS idx_indicadores_objetivo ON indicadores(plano_id, objetivo_id);
CREATE INDEX IF NOT EXISTS idx_metas_periodo ON metas_indicador(plano_id, periodo_inicio, periodo_fim);
CREATE INDEX IF NOT EXISTS idx_iniciativas_objetivo ON iniciativas(plano_id, objetivo_id);
CREATE INDEX IF NOT EXISTS idx_iniciativas_ciclo ON iniciativas(plano_id, ciclo_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_agenda ON tarefas(plano_id, status, data_limite);
CREATE INDEX IF NOT EXISTS idx_tarefas_objetivo ON tarefas(plano_id, objetivo_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_iniciativa ON tarefas(plano_id, iniciativa_id);
CREATE INDEX IF NOT EXISTS idx_rotinas_semana ON rotinas(plano_id, dia_semana);
CREATE INDEX IF NOT EXISTS idx_rotinas_perspectiva ON rotinas(plano_id, perspectiva_id);
CREATE INDEX IF NOT EXISTS idx_revisoes_data ON revisoes(plano_id, data_revisao);
CREATE INDEX IF NOT EXISTS idx_itens_tipo ON itens_estrategicos(plano_id, tipo, ordem);
CREATE INDEX IF NOT EXISTS idx_registros_data ON registros_pessoais(plano_id, data_registro);
CREATE INDEX IF NOT EXISTS idx_registros_objetivo ON registros_pessoais(plano_id, objetivo_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_data ON lancamentos_financeiros(plano_id, data_lancamento, status);
CREATE INDEX IF NOT EXISTS idx_lancamentos_categoria ON lancamentos_financeiros(plano_id, categoria_id);
CREATE INDEX IF NOT EXISTS idx_simulacoes_tipo ON simulacoes(plano_id, tipo);

-- 08. SCORECARD: INCLUI RESULTADOS AUSENTES, SEM CONVERTE-LOS EM ZERO
-- Esta view NAO e uma barreira de acesso. Sempre filtrar por usuario_id na API.
-- So aparecem periodos para os quais a aplicacao cadastrou uma meta.

CREATE VIEW IF NOT EXISTS vw_scorecard AS
SELECT
    p.usuario_id,
    m.plano_id,
    a.id AS perspectiva_id,
    a.nome AS perspectiva,
    a.ordem AS ordem_perspectiva,
    o.codigo AS objetivo_codigo,
    o.titulo AS objetivo,
    i.id AS indicador_id,
    i.nome AS indicador,
    i.destaque_painel,
    m.id AS meta_id,
    m.periodo_inicio,
    m.periodo_fim,
    m.tipo_valor,
    m.unidade,
    m.regra,
    m.valor_minimo,
    m.valor_maximo,
    m.descricao AS meta_descricao,
    r.valor_numerico AS resultado_numerico,
    r.valor_texto AS resultado_texto,
    r.observacoes,
    CASE
        WHEN r.id IS NULL THEN 'sem_resultado'
        WHEN m.regra = 'acompanhar' THEN 'acompanhamento'
        WHEN m.regra = 'avaliar' AND r.atingiu_meta_manual IS NULL THEN 'aguarda_avaliacao'
        WHEN m.regra = 'avaliar' AND r.atingiu_meta_manual = 1 THEN 'atingida'
        WHEN m.regra = 'minimo' AND r.valor_numerico >= m.valor_minimo THEN 'atingida'
        WHEN m.regra = 'maximo' AND r.valor_numerico <= m.valor_maximo THEN 'atingida'
        WHEN m.regra = 'faixa' AND r.valor_numerico BETWEEN m.valor_minimo AND m.valor_maximo THEN 'atingida'
        WHEN m.regra = 'igual' AND r.valor_numerico = m.valor_minimo THEN 'atingida'
        ELSE 'nao_atingida'
    END AS situacao
FROM metas_indicador m
JOIN planos p ON p.id = m.plano_id
JOIN indicadores i ON i.plano_id = m.plano_id AND i.id = m.indicador_id
JOIN objetivos o ON o.plano_id = i.plano_id AND o.id = i.objetivo_id
JOIN perspectivas a ON a.plano_id = o.plano_id AND a.id = o.perspectiva_id
LEFT JOIN resultados_indicador r ON r.plano_id = m.plano_id AND r.meta_id = m.id;

-- 09. MODELO SUGERIDO DO ANEXO
-- O INSERT seguinte guarda um modelo para o formulario de criacao de plano.
-- Nao cria conta, plano pessoal, lancamento financeiro, nem resultado de KPI.
-- A aplicacao copia as sugestoes para as tabelas do novo plano depois do login.
-- Datas, metas e a associacao dos dois KPIs extras sao sugestoes editaveis.
-- O conteudo e adicionado na secao seguinte.

INSERT INTO modelos_bsc (id, nome, versao, descricao, conteudo_json)
VALUES (
    'bsc_pessoal_2027_2036_v1',
    'BSC pessoal 2027–2036',
    1,
    '5 perspectivas, 27 objetivos, 29 indicadores, 4 ciclos e 12 ações iniciais. Metas propostas; resultados vazios.',
    '{
  "origem": "Modelo adaptado do planejamento BSC pessoal fornecido em 16/11/2026.",
  "natureza": "Sugestões editáveis; não contém resultados realizados nem saldos pessoais.",
  "titulo": "Planejamento estratégico de vida 2027–2036",
  "ano_inicio": 2027,
  "ano_fim": 2036,
  "missao": "Construir uma vida simples, intelectualmente estimulante, financeiramente segura e rica em experiências, preservando autonomia, relacionamentos e saúde.",
  "valores": [
    "Autonomia",
    "Simplicidade",
    "Conhecimento",
    "Estabilidade",
    "Lealdade",
    "Experiências",
    "Constância"
  ],
  "notas": [
    "Metas e frequências sugeridas devem ser confirmadas após medir a realidade nos primeiros 30 dias.",
    "Os dois indicadores exclusivos do painel mensal foram associados a C2 e S5 como sugestão de organização.",
    "Metas aproximadas, condicionais ou ainda não definidas usam acompanhar até que o usuário escolha uma regra numérica.",
    "As datas da preparação foram mantidas como no documento: 16/11/2026 a 14/02/2027.",
    "Valores financeiros pessoais, pensamentos exemplificativos e resultados de saúde não foram inseridos como registros reais."
  ],
  "perspectivas": [
    {
      "codigo": "P",
      "nome": "Vida pessoal, identidade e propósito",
      "cor": "#7C3AED",
      "ordem": 1,
      "objetivos": [
        {
          "codigo": "P1",
          "titulo": "Organizar a vida cotidiana",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "P1.1",
              "nome": "Tarefas planejadas e concluídas",
              "tipo_valor": "numero",
              "unidade": "%",
              "frequencia": "mensal",
              "destaque_painel": 1,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "minimo",
                "valor_minimo": 80,
                "valor_maximo": null,
                "descricao": "Pelo menos 80% por mês."
              }
            }
          ]
        },
        {
          "codigo": "P2",
          "titulo": "Preservar autonomia",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "P2.1",
              "nome": "Tempo em atividades escolhidas por você",
              "tipo_valor": "numero",
              "unidade": "horas",
              "frequencia": "semanal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "faixa",
                "valor_minimo": 3,
                "valor_maximo": 5,
                "descricao": "De 3 a 5 horas por semana."
              }
            }
          ]
        },
        {
          "codigo": "P3",
          "titulo": "Viver novas experiências",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "P3.1",
              "nome": "Experiências significativas registradas",
              "tipo_valor": "numero",
              "unidade": "experiencias",
              "frequencia": "anual",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "minimo",
                "valor_minimo": 6,
                "valor_maximo": null,
                "descricao": "6 experiências por ano."
              }
            }
          ]
        },
        {
          "codigo": "P4",
          "titulo": "Desenvolver autoconhecimento",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "P4.1",
              "nome": "Revisões pessoais realizadas",
              "tipo_valor": "numero",
              "unidade": "revisoes",
              "frequencia": "mensal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "minimo",
                "valor_minimo": 1,
                "valor_maximo": null,
                "descricao": "1 revisão por mês."
              }
            }
          ]
        },
        {
          "codigo": "P5",
          "titulo": "Aprender com constância",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "P5.1",
              "nome": "Estudo por interesse pessoal",
              "tipo_valor": "numero",
              "unidade": "horas",
              "frequencia": "semanal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "minimo",
                "valor_minimo": 2,
                "valor_maximo": null,
                "descricao": "2 horas por semana."
              }
            }
          ]
        }
      ]
    },
    {
      "codigo": "R",
      "nome": "Relacionamentos, casamento e família",
      "cor": "#DB2777",
      "ordem": 2,
      "objetivos": [
        {
          "codigo": "R1",
          "titulo": "Aumentar o romantismo",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "R1.1",
              "nome": "Momentos intencionais a dois",
              "tipo_valor": "numero",
              "unidade": "momentos",
              "frequencia": "mensal",
              "destaque_painel": 1,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "minimo",
                "valor_minimo": 2,
                "valor_maximo": null,
                "descricao": "2 momentos por mês."
              }
            }
          ]
        },
        {
          "codigo": "R2",
          "titulo": "Fortalecer a comunicação",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "R2.1",
              "nome": "Conversas de alinhamento",
              "tipo_valor": "numero",
              "unidade": "conversas",
              "frequencia": "semanal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "minimo",
                "valor_minimo": 1,
                "valor_maximo": null,
                "descricao": "1 conversa por semana."
              }
            }
          ]
        },
        {
          "codigo": "R3",
          "titulo": "Construir sonhos conjuntos",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "R3.1",
              "nome": "Revisões das metas do casal",
              "tipo_valor": "numero",
              "unidade": "revisoes",
              "frequencia": "trimestral",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "minimo",
                "valor_minimo": 1,
                "valor_maximo": null,
                "descricao": "1 revisão por trimestre."
              }
            }
          ]
        },
        {
          "codigo": "R4",
          "titulo": "Manter vínculos familiares e amizades",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "R4.1",
              "nome": "Contatos ou encontros significativos",
              "tipo_valor": "numero",
              "unidade": "encontros",
              "frequencia": "mensal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "minimo",
                "valor_minimo": 2,
                "valor_maximo": null,
                "descricao": "2 contatos ou encontros por mês."
              }
            }
          ]
        },
        {
          "codigo": "R5",
          "titulo": "Cuidar dos pets idosos",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "R5.1",
              "nome": "Acompanhamento de saúde e cuidados dos pets",
              "tipo_valor": "texto",
              "unidade": "avaliacao",
              "frequencia": "livre",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "avaliar",
                "valor_minimo": null,
                "valor_maximo": null,
                "descricao": "Plano individual de cuidados atualizado."
              }
            }
          ]
        }
      ]
    },
    {
      "codigo": "C",
      "nome": "Carreira e realização profissional",
      "cor": "#2563EB",
      "ordem": 3,
      "objetivos": [
        {
          "codigo": "C1",
          "titulo": "Definir direção profissional",
          "data_limite": "2027-03-31",
          "indicadores": [
            {
              "codigo": "C1.1",
              "nome": "Matriz comparativa concluída",
              "tipo_valor": "booleano",
              "unidade": "sim_nao",
              "frequencia": "pontual",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "igual",
                "valor_minimo": 1,
                "valor_maximo": null,
                "descricao": "Concluir até março de 2027."
              }
            }
          ]
        },
        {
          "codigo": "C2",
          "titulo": "Testar caminhos possíveis",
          "data_limite": "2027-06-30",
          "indicadores": [
            {
              "codigo": "C2.1",
              "nome": "Experimentos de carreira",
              "tipo_valor": "numero",
              "unidade": "experimentos",
              "frequencia": "semestral",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "minimo",
                "valor_minimo": 2,
                "valor_maximo": null,
                "descricao": "2 experimentos até junho de 2027."
              }
            },
            {
              "codigo": "C2.2",
              "nome": "Exploração profissional",
              "tipo_valor": "numero",
              "unidade": "horas",
              "frequencia": "mensal",
              "destaque_painel": 1,
              "origem": "painel_mensal",
              "meta_sugerida": {
                "regra": "minimo",
                "valor_minimo": 10,
                "valor_maximo": null,
                "descricao": "10 horas por mês, conforme o painel mensal."
              }
            }
          ]
        },
        {
          "codigo": "C3",
          "titulo": "Manter competitividade",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "C3.1",
              "nome": "Projetos ou competências demonstráveis",
              "tipo_valor": "numero",
              "unidade": "entregas",
              "frequencia": "anual",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "minimo",
                "valor_minimo": 2,
                "valor_maximo": null,
                "descricao": "2 projetos ou competências por ano."
              }
            }
          ]
        },
        {
          "codigo": "C4",
          "titulo": "Preservar qualidade de vida no trabalho",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "C4.1",
              "nome": "Horas extras e conflitos entre trabalho e família",
              "tipo_valor": "texto",
              "unidade": "avaliacao",
              "frequencia": "mensal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "acompanhar",
                "valor_minimo": null,
                "valor_maximo": null,
                "descricao": "Acompanhar mensalmente, sem alvo numérico definido."
              }
            }
          ]
        },
        {
          "codigo": "C5",
          "titulo": "Melhorar remuneração",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "C5.1",
              "nome": "Evolução da renda real",
              "tipo_valor": "numero",
              "unidade": "%",
              "frequencia": "livre",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "acompanhar",
                "valor_minimo": null,
                "valor_maximo": null,
                "descricao": "Definir a meta após análise de mercado."
              }
            }
          ]
        }
      ]
    },
    {
      "codigo": "S",
      "nome": "Saúde, alimentação e bem-estar",
      "cor": "#059669",
      "ordem": 4,
      "objetivos": [
        {
          "codigo": "S1",
          "titulo": "Preservar condicionamento físico",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "S1.1",
              "nome": "Atividades físicas e recuperação",
              "tipo_valor": "texto",
              "unidade": "avaliacao",
              "frequencia": "semanal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "acompanhar",
                "valor_minimo": null,
                "valor_maximo": null,
                "descricao": "Manter uma rotina sustentável."
              }
            }
          ]
        },
        {
          "codigo": "S2",
          "titulo": "Melhorar saúde cardiovascular",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "S2.1",
              "nome": "Perfil lipídico e avaliação clínica",
              "tipo_valor": "texto",
              "unidade": "avaliacao",
              "frequencia": "livre",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "acompanhar",
                "valor_minimo": null,
                "valor_maximo": null,
                "descricao": "Definir uma meta individual com o profissional responsável."
              }
            }
          ]
        },
        {
          "codigo": "S3",
          "titulo": "Fortalecer alimentação",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "S3.1",
              "nome": "Dias com refeições planejadas",
              "tipo_valor": "numero",
              "unidade": "dias",
              "frequencia": "semanal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "faixa",
                "valor_minimo": 4,
                "valor_maximo": 5,
                "descricao": "Planejar refeições em 4 a 5 dias da semana."
              }
            }
          ]
        },
        {
          "codigo": "S4",
          "titulo": "Preservar sono",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "S4.1",
              "nome": "Duração média do sono",
              "tipo_valor": "numero",
              "unidade": "horas_por_noite",
              "frequencia": "semanal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "acompanhar",
                "valor_minimo": null,
                "valor_maximo": null,
                "descricao": "Referência aproximada de 8 horas; confirmar critério e registrar qualidade percebida nas observações."
              }
            }
          ]
        },
        {
          "codigo": "S5",
          "titulo": "Cuidar da saúde emocional",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "S5.1",
              "nome": "Percepção de ansiedade e sobrecarga",
              "tipo_valor": "texto",
              "unidade": "avaliacao",
              "frequencia": "mensal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "acompanhar",
                "valor_minimo": null,
                "valor_maximo": null,
                "descricao": "Revisão mensal, sem alvo numérico definido."
              }
            },
            {
              "codigo": "S5.2",
              "nome": "Qualidade de vida percebida",
              "tipo_valor": "numero",
              "unidade": "escala_0_10",
              "frequencia": "mensal",
              "destaque_painel": 1,
              "origem": "painel_mensal",
              "meta_sugerida": {
                "regra": "minimo",
                "valor_minimo": 8,
                "valor_maximo": null,
                "descricao": "Referência de 8 em 10, conforme o painel mensal."
              }
            }
          ]
        },
        {
          "codigo": "S6",
          "titulo": "Envelhecer com autonomia",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "S6.1",
              "nome": "Força, mobilidade e capacidade funcional",
              "tipo_valor": "texto",
              "unidade": "avaliacao",
              "frequencia": "anual",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "avaliar",
                "valor_minimo": null,
                "valor_maximo": null,
                "descricao": "Realizar e registrar uma avaliação anual."
              }
            }
          ]
        }
      ]
    },
    {
      "codigo": "F",
      "nome": "Finanças e independência financeira",
      "cor": "#D97706",
      "ordem": 5,
      "objetivos": [
        {
          "codigo": "F1",
          "titulo": "Controlar orçamento",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "F1.1",
              "nome": "Despesas categorizadas",
              "tipo_valor": "numero",
              "unidade": "%",
              "frequencia": "mensal",
              "destaque_painel": 1,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "minimo",
                "valor_minimo": 95,
                "valor_maximo": null,
                "descricao": "Pelo menos 95% por mês."
              }
            }
          ]
        },
        {
          "codigo": "F2",
          "titulo": "Eliminar dívida da moto",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "F2.1",
              "nome": "Saldo devedor da moto",
              "tipo_valor": "numero",
              "unidade": "BRL",
              "frequencia": "mensal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "acompanhar",
                "valor_minimo": null,
                "valor_maximo": null,
                "descricao": "Quitar no prazo, sem atrasos; cadastrar saldo e prazo reais antes de definir metas por mês."
              }
            }
          ]
        },
        {
          "codigo": "F3",
          "titulo": "Construir reserva de emergência",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "F3.1",
              "nome": "Despesas essenciais cobertas pela reserva",
              "tipo_valor": "numero",
              "unidade": "meses",
              "frequencia": "mensal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "acompanhar",
                "valor_minimo": null,
                "valor_maximo": null,
                "descricao": "Faixa de referência: 6 a 12 meses. Definir alvo e prazo após levantar as despesas."
              }
            }
          ]
        },
        {
          "codigo": "F4",
          "titulo": "Retomar investimentos",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "F4.1",
              "nome": "Taxa de poupança familiar",
              "tipo_valor": "numero",
              "unidade": "%",
              "frequencia": "mensal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "acompanhar",
                "valor_minimo": null,
                "valor_maximo": null,
                "descricao": "Referência inicial de 15% a 20%, quando viável. Confirmar alvo após fechar o orçamento."
              }
            }
          ]
        },
        {
          "codigo": "F5",
          "titulo": "Planejar casa própria",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "F5.1",
              "nome": "Valor acumulado para a entrada",
              "tipo_valor": "numero",
              "unidade": "BRL",
              "frequencia": "mensal",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "acompanhar",
                "valor_minimo": null,
                "valor_maximo": null,
                "descricao": "Definir meta após orçar o imóvel."
              }
            }
          ]
        },
        {
          "codigo": "F6",
          "titulo": "Construir independência financeira",
          "data_limite": null,
          "indicadores": [
            {
              "codigo": "F6.1",
              "nome": "Patrimônio investido em relação ao patrimônio-alvo",
              "tipo_valor": "numero",
              "unidade": "%",
              "frequencia": "semestral",
              "destaque_painel": 0,
              "origem": "tabela_bsc",
              "meta_sugerida": {
                "regra": "acompanhar",
                "valor_minimo": null,
                "valor_maximo": null,
                "descricao": "Revisão semestral; confirmar patrimônio-alvo e metodologia."
              }
            }
          ]
        }
      ]
    }
  ],
  "ciclos": [
    {
      "nome": "Estruturação",
      "data_inicio": "2027-01-01",
      "data_fim": "2027-12-31",
      "descricao": "Construir um sistema de vida sustentável.",
      "ordem": 1
    },
    {
      "nome": "Consolidação",
      "data_inicio": "2028-01-01",
      "data_fim": "2029-12-31",
      "descricao": "Aprofundar escolhas e acumular patrimônio.",
      "ordem": 2
    },
    {
      "nome": "Expansão",
      "data_inicio": "2030-01-01",
      "data_fim": "2032-12-31",
      "descricao": "Ampliar liberdade e oportunidades.",
      "ordem": 3
    },
    {
      "nome": "Autonomia",
      "data_inicio": "2033-01-01",
      "data_fim": "2036-12-31",
      "descricao": "Aproximar-se da vida desejada.",
      "ordem": 4
    }
  ],
  "tarefas_iniciais": [
    {
      "titulo": "Escolher um aplicativo ou sistema único para tarefas",
      "objetivo_codigo": "P1",
      "grupo": "Dias 1–30",
      "data_inicio": "2026-11-16",
      "data_limite": "2026-12-15",
      "status": "pendente"
    },
    {
      "titulo": "Levantar despesas, investimentos e parcelas restantes",
      "objetivo_codigo": "F1",
      "grupo": "Dias 1–30",
      "data_inicio": "2026-11-16",
      "data_limite": "2026-12-15",
      "status": "pendente"
    },
    {
      "titulo": "Conversar com a pessoa parceira sobre tempo individual e tempo do casal",
      "objetivo_codigo": "R2",
      "grupo": "Dias 1–30",
      "data_inicio": "2026-11-16",
      "data_limite": "2026-12-15",
      "status": "pendente"
    },
    {
      "titulo": "Revisar acompanhamento de saúde e recuperação esportiva",
      "objetivo_codigo": "S2",
      "grupo": "Dias 1–30",
      "data_inicio": "2026-11-16",
      "data_limite": "2026-12-15",
      "status": "pendente"
    },
    {
      "titulo": "Pesquisar vagas, concursos e programas de doutorado",
      "objetivo_codigo": "C1",
      "grupo": "Dias 31–60",
      "data_inicio": "2026-12-16",
      "data_limite": "2027-01-14",
      "status": "pendente"
    },
    {
      "titulo": "Iniciar um experimento profissional com tempo limitado",
      "objetivo_codigo": "C2",
      "grupo": "Dias 31–60",
      "data_inicio": "2026-12-16",
      "data_limite": "2027-01-14",
      "status": "pendente"
    },
    {
      "titulo": "Definir meta inicial de reserva e poupança",
      "objetivo_codigo": "F3",
      "grupo": "Dias 31–60",
      "data_inicio": "2026-12-16",
      "data_limite": "2027-01-14",
      "status": "pendente"
    },
    {
      "titulo": "Realizar dois encontros intencionais com a pessoa parceira",
      "objetivo_codigo": "R1",
      "grupo": "Dias 31–60",
      "data_inicio": "2026-12-16",
      "data_limite": "2027-01-14",
      "status": "pendente"
    },
    {
      "titulo": "Avaliar o funcionamento do planejamento sem autocrítica punitiva",
      "objetivo_codigo": "P1",
      "grupo": "Dias 61–90",
      "data_inicio": "2027-01-15",
      "data_limite": "2027-02-14",
      "status": "pendente"
    },
    {
      "titulo": "Comparar resultados do primeiro experimento",
      "objetivo_codigo": "C2",
      "grupo": "Dias 61–90",
      "data_inicio": "2027-01-15",
      "data_limite": "2027-02-14",
      "status": "pendente"
    },
    {
      "titulo": "Fechar três meses de acompanhamento financeiro",
      "objetivo_codigo": "F1",
      "grupo": "Dias 61–90",
      "data_inicio": "2027-01-15",
      "data_limite": "2027-02-14",
      "status": "pendente"
    },
    {
      "titulo": "Fazer a primeira revisão trimestral do BSC",
      "objetivo_codigo": null,
      "grupo": "Dias 61–90",
      "data_inicio": "2027-01-15",
      "data_limite": "2027-02-14",
      "status": "pendente"
    }
  ],
  "revisoes_sugeridas": [
    {
      "frequencia": "semanal",
      "duracao_minutos": 20
    },
    {
      "frequencia": "mensal",
      "duracao_minutos": 45
    },
    {
      "frequencia": "trimestral",
      "duracao_minutos_minimo": 60,
      "duracao_minutos_maximo": 90
    },
    {
      "frequencia": "anual",
      "duracao_minutos": 120
    }
  ]
}'
)
ON CONFLICT (id) DO NOTHING;


-- 10. CONSULTAS DE VERIFICACAO (opcionais; descomente para executar)
-- SELECT name, type FROM sqlite_master
-- WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
-- ORDER BY type, name;
-- PRAGMA foreign_key_check;
-- SELECT id, nome, json_array_length(conteudo_json, '$.perspectivas') AS perspectivas
-- FROM modelos_bsc;

-- Exemplo parametrizado para o Worker (os ? sao vinculados pela API):
-- SELECT * FROM vw_scorecard
-- WHERE usuario_id = ? AND plano_id = ?
--   AND periodo_inicio = ? AND periodo_fim = ?
-- ORDER BY ordem_perspectiva, objetivo_codigo, indicador;
--
-- Filtro por usuario_id deve vir da sessao autenticada, nunca do body do navegador.
-- Metas semanais, mensais e anuais devem ser consultadas por seus proprios periodos.
-- Uma media simples entre essas frequencias/unidades nao e um score valido.
