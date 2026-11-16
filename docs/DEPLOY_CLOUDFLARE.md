# Publicar o BSC Pessoal no GitHub e na Cloudflare

Este guia publica o projeto na **sua conta Cloudflare**, usando o banco D1 `bsc-pessoal`. A aplicação usa **Cloudflare Workers com Static Assets**; selecione o fluxo de Workers ao conectar o repositório.

## 1. Preparar o projeto

Extraia o pacote em uma pasta do computador. A pasta correta é aquela que contém `package.json`, `wrangler.jsonc`, `public/`, `src/` e `migrations/`.

Abra essa pasta no VS Code ou em um terminal. Use Node.js 24 ou superior, conforme `engines` em `package.json` e execute:

```bash
npm install
npm run check
npm test
```

Os arquivos de dependências instalados em `node_modules/` e o banco de desenvolvimento em `.wrangler/` não devem ser enviados ao repositório. O `.gitignore` já separa esses arquivos dos arquivos de código.

## 2. Conectar o D1 existente

### Localizar o identificador

No painel Cloudflare, abra **D1**, selecione **bsc-pessoal** e copie o **Database ID**.

Também é possível consultar pelo terminal:

```bash
npx wrangler login
npx wrangler d1 list
```

Se ainda não houver um banco, crie-o uma única vez:

```bash
npx wrangler d1 create bsc-pessoal
```

Se você já criou o banco usando o SQL anterior, **utilize o ID desse banco existente**.

### Atualizar `wrangler.jsonc`

Mantenha os outros campos e substitua somente o placeholder do ID:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "bsc-pessoal",
    "database_id": "ID_REAL_DO_SEU_BANCO"
  }
]
```

`DB` é o nome usado pelo código em `env.DB`; não o renomeie sem ajustar o backend. Essa conexão é feita pelo Worker, sem enviar credenciais do banco ao navegador. A configuração segue o [guia oficial do D1](https://developers.cloudflare.com/d1/get-started/).

### Preparar o banco remoto

```bash
npm run db:remote
```

Esse comando executa `migrations/0001_initial.sql` no D1 da Cloudflare. O arquivo contém o mesmo esquema anterior e o modelo inicial. Se esse esquema já estiver instalado, a reaplicação conserva as tabelas e os registros compatíveis.

O script inicial não é um mecanismo de atualização automática para qualquer esquema diferente. Se você modificar tabelas manualmente, essas alterações precisam ser tratadas por uma migração específica.

O deploy do código não executa `db:remote` automaticamente. Execute-o na preparação inicial e execute futuras migrações quando houver uma alteração de banco planejada.

## 3. Testar no computador

No WSL, Linux ou macOS:

```bash
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev
```

No PowerShell:

```powershell
Copy-Item .dev.vars.example .dev.vars
npm run db:local
npm run dev
```

Abra o endereço mostrado pelo Wrangler, normalmente [http://localhost:8787](http://localhost:8787).

O arquivo `.dev.vars` contém uma identidade local. Ele é ignorado pelo Git e não deve ser configurado como variável de produção. O modo local somente é aceito em hostname local.

**Banco local e remoto são independentes:** os dados de teste permanecem no ambiente local do Wrangler, e o site publicado usa o D1 da sua conta. A publicação não copia seus dados locais para produção.

## 4. Enviar os arquivos para o GitHub

### Caminho recomendado: Git no terminal

No GitHub, crie um repositório novo, por exemplo `bsc-pessoal`. Para usar os comandos abaixo, deixe-o vazio, sem gerar README ou outros arquivos na criação.

Na pasta do projeto:

```bash
git init
git branch -M main
git add .
git commit -m "Cria aplicativo BSC pessoal"
git remote add origin https://github.com/SEU-USUARIO/bsc-pessoal.git
git push -u origin main
```

Substitua `SEU-USUARIO` pelo seu usuário ou organização. Autentique-se no GitHub quando sua ferramenta solicitar.

Essa opção preserva os arquivos que começam com ponto, como `.gitignore` e `.dev.vars.example`. O arquivo privado `.dev.vars` continua excluído pelo `.gitignore`.

### Alternativa: upload pelo site do GitHub

1. Crie o repositório.
2. Use **Add file → Upload files**.
3. Envie o conteúdo da pasta extraída, incluindo as subpastas. Não envie apenas o ZIP.
4. Confira se `package.json` e `wrangler.jsonc` aparecem na raiz do repositório.
5. Confira os arquivos que começam com ponto; se o seletor não mostrar todos, prefira o Git pelo terminal.
6. Salve o commit na branch `main`.

O repositório recebe código e configurações de identificação. Os registros dos usuários ficam no D1. Não copie o banco local, exportações pessoais ou credenciais para dentro do repositório.

## 5. Publicar como Cloudflare Worker

No painel Cloudflare:

1. Abra **Workers & Pages**.
2. Selecione **Create application** e a opção de conectar **GitHub**.
3. Autorize a integração com o repositório desejado.
4. Selecione o repositório `bsc-pessoal`.
5. Configure os campos abaixo.
6. Selecione **Save and Deploy**.

| Campo | Valor para este projeto |
| --- | --- |
| Worker name | `bsc-pessoal` |
| Production branch | `main` |
| Root directory | A raiz em que estão `package.json` e `wrangler.jsonc` |
| Build command | `npm run check` ou vazio; o frontend não exige compilação |
| Deploy command | `npm run deploy` |
| Variável do ambiente de build | `NODE_VERSION=24` |

O nome do Worker deve ser idêntico ao campo `name` de `wrangler.jsonc`. Se mudar o nome, ajuste os dois lugares. A [documentação de Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) descreve o vínculo com GitHub, e a [configuração de Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) explica os comandos.

A primeira publicação pode ocorrer antes de concluir o Access. Nesse estágio, a API permanece bloqueada porque as variáveis de autenticação ainda são placeholders. Complete o passo seguinte para utilizar os dados pelo aplicativo.

O endereço gerado terá um formato semelhante a:

```text
https://bsc-pessoal.SEU-SUBDOMINIO.workers.dev
```

Esse é somente um exemplo de formato. Use o endereço real informado no painel da sua conta.

## 6. Configurar o login com Cloudflare Access

O aplicativo não guarda senhas locais. O Cloudflare Access realiza o login, e o Worker valida a identidade antes de permitir operações no banco.

### 6.1. Habilitar o login por código de e-mail

No painel Cloudflare:

1. Abra **Zero Trust** e conclua a configuração inicial da organização, se ainda não existir.
2. Vá a **Integrations → Identity providers**.
3. Selecione **Add new identity provider → One-time PIN**.

Esse método permite receber um código no e-mail autorizado, sem configurar um provedor Google ou Microsoft. Referência: [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

### 6.2. Proteger todo o Worker

1. Volte a **Workers & Pages** e abra **bsc-pessoal**.
2. Entre na aba **Access**.
3. Selecione **Protect this Worker behind Access**.
4. Escolha **All traffic**.
5. Configure uma política **Allow** com regra **Include → Emails**.
6. Informe seu e-mail e os e-mails das outras pessoas autorizadas.
7. Selecione **Apply Access**.

A proteção por Worker cobre seu endereço `workers.dev`, domínios associados e previews. Consulte [Cloudflare Access para Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

Na política, selecione os e-mails permitidos. Uma regra que inclua somente o método One-time PIN não restringe quais endereços podem entrar. Referência: [políticas comuns do Access](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/).

### 6.3. Obter o domínio da equipe e o AUD

Você precisará de dois valores:

| Configuração do projeto | Valor |
| --- | --- |
| `ACCESS_TEAM_DOMAIN` | Domínio da sua organização Access, no formato `https://sua-equipe.cloudflareaccess.com`, sem caminho adicional. |
| `ACCESS_AUD` | Application Audience (AUD) Tag da aplicação Access que protege o Worker. |

Para copiar o AUD: **Zero Trust → Access controls → Applications → Edit** da aplicação correspondente → **Additional settings → Application Audience (AUD) Tag**.

O AUD identifica a aplicação protegida. Ele não é um token de API da Cloudflare. O backend também valida a assinatura e a origem do JWT recebido, de acordo com a [documentação de validação de JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

### 6.4. Atualizar e publicar a configuração

Substitua os placeholders em `wrangler.jsonc`:

```jsonc
"vars": {
  "AUTH_MODE": "access",
  "ACCESS_TEAM_DOMAIN": "https://SUA-EQUIPE.cloudflareaccess.com",
  "ACCESS_AUD": "AUD_REAL_DA_APLICACAO"
}
```

Mantenha `AUTH_MODE` como `access` na configuração publicada.

Envie a alteração:

```bash
git add wrangler.jsonc
git commit -m "Configura autenticação Cloudflare Access"
git push
```

Se estiver usando o deploy pelo terminal em vez da integração GitHub:

```bash
npm run deploy
```

Aguarde a nova publicação. Abra o endereço do Worker, informe seu e-mail autorizado e conclua o login. Então crie seu plano dentro do aplicativo.

**Variáveis de build não são variáveis de execução.** Este projeto usa `vars` no Wrangler. Se preferir configurar pelo painel, use as variáveis de execução em **Settings → Variables & Secrets** e mantenha a configuração de deploy consistente para que um próximo envio não as substitua por placeholders.

### Detalhe de implementação

O Worker valida o header `Cf-Access-Jwt-Assertion`. Essa escolha é compatível com o uso de Static Assets: o roteador interno de assets atualmente não repassa `ctx.access` ao Worker do usuário. A limitação está documentada em [Worker script routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).

## 7. Confirmar o funcionamento

Depois de publicar e configurar o Access:

1. Entre com um e-mail permitido e crie um plano usando o modelo inicial.
2. Edite um objetivo, salve e recarregue a página.
3. Cadastre uma meta, informe o resultado e confirme o estado exibido no painel.
4. Cadastre um lançamento financeiro e confira seu tipo e valor.
5. Faça login com outro e-mail permitido e confirme que ele inicia com seus próprios planos.

O site usa os registros do banco remoto. Os testes e usuários locais não são transferidos para ele automaticamente.

## 8. Atualizar o aplicativo

Após alterar o código:

```bash
npm run check
npm test
npm run deploy:check
git add .
git commit -m "Atualiza aplicativo BSC pessoal"
git push
```

Com Workers Builds conectado, o push na branch de produção inicia a publicação. Acompanhe o resultado em **Worker → Deployments**.

`deploy:check` utiliza o modo dry-run; ele prepara o pacote sem publicar. Alterações apenas de interface ou API não exigem reaplicar o SQL inicial. Uma alteração de estrutura do banco precisa de sua própria migração planejada.

## 9. Resolver problemas comuns

| Sintoma | O que conferir |
| --- | --- |
| Configuração de autenticação incompleta | Substitua `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD`, mantenha `AUTH_MODE=access` e publique novamente. |
| Acesso negado depois do login | Confira o AUD da aplicação que realmente protege esse Worker, o domínio da equipe e a política de e-mails. |
| E-mail não recebe o código | Confira se o endereço foi autorizado, a caixa de spam e as orientações do provedor de e-mail para mensagens do Cloudflare Access. |
| Banco não encontrado ou binding ausente | Confirme `database_id`, o nome `DB`, a conta autenticada e a publicação mais recente. |
| Erro de tabela inexistente | Execute `npm run db:remote` para o site publicado ou `npm run db:local` para o ambiente local. |
| Meus dados locais não aparecem no site | Os ambientes usam bancos diferentes; essa separação é esperada. |
| Não consigo alterar uma meta antiga | Metas com resultados têm a definição protegida. Corrija o resultado, ou crie a meta para um novo período. |
| Campo ou vínculo recusado | Confira tipos, datas, campos obrigatórios e se os registros pertencem ao mesmo plano. |
| Build falha por nome do Worker | Faça o nome do painel coincidir com `name` em `wrangler.jsonc`. |
| Interface abre, mas API não permite alterações | Complete o login Access e as configurações de execução; o modo local não funciona em domínio remoto. |

## Referências oficiais

- [D1: Getting started](https://developers.cloudflare.com/d1/get-started/)
- [D1: Migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare Access para Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
- [Validate JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
