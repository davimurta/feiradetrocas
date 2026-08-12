# Fase 0: investigação do sistema de login

Relatório de auditoria antes de qualquer implementação. Data: 11/08/2026.

## Sumário executivo

O login atual funciona, mas tem três falhas graves. Duas delas permitem que qualquer pessoa
entre como administrador hoje, sem senha e sem ferramenta especial. Elas precisam ser fechadas
antes do evento, independentemente do resto do projeto.

| # | Achado | Severidade |
|---|--------|-----------|
| 1 | `loginComGoogleAction` autentica qualquer email sem credencial | Crítica |
| 2 | Primeiro login por senha "reivindica" conta pré-provisionada e define a senha | Crítica |
| 3 | Nenhum rate limiting em nenhum ponto do sistema | Alta |
| 4 | Cookie de sessão é determinístico, nunca rotaciona e logout não o invalida | Média |
| 5 | Senha mínima de 4 caracteres, scrypt com parâmetros padrão do Node | Média |

Sobre a API do Cotemig: o contrato de autenticação está confirmado (Basic Auth funciona em
`GET /v1/perfil`), mas **o formato da resposta 200 não está documentado na especificação
oficial** e eu não tenho credencial para descobrir. Isso trava a decisão do R3.2. Há um comando
na seção 0.2 para você rodar.

Sobre o Google: **GO condicional**. Confirmei por DNS que o colégio usa Google Workspace.
Falta só confirmar a URL pública de produção.

---

## 0.1 Auditoria do login atual

### Mapa dos arquivos

| Camada | Arquivo | Papel |
|---|---|---|
| Tela | `src/app/login/page.tsx` | Server Component, redireciona quem já tem sessão |
| Formulário | `src/components/LoginForm.tsx` | Client Component, só email e senha |
| Server Action | `src/app/actions/auth.ts` | `loginComSenhaAction`, `loginComGoogleAction`, `logoutAction` |
| Regra de negócio | `src/domain/auth.ts` | `entrarComSenha`, `entrarComGoogle`, `garantirAluno`, `provisionar` |
| Senha | `src/lib/password.ts` | scrypt + `timingSafeEqual` |
| Sessão | `src/lib/session.ts` | cookie assinado com HMAC-SHA256 |
| Identidade | `src/lib/auth.ts` | `getCurrentUser`, `assertPapel` |
| Guarda de página | `src/lib/guard.ts` | `requireUser`, redireciona por papel |

Não existe `middleware.ts` no projeto. Não existe NextAuth, Auth.js nem qualquer biblioteca de
autenticação: tudo é feito à mão com `node:crypto`. Isso é uma vantagem para este trabalho,
porque não há framework a contrariar, e uma desvantagem, porque não há nada pronto para OAuth.

### Como a sessão funciona

O cookie `feira_session` guarda `userId.hmac`, onde `hmac = HMAC-SHA256(userId, SESSION_SECRET)`
em base64url. Atributos: `httpOnly`, `sameSite=lax`, `secure` em produção, `path=/`,
`maxAge` de 7 dias.

O papel do usuário **nunca trafega**. Em toda requisição, `getCurrentUser` lê o `userId` do
cookie, valida a assinatura com `timingSafeEqual` e busca `papel`, `pendente` e `bloqueado`
direto no banco. Trocar o papel exige um `UPDATE` no Postgres, não dá para forjar pelo cliente.
Essa parte está correta e deve ser preservada.

O problema é que o valor do cookie é uma função pura do `userId`: ele é sempre o mesmo, para
sempre. Consequências:

- Não existe rotação de identificador no login, porque não existe identificador de sessão.
- `logoutAction` só apaga o cookie do navegador. Um cookie copiado antes continua válido pelos
  7 dias, mesmo depois do logout, mesmo depois de trocar a senha.
- Não há como invalidar a sessão de um usuário específico sem trocar o `SESSION_SECRET`, o que
  derruba todo mundo.

O requisito não funcional de "rotação do identificador no login" exige, portanto, mudança de
modelo: ou um campo `sessionVersion Int @default(0)` em `User` assinado junto do id, ou uma
tabela `Session` de verdade. A primeira opção é bem mais barata e resolve logout global,
bloqueio imediato e troca de senha.

### Modelo `User`

```prisma
id             String  @id @default(cuid())
nome           String
email          String  @unique
senhaHash      String? @map("senha_hash")
provider       String  @default("password")
papel          Papel   @default(participante)
unidade        Unidade @default(barroca)
saldo          Int     @default(0)
codigoCarteira String  @unique @map("codigo_carteira")
pendente       Boolean @default(false)
bloqueado      Boolean @default(false)
```

Únicos: `email`, `codigoCarteira`. `senhaHash` é nullable, e é justamente isso que abre o
achado 2. `provider` é uma string livre com valores `password`, `google` e `preprovisioned`.

Hash: scrypt do Node com salt aleatório de 16 bytes, `keylen` 64, formato `salt:hash`, comparado
com `timingSafeEqual`. Os parâmetros de custo são os padrões (N=16384, r=8, p=1) e **não são
gravados no hash**, então mudar o custo depois exige um campo de versão ou um prefixo no formato
armazenado. Recomendação do OWASP hoje é N=2^17 para scrypt.

### Como a autorização por papel é aplicada

Dois pontos, ambos server-side:

- Páginas: `requireUser(...papeis)` em cada Server Component, com `redirect`.
- Ações: `getCurrentUser()` + `assertPapel(user, ...papeis)` dentro de cada Server Action.

Auditei os 30 endpoints em uma verificação anterior: todas as Server Actions exportadas chamam
uma guarda, e `src/app/admin/export/route.ts` também. `assertPapel` barra conta bloqueada antes
de checar o papel. Essa arquitetura está sólida e **nenhuma mudança deste projeto deve afrouxá-la**.

### Telas que dependem do login

`/carteira` (participante), `/entrada` (recepção), `/stand` (PDV), `/admin`, `/pendente`. Todas
entram por `requireUser` e usam `rotaInicial(papel)` para o destino pós-login. Nenhuma delas
precisa mudar para o R1 e o R2.

### Achado 1 (crítico): `loginComGoogleAction` é bypass total de autenticação

```ts
export async function loginComGoogleAction(input) {
  const { email } = googleSchema.parse(input);
  const emailFinal = email || 'visitante.google@aluno.cotemig.com.br';
  const user = await entrarComGoogle(prisma, { email: emailFinal });
  await setSession(user.id);   // sessão emitida sem verificar nada
  ...
}
```

Não há OAuth. O email vem do cliente e a sessão é emitida direto. `entrarComGoogle` procura o
usuário por email e, se existir, retorna. Ou seja: informar o email de um admin devolve a sessão
desse admin.

Não é código morto inofensivo. Confirmei no build que a ação está registrada e é despachável:

```
403e77bc47d137b82a7cbf436c6e8df66aa68f59a5  loginComGoogleAction
```

Está em `.next/server/server-reference-manifest.json`. Basta um `POST` para qualquer rota do app
com o header `Next-Action: 403e77...` e o email no corpo. Nenhum componente do projeto chama essa
ação (`grep` em `src` e `tests` não achou nenhuma referência fora da própria definição), o que
significa que ela existe apenas como superfície de ataque.

Correção imediata, sem depender do resto do projeto: apagar `loginComGoogleAction` de
`src/app/actions/auth.ts`. `entrarComGoogle` em `src/domain/auth.ts` pode ficar, porque não é
uma Server Action e será reaproveitada pelo R3, mas nenhuma função que chame `setSession` sem
verificar credencial pode continuar exportada de um arquivo `'use server'`.

### Achado 2 (crítico): qualquer um reivindica a conta de qualquer aluno

`entrarComSenha` faz três coisas diferentes na mesma função:

1. Email desconhecido: **cria a conta** com a senha informada e loga.
2. Email conhecido com `senhaHash`: valida a senha.
3. Email conhecido **sem** `senhaHash`: grava a senha informada e loga.

O caso 3 é o problema. A recepção cria contas pré-provisionadas via `garantirAluno` toda vez que
recebe um item de uma matrícula ainda não cadastrada, e essas contas nascem com `senhaHash: null`.
Como o email é derivado da matrícula (`10240099@aluno.cotemig.com.br`), qualquer pessoa que saiba
ou chute uma matrícula assume a conta daquele aluno, define a senha e fica com o saldo dele. Isso
está inclusive coberto por teste como se fosse comportamento desejado, em
`tests/integration/auth.integration.test.ts:64`.

O caso 1 também impede o critério de aceite "resposta indistinguível entre conta existente e
inexistente": hoje conta inexistente responde sucesso e conta existente com senha errada responde
`CREDENCIAL_INVALIDA`. Enquanto o cadastro acontecer dentro do login, esse critério é impossível.

É exatamente o buraco que o R2 fecha: com vínculo Cotemig obrigatório, só assume a conta quem
prova ter as credenciais do portal.

### Achado 3 (alto): nenhum rate limiting

Não existe nada. Sem `middleware.ts`, sem tabela de tentativas, sem contador em memória. Um
script simples testa senhas contra `loginComSenhaAction` na velocidade que o servidor aguentar.
O único freio acidental é o custo do scrypt, e mesmo esse não se aplica ao achado 1.

### Achado 5 (médio): política de senha

`z.string().min(4)`. Quatro caracteres. Combinado com a ausência de rate limiting, o espaço de
busca é trivial.

---

## 0.2 Contrato de `GET /v1/perfil`

### O que confirmei sem credencial

Baixei a especificação oficial em `https://api.cotemig.com.br/v1/doc/cotemig-api.yaml`
(OpenAPI 3.0.1, versão 1.3 da API) e sondei o endpoint.

Confirmado:

- `GET /v1/perfil` existe, sem parâmetros, resumo "Retorna um objeto contendo os dados do usuário".
- A API aceita dois esquemas de segurança globais: `bearerAuth` e `basicAuth`. Basic Auth serve
  direto no `/perfil`, sem precisar passar pelo `/autenticacao`. Isso é o que viabiliza a
  restrição de "somente GET".
- Sem credencial, a resposta é:

  ```
  HTTP/1.1 401 Unauthorized
  WWW-Authenticate: Basic realm="COTEMIG API v1"
  {"erro":401,"codigo":103,"detalhes":"Usuário ou senha não conferem."}
  ```

  Note que o corpo real tem um campo `codigo` que não aparece no schema `ErrorResponse` da
  documentação. Latência da sondagem: 92 ms a partir da minha máquina.
- O servidor responde `401` também para `POST`, `PUT` e `DELETE` em `/perfil`, ou seja, o método
  não é validado antes da autenticação. Isso reforça a necessidade de travar o método do nosso
  lado, e não confiar na API.
- `Access-Control-Allow-Origin: *`. Seria tecnicamente possível chamar do navegador, mas isso
  colocaria a senha do aluno no cliente. Fica server-side, como o requisito manda.
- O exemplo oficial em Node.js usa `json.id` e `json.nome` na resposta 200. Nenhum outro campo
  aparece nos exemplos.

### O que NÃO consigo confirmar e por quê

A especificação define a resposta de `/perfil` como:

```yaml
  /perfil:
    get:
      responses:
        200:
          description: Ok
```

Sem `content`, sem `schema`. A documentação simplesmente não descreve o objeto. E o "Try it out"
do Swagger exige uma credencial real de aluno, que eu não tenho e não devo ter.

Checklist da tarefa, com o que dá para responder:

| Item | Status |
|---|---|
| A resposta inclui o email do aluno? | **Desconhecido. Bloqueia o R3.2.** |
| O `id` é estável e único por pessoa? | Provável (o exemplo o chama de "Codigo"), não confirmado |
| Há campo que diferencie aluno/professor/funcionário? | Desconhecido |
| Status com credencial inválida | **401**, corpo `{erro, codigo, detalhes}` |
| Latência típica | 92 ms para o 401. Autenticado, desconhecido |
| Rate limit próprio da API | Não documentado. Nenhum header `RateLimit-*` no 401 |
| Comportamento com usuário inativo/egresso | Desconhecido |

### Comando para você rodar

Com uma credencial real do portal, rode isto e me devolva **só a saída**, que lista as chaves e
os tipos, sem os valores:

```bash
curl -s -u 'SEU_USUARIO:SUA_SENHA' https://api.cotemig.com.br/v1/perfil \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print({k: type(v).__name__ for k,v in d.items()})'
```

Se quiser conferir se algum campo tem cara de email sem me mostrar o endereço:

```bash
curl -s -u 'SEU_USUARIO:SUA_SENHA' https://api.cotemig.com.br/v1/perfil \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print([k for k,v in d.items() if isinstance(v,str) and "@" in v])'
```

Vale a pena rodar o mesmo em `GET /v1/rede`, que segundo a documentação "retorna um objeto
contendo a permissão de acesso e a URL de endpoint da API de acesso à rede interna das unidades
Barroca e Floresta". Se ele indicar a unidade da pessoa, resolve a atribuição Barroca/Floresta
melhor do que a regra atual de "matrícula começa com 2".

### Alerta sobre a mesma API

A API do Cotemig expõe `PUT /atualizarSenha`, que troca a senha do portal do aluno. É a
justificativa concreta para a restrição de somente GET: um erro nosso nessa integração não pode
esbarrar em algo que altera a conta institucional. O módulo isolado com um único ponto de saída,
mais o teste que garante que nenhum método diferente de GET é emitido, cobrem isso.

Também vale registrar: o portal do Cotemig muito provavelmente bloqueia a conta do aluno após N
tentativas erradas. Se a nossa tela de vínculo virar alvo de brute force, o efeito colateral não
é apenas na feira, é o aluno perdendo o acesso ao portal do colégio. O rate limit do R2 precisa
mesmo ser mais duro que o do login normal.

---

## 0.3 Viabilidade do login com Google

| Item | Resultado | Evidência |
|---|---|---|
| Colégio usa Google Workspace | **Sim, confirmado** | MX de `cotemig.com.br` aponta para `aspmx.l.google.com` |
| Domínio dos alunos | `aluno.cotemig.com.br`, alias do principal | O MX de `aluno.cotemig.com.br` é um CNAME para `cotemig.com.br` |
| Biblioteca de auth já no projeto | Não | Sem NextAuth/Auth.js no `package.json` |
| Secrets no ambiente de deploy | Sim | `SESSION_SECRET` e `DATABASE_URL` já são env vars |
| Egress para o Google | Provável | Sem restrição conhecida. Depende do host escolhido |
| Domínio público com HTTPS | **Não confirmado** | Não há `vercel.json`, `railway.json` nem `Procfile` no repositório |

**Veredito: GO condicional.** O único item aberto é a URL pública de produção, porque o Google
exige `https://` no redirect URI (exceto `localhost`). Se o app já roda em Railway, Vercel ou
Render, todos dão HTTPS por padrão e o item está resolvido: basta me passar a URL. Se ele vai
rodar em uma máquina dentro do colégio, sem domínio e sem certificado, é **NO-GO** e o Google
fica atrás de `GOOGLE_AUTH_ENABLED=false`.

Confirmando o que o enunciado já observava: o PostgreSQL não é impedimento nenhum. O banco só
guarda o vínculo `provider` + `providerAccountId` + `userId`. Os impeditivos reais são callback
HTTPS público, egress e armazenamento de secrets.

### Detalhe do Workspace que muda a implementação

Como `aluno.cotemig.com.br` é um alias do domínio principal, a claim `hd` do ID token
provavelmente virá como `cotemig.com.br`, e não como `aluno.cotemig.com.br`, mesmo para alunos.
O campo `email` também pode voltar no domínio principal em vez do alias. Por isso a validação
server-side precisa aceitar os dois domínios, e o casamento com a conta local não pode assumir
que o email do Google é idêntico ao email gravado hoje na tabela `users`.

Isso reforça a recomendação do R3.2: **Google como método de login secundário**, associado após
a pessoa já estar autenticada e vinculada pelo R2. Cadastro inicial via Google desabilitado.
Mesmo que `/perfil` retorne o email, o descasamento alias/principal torna o casamento automático
frágil demais para o dia do evento.

---

## Conflitos entre os requisitos e o código atual

Pontos em que o R1/R2/R3 exigem decisão sua antes de eu codar.

1. **Não existe tela de cadastro.** O R2 diz que o vínculo acontece "no cadastro, não a cada
   login", mas hoje o cadastro é um efeito colateral do primeiro login. Ou eu crio uma tela
   `/cadastro` separada, ou transformo o primeiro login em um fluxo de duas etapas. Preciso da
   sua escolha.

2. **O que fazer com as contas que já existem.** Há usuários no banco sem `cotemigId`,
   incluindo os atendentes e o admin, que não necessariamente têm login de aluno no portal. Se o
   vínculo virar obrigatório para todos, o admin se tranca fora do próprio sistema. Sugestão:
   `cotemigId` obrigatório apenas para `participante`; atendentes e admin continuam por senha
   local. Precisa do seu aval.

3. **Contas pré-provisionadas pela recepção.** Elas continuam existindo (a recepção precisa
   creditar quem ainda não entrou no app). Com o R2, elas passam a ser reivindicadas apenas por
   quem provar o vínculo Cotemig, casando pela matrícula. É o que fecha o achado 2. Se
   `/perfil` não devolver a matrícula em algum campo, esse casamento precisa de outro caminho, e
   isso depende da resposta da seção 0.2.

4. **Migração do hash de senha.** O formato atual `salt:hash` não guarda os parâmetros de custo.
   Para aumentar o custo sem deslogar ninguém, proponho prefixar os hashes novos
   (`scrypt$N$r$p$salt$hash`), tratar o formato antigo como legado e reescrever o hash no próximo
   login bem-sucedido. Sem perda de usuários e sem migration destrutiva.

5. **Sem Redis.** Não vou adicionar dependência de infraestrutura. O rate limiting fica no
   Postgres, com incremento atômico em um único `UPDATE` (nada de ler e depois escrever no
   JavaScript) e limpeza dos registros vencidos. Para dezenas ou centenas de usuários simultâneos
   isso é folgado. Se você discordar, me avise antes.

6. **Identificação de IP.** Preciso saber onde o app vai rodar em produção para decidir qual
   posição do `x-forwarded-for` é confiável. Com o número de proxies errado, o limite por IP ou
   vira inútil (dá para forjar o header) ou bloqueia o colégio inteiro. Enquanto isso não estiver
   definido, o limite por IP fica desligado por env var e só o limite por identidade opera.

---

## O que eu recomendo fazer agora, antes de qualquer implementação

1. Apagar `loginComGoogleAction` de `src/app/actions/auth.ts`. É uma exclusão de 13 linhas, sem
   nenhum chamador, e fecha um bypass total de autenticação que está no ar.
2. Confirmar que `SESSION_SECRET` está definido em produção com valor aleatório.
3. Rodar o comando da seção 0.2 e me mandar a lista de chaves.
4. Me dizer a URL pública de produção, para fechar o GO/NO-GO do Google.
5. Decidir os itens 1, 2 e 5 da seção de conflitos.

Com isso respondido, sigo para a Fase 1.
