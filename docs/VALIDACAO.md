# Validação da entrega

Verificações realizadas em 16/11/2026, com Node.js 24 e Wrangler 4.163.0.

## Banco e código

- O SQL original foi aplicado pelo Wrangler ao D1 local: 41 comandos executados.
- O mesmo esquema foi validado em SQLite com chaves estrangeiras habilitadas.
- `npm run check` verifica a sintaxe dos arquivos JavaScript e os bindings do projeto.
- `npm run deploy:check` gerou o pacote do Worker e reconheceu `DB` e `ASSETS`, sem publicar.

## Testes automatizados

`npm test`: 20 testes aprovados, cobrindo API, autenticação e integridade.

Os testes incluem importação do modelo, criação/edição de tarefas, períodos de metas,
distinção entre zero e ausência, correção de resultados, preservação do histórico,
geração mensal sem duplicação, centavos, datas inválidas, isolamento entre usuários,
referências de outro plano, origem das mutações e rejeição de campos não autorizados.

A validação JWT utiliza assinatura RSA real gerada apenas para os testes e uma
resposta JWKS controlada. São rejeitados assinatura incorreta, expiração, emissor
e audiência diferentes, token sem identidade e uso remoto do modo local.

## Interface no navegador

Os seguintes fluxos foram exercitados com o Worker e o D1 locais:

1. Criar plano com o modelo: 27 objetivos, 29 indicadores e 12 tarefas.
2. Preparar janeiro de 2027: 13 metas mensais, inicialmente sem resultados.
3. Registrar resultado numérico e conferir a classificação da meta.
4. Criar lançamento financeiro com centavos e editar seu valor.
5. Recarregar a página e conferir os dados persistidos.
6. Concluir uma tarefa e conferir a atualização do painel.
7. Editar o título do plano e conferir a alteração após recarregar.

Foi feita inspeção visual do painel em desktop. O CSS contém regras responsivas;
não houve validação em um aparelho móvel físico.

## Limites da verificação

- Não foram criados repositórios nem publicados recursos na conta da usuária.
- Não houve conexão ao D1 remoto da usuária: o identificador ainda deve ser informado.
- O login real pelo Cloudflare Access depende da organização/política da conta de destino.
- O ZIP não contém o banco local, registros de teste, `.dev.vars` ou `node_modules`.
- A interface não oferece coedição de um plano por contas diferentes nem notificações externas.
