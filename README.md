# BSC Pessoal

Aplicativo de planejamento pessoal com interface em português, desenvolvido para **GitHub + Cloudflare Workers + Cloudflare D1**.

Você pode criar um plano a partir do BSC 2027–2036, editar os objetivos, definir metas, registrar resultados e acompanhar tarefas, finanças e revisões. O banco é compartilhado pela aplicação, mas cada usuário acessa somente seus próprios planos.

O projeto contém o código para publicar na sua conta. **Não inclui uma publicação já realizada nem um endereço ativo.**

## O que o aplicativo oferece

| Área | Uso |
| --- | --- |
| Visão geral | Acompanhar indicadores, tarefas e o andamento do plano. |
| Objetivos | Cadastrar e editar objetivos e indicadores. |
| Metas e resultados | Definir períodos e critérios; registrar ou corrigir resultados. |
| Tarefas | Atualizar ações, prioridades, prazos e conclusão. |
| Finanças | Manter categorias e lançamentos previstos ou realizados. |
| Revisões | Registrar avaliações periódicas e decisões. |
| Meu plano | Editar missão, visão, diagnóstico e outras informações do plano. |
| Mais registros | Gerenciar iniciativas, rotina, estratégia, diário, ciclos e simulações. |

O modelo inicial oferece **5 perspectivas, 27 objetivos, 29 indicadores, 4 ciclos e 12 tarefas**, a partir do material fornecido. Ao criar um plano com esse modelo, cada usuário recebe sua própria cópia das sugestões. Não há resultados de indicadores ou transações pessoais inventados.

## Como funciona

- **Frontend:** HTML, CSS e JavaScript em `public/`, sem etapa de compilação.
- **Backend:** API JavaScript executada em Cloudflare Workers.
- **Banco:** Cloudflare D1, acessado pelo backend através do binding `DB`.
- **Login em produção:** Cloudflare Access, com identidade validada pelo backend.
- **Desenvolvimento local:** identidade de teste habilitada explicitamente, aceita somente em endereço local.

O GitHub recebe o **código**. Os dados reais ficam no **D1**, e não são gravados em CSV nem em commits do repositório.

## Arquivos principais

| Caminho | Finalidade |
| --- | --- |
| `public/` | Interface e arquivos estáticos. |
| `src/index.js` | Entrada do Worker e roteamento. |
| `src/auth.js` | Autenticação e validação da identidade. |
| `src/api.js` | Operações da API e acesso ao D1. |
| `src/resources.js` | Recursos e campos autorizados para cadastro e edição. |
| `src/validation.js` | Validação dos dados recebidos. |
| `migrations/0001_initial.sql` | O esquema D1 fornecido anteriormente, incluindo o modelo BSC. |
| `wrangler.jsonc` | Nome do Worker, assets, binding D1 e configurações de autenticação. |
| `.dev.vars.example` | Exemplo de variáveis exclusivamente locais. |
| `docs/DEPLOY_CLOUDFLARE.md` | Passo a passo para GitHub, Cloudflare, banco e login. |

## Começar localmente

### 1. Instalar as dependências

Use Node.js 24 ou superior, conforme `engines` em `package.json`. Abra o terminal na pasta que contém `package.json` e execute:

```bash
npm install
```

### 2. Informar o banco existente

Abra `wrangler.jsonc` e substitua o placeholder `database_id` pelo identificador do banco **bsc-pessoal** que você criou na Cloudflare.

O binding deve continuar chamado `DB`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "bsc-pessoal",
    "database_id": "ID_REAL_DO_SEU_BANCO"
  }
]
```

Esse trecho faz parte do arquivo completo; não apague as outras configurações. O ID é encontrado no painel D1 ou com `npx wrangler d1 list` após fazer login na sua conta.

### 3. Habilitar a identidade local

No Linux, macOS ou WSL:

```bash
cp .dev.vars.example .dev.vars
```

No PowerShell:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

O arquivo `.dev.vars` permite usar um usuário de desenvolvimento:

```dotenv
AUTH_MODE=local
LOCAL_USER_EMAIL=voce@example.test
LOCAL_USER_NAME=Você
```

Ele é ignorado pelo Git. Esse modo só funciona em hostname local; em produção o aplicativo usa Access. O usuário local é separado da identidade usada no site publicado.

### 4. Inicializar o banco local e abrir o aplicativo

```bash
npm run db:local
npm run dev
```

Abra o endereço local indicado pelo Wrangler, normalmente [http://localhost:8787](http://localhost:8787).

**O banco local e o banco remoto são separados.** O comando `db:local` utiliza SQLite no ambiente de desenvolvimento do Wrangler. Dados criados localmente não aparecem no site publicado, e a configuração local não altera o banco remoto.

## Publicar no GitHub e na Cloudflare

O guia completo está em [docs/DEPLOY_CLOUDFLARE.md](docs/DEPLOY_CLOUDFLARE.md).

O fluxo principal é:

1. Substituir o ID do D1 em `wrangler.jsonc` pelo ID real do banco existente.
2. Criar um repositório GitHub e enviar os arquivos do projeto.
3. Autenticar o Wrangler e preparar o banco remoto:

   ```bash
   npx wrangler login
   npm run db:remote
   ```

4. Em **Workers & Pages**, criar uma aplicação conectada ao repositório GitHub, como **Worker**.
5. Usar o nome `bsc-pessoal`, a branch `main` e o deploy command `npm run deploy`.
6. Ativar **Access → All traffic**, autorizar os e-mails desejados e preencher `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD`.
7. Publicar novamente a configuração e abrir o endereço gerado pela Cloudflare.

A integração GitHub do Workers permite publicar novas versões quando você envia commits para a branch configurada. O nome no painel deve coincidir com `name` no Wrangler. Veja a [documentação oficial de Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).

Enquanto a autenticação de produção não estiver configurada corretamente, a API recusa o acesso. As variáveis de Access não devem ser trocadas por uma senha compartilhada ou por um identificador enviado pelo navegador.

## Primeiro uso

### Criar seu plano

Na primeira entrada, crie um plano e escolha usar o modelo BSC 2027–2036, se desejar. Revise o título, os anos e os prazos: o modelo conserva as datas e sugestões do documento original.

### Atualizar um objetivo

Abra **Objetivos**, escolha o registro e edite os campos disponíveis. Os indicadores ficam associados aos objetivos do mesmo plano.

### Registrar uma meta e seu resultado

Para começar com os indicadores mensais, abra **Metas e resultados**, escolha o mês e clique em **Preparar mês**. O modelo atual cria 13 metas mensais; repetir a operação preserva as metas existentes. Para metas semanais, anuais ou pontuais:

1. Selecione **Nova meta**.
2. Escolha o indicador e as datas de início e fim do período.
3. Confirme a regra de comparação e os limites sugeridos, quando existirem.
4. Salve a meta.
5. Use **Registrar resultado** para informar o resultado real.
6. Para corrigir um preenchimento, use **Editar resultado**.

Uma meta que já recebeu resultado fica protegida para preservar o histórico. Para mudar o alvo de um período futuro, crie uma nova meta. A ausência de resultado aparece como ausência de informação, não como zero.

### Registrar finanças

Em **Finanças**, cadastre categorias e lançamentos. A interface recebe valores em reais; o backend armazena valores monetários em centavos inteiros. Diferencie lançamentos previstos de realizados e use os tipos aporte/resgate para essas movimentações.

### Usar com amigos

Adicione os e-mails deles à política do Cloudflare Access. Cada pessoa entra com sua própria identidade e cria seus próprios planos. Esta versão não oferece coedição de um mesmo plano entre contas diferentes.

## Comandos disponíveis

| Comando | Efeito |
| --- | --- |
| `npm install` | Instala as dependências do projeto. |
| `npm run check` | Executa as verificações de código configuradas no projeto. |
| `npm test` | Executa os testes automatizados. |
| `npm run db:local` | Aplica o SQL inicial ao banco local. |
| `npm run db:remote` | Aplica o SQL inicial ao banco remoto configurado. |
| `npm run dev` | Inicia o desenvolvimento local. |
| `npm run deploy:check` | Prepara um deploy em modo dry-run, sem publicar. |
| `npm run deploy` | Publica o Worker na conta autenticada da Cloudflare. |

O SQL inicial foi mantido compatível com o arquivo entregue anteriormente. Sua reaplicação sobre aquele mesmo esquema usa `IF NOT EXISTS` e preserva os registros existentes. Mudanças futuras de estrutura precisam de uma nova migração; repetir o arquivo inicial não altera colunas já existentes.

## Limites desta versão

- Tarefas e blocos de rotina são registros para organização. O aplicativo não envia notificações por e-mail nem agenda lembretes externos.
- Os resultados dos indicadores são consolidados por período. O app não calcula automaticamente todos os KPIs a partir de tarefas, extratos ou dispositivos.
- A interface inclui um simulador básico de independência financeira, com parâmetros editáveis e estimativa ilustrativa. A matriz de carreira não possui um editor específico nesta versão.
- Snapshot e exportação atendem até 5.000 registros por tabela. A API também oferece listagens paginadas; acima desse volume a interface precisa evoluir para carregamento por página.
- Autenticação real, política Access e vínculo com a conta Cloudflare precisam ser concluídos pelo responsável pela publicação.

## Verificações da entrega

Foram aprovados 20 testes automatizados, a aplicação do SQL pelo Wrangler local e o empacotamento do Worker em dry-run. Também foram verificados no navegador os fluxos de criação de plano, preparação do mês, gravação de resultado, conclusão de tarefa e edição de dados, incluindo persistência após recarregar. Consulte [docs/VALIDACAO.md](docs/VALIDACAO.md).

## Referências

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [D1: começar e configurar o binding](https://developers.cloudflare.com/d1/get-started/)
- [Cloudflare Access para Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Validação de JWT do Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Workers Builds com GitHub](https://developers.cloudflare.com/workers/ci-cd/builds/)
