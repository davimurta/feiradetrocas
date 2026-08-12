# Reformulação do login: o que mudou

Registro de tudo que foi corrigido e melhorado na autenticação da Feira de Trocas, em
agosto de 2026. Documentos irmãos: [AUTH-FASE0.md](AUTH-FASE0.md) traz a auditoria que
originou este trabalho, e [AUTH-COTEMIG.md](AUTH-COTEMIG.md) detalha a integração com a API
do colégio.

## Resumo

| # | O que era | O que é agora |
|---|---|---|
| 1 | Qualquer pessoa entrava como admin informando o email dele | Endpoint removido, com teste que impede a volta |
| 2 | Quem soubesse a matrícula de um aluno assumia a conta dele | Só o próprio aluno reivindica, provando o vínculo com o Cotemig |
| 3 | Nenhum limite de tentativas em lugar nenhum | Rate limiting por identidade, com backoff e desbloqueio pelo admin |
| 4 | Cookie eterno, logout não invalidava nada | Versão de sessão no cookie, conferida no banco a cada requisição |
| 5 | scrypt no custo padrão, sem caminho de migração | Formato versionado, custo ajustável, reescrita transparente |
| 6 | Login criava conta sozinho | Cadastro é um fluxo próprio, com prova de vínculo institucional |
| 7 | Quem não tem matrícula não entrava | Cadastro por código de convite, multiuso e com validade |
| 8 | Sem login federado | Google pronto atrás de flag, como método secundário |

## 1. Bypass total de autenticação (crítico)

**O problema.** A Server Action `loginComGoogleAction` recebia um email do cliente e emitia a
sessão, sem verificar credencial nenhuma. Não havia OAuth por trás: bastava informar o email
de um administrador para receber a sessão dele.

Não era código morto. A ação estava registrada no `server-reference-manifest` do build e era
despachável por HTTP com o header `Next-Action`, mesmo sem nenhum componente do projeto
chamá-la. Como o repositório é público, o identificador era derivável por qualquer pessoa.

**O que foi feito.** A ação foi removida. `entrarComGoogle` continua em `src/domain/auth.ts`,
que não é Server Action e por isso não é um endpoint, e será usada pelo callback OAuth.

**Prova.** O identificador da ação sumiu do manifest do build, e os outros dois continuam lá:

```
PRESENTE logoutAction
AUSENTE  loginComGoogleAction
PRESENTE loginComSenhaAction
```

**Impedindo a volta.** [tests/unit/acoesGuardadas.test.ts](../tests/unit/acoesGuardadas.test.ts)
varre todos os arquivos `'use server'` do projeto, encontra cada função exportada e quebra o
build se alguma delas não chamar uma guarda, ou se alguma emitir sessão sem passar por um
verificador de credencial. Toda action exportada é um endpoint público, tenha ou não chamador
no código, e o teste trata isso como invariante.

## 2. Takeover de contas pré-provisionadas (crítico)

**O problema.** `entrarComSenha` fazia três coisas na mesma função: autenticava, criava conta
quando o email era desconhecido e **gravava a senha informada em qualquer conta cujo
`senhaHash` fosse nulo**.

A recepção cria contas assim toda vez que recebe um item de uma matrícula ainda não
cadastrada, e o email delas é derivado da matrícula. Consequência: qualquer pessoa que
soubesse ou chutasse uma matrícula assumia a conta daquele aluno, definia a senha e ficava
com o saldo. O comportamento estava inclusive coberto por teste, como se fosse desejado.

**O que foi feito.** `entrarComSenha` agora só autentica:

- Email desconhecido: `CREDENCIAL_INVALIDA`.
- Conta sem `senhaHash`: `CREDENCIAL_INVALIDA`, com resposta idêntica à anterior.
- A reivindicação passou a acontecer só pelo cadastro com vínculo Cotemig.

O teste que travava a vulnerabilidade foi reescrito para asseverar o oposto.

**Enumeração.** O custo do scrypt é pago também quando a conta não existe
(`consumirTempoDeSenha`), para que o tempo de resposta não denuncie a diferença. E a checagem
de bloqueio saiu de antes da senha para depois: `CONTA_BLOQUEADA` respondido a quem errou a
senha revelava que aquela conta existe.

## 3. Rate limiting (Etapa 4)

Não existia nada. Sem `middleware.ts`, sem contador em memória, sem tabela. Um script testava
senhas na velocidade que o servidor aguentasse.

**Onde vive.** Dentro das próprias Server Actions. Server Actions não passam por middleware
de rota como Route Handlers, então confiar em `middleware.ts` deixaria o buraco aberto.

**Armazenamento.** Postgres, sem Redis, sem dependência de infraestrutura nova. A contagem
sobe num único `INSERT ... ON CONFLICT DO UPDATE` que resolve reset de janela, incremento e
backoff de uma vez. Nada de ler no JavaScript e escrever depois, que perderia contagem sob
corrida. Existe teste com dez falhas concorrentes conferindo que o balde marca exatamente dez.

**A chave é a identidade, não o IP.** No dia da feira quase todo mundo sai pelo mesmo IP
público da rede do colégio. Limitar por volume de requisições por IP bloquearia o evento
inteiro. O limite por IP existe, conta apenas falhas, tem teto alto e vem **desligado** até
`PROXIES_CONFIAVEIS` estar definido: sem saber quantos proxies existem à frente, o
`x-forwarded-for` é forjável e o limite ou não protege nada ou pune inocentes.

**Números padrão**, todos ajustáveis por variável de ambiente:

| | Login | Cadastro |
|---|---|---|
| Falhas até bloquear | 5 | 3 |
| Janela | 15 min | 15 min |
| Bloqueio base | 5 min | 15 min |
| Backoff | dobra a cada falha extra, teto de 1 h | igual |

O cadastro é mais duro porque cada tentativa ali bate na API do colégio, e o portal
provavelmente bloqueia a conta do aluno depois de N erros. O efeito colateral de um ataque
naquela tela não seria só na feira: seria o aluno perdendo o acesso ao boletim. Enquanto o
balde está bloqueado, nenhuma requisição sai para a API do colégio.

**Na tela.** O servidor devolve o tempo restante e o formulário mostra contagem regressiva,
em vez de só repetir que deu errado.

**Para o admin.** Nova aba **Acessos**: tentativas recentes com identificador, IP, resultado e
horário, bloqueios ativos com tempo restante, desbloqueio manual e limpeza dos registros
vencidos. Senha nunca é gravada ali.

## 4. Sessão invalidável

**O problema.** O valor do cookie era `HMAC(userId)`, uma função pura do identificador: sempre
o mesmo, para sempre. Não havia identificador de sessão para rotacionar. `logoutAction` só
apagava o cookie do navegador, então uma cópia feita antes continuava válida pelos sete dias,
mesmo depois do logout e mesmo depois de trocar a senha. Não havia como derrubar a sessão de
uma pessoa específica sem trocar o `SESSION_SECRET` e deslogar todo mundo.

**O que foi feito.** Nova coluna `session_version` em `users`, assinada dentro do cookie e
comparada com a linha do banco a cada requisição. Incrementar derruba na hora todos os cookies
daquela conta. Incrementa em: logout, bloqueio pelo admin, mudança de papel e troca de senha.

O modelo que já estava certo foi preservado: **o papel nunca trafega**. Ele, mais `pendente` e
`bloqueado`, continuam sendo lidos do banco a cada requisição, e trocar o papel de alguém
exige um `UPDATE` no Postgres, não dá para forjar pelo cliente.

## 5. Hash de senha

O formato antigo `salt:hash` não guardava os parâmetros de custo, o que impedia aumentá-lo sem
invalidar as senhas existentes.

Formato novo: `scrypt$N$r$p$salt$hash`, com N=2^17 por padrão e ajustável por `SCRYPT_N`. O
formato antigo continua sendo verificado e é **reescrito no custo novo no próximo login bem
sucedido**, sem deslogar ninguém e sem migration de dados.

Custo medido, para dimensionar o servidor do evento:

| N | tempo | memória por verificação |
|---|---|---|
| 2^14 (antigo) | 34 ms | 16 MB |
| 2^16 | 139 ms | 64 MB |
| **2^17 (padrão)** | **281 ms** | **128 MB** |

Vinte logins simultâneos no pico da fila custam cerca de 2,5 GB. Num servidor modesto vale
considerar 2^16: mudar o valor não invalida senha nenhuma, porque o custo vai gravado dentro
de cada hash.

**Tamanho mínimo de senha continua em 4 caracteres**, por decisão de produto. No dia do evento
a fricção de cadastro é o risco maior, e a proteção contra força bruta vem do rate limiting.

**`SESSION_SECRET`** passou a ser validado no boot em produção, incluindo os valores de exemplo
deste repositório e um mínimo de 32 caracteres. Sem isso o app não sobe, em vez de subir
assinando sessões com um segredo público.

## 6. Cadastro com vínculo Cotemig

Antes, o cadastro era efeito colateral do primeiro login. Agora é fluxo próprio, em
`/cadastro`, e prova que a pessoa é do colégio.

A sondagem da API respondeu a pergunta que travava o desenho: **`usuario` é a matrícula**.
Isso permite casar a conta pré-provisionada pela recepção comparando com `codigoCarteira`, sem
depender de email, domínio ou prefixo. Também revelou que `/perfil` **não tem o campo `id`**
que o exemplo oficial em Node.js usa, e que o corpo de erro traz um campo `codigo` fora do
schema documentado, então o parser é tolerante a campos não documentados.

Regras de segurança da integração, detalhadas em [AUTH-COTEMIG.md](AUTH-COTEMIG.md):

- **Somente GET** para `api.cotemig.com.br`, com o método como constante num módulo único. A
  mesma API expõe `PUT /atualizarSenha`, que troca a senha institucional do aluno, e responde
  401 para qualquer método: ela não nos protege de um erro nosso, a trava tem que ser nossa.
- A senha do portal é usada para montar o header e **descartada na mesma função**. Não é
  persistida, nem embaralhada, não vai para log e não volta para o cliente em nenhum caminho,
  incluindo os de erro. A exceção original do `fetch` nunca é propagada, porque carrega
  contexto da requisição.
- Timeout de 5 s, no máximo uma repetição, e só para 5xx ou falha de rede.
- **Fail-closed**: API fora do ar não cria conta.
- **Login nunca chama a API.** Se ela cair no dia do evento, quem já se cadastrou entra
  normalmente.
- `cotemigId` com unique constraint: um aluno, uma conta.

A regra de unidade ficou intacta, por decisão de produto, e aluno de faculdade não é bloqueado.

## 7. Cadastro por convite, para quem não tem matrícula

Professores, funcionários, visitantes e convidados não têm credencial no portal do Cotemig, e
o fluxo da seção 6 sozinho os deixava de fora.

O caminho escolhido foi **código de convite**, e não login federado. O Google encarece o
cadastro em massa, mas não o impede: conta Gmail é gratuita e criável aos montes. O convite
impede por construção, porque sem código nenhuma conta nasce, e o teto de quantas existem é da
organização, não do atacante. Também não depende de domínio público, HTTPS, Google nem da API
do colégio, então funciona hoje.

**Multiuso, com validade.** Não é um código por pessoa: a organização gera um por grupo e
distribui. Cada convite tem data de expiração, teto opcional de usos, descrição de para quem é,
e pode ser revogado ou estendido a qualquer momento pelo admin, na aba **Convites**.

- Código de 8 caracteres num alfabeto de 31 símbolos sem `I`, `L`, `O`, `0` e `1`, que se
  confundem quando alguém dita em voz alta ou copia de um cartaz. São cerca de 40 bits, então
  adivinhar por tentativa e erro é inviável mesmo sem rate limit.
- Aceito de qualquer jeito que a pessoa digite: minúsculo, com ou sem hífen, com espaço em
  volta.
- **A unidade fica gravada no convite**, não é escolha do visitante, que não teria como saber.
- Quem usa um convite válido entra funcionando na hora, como `participante`. Não passa por fila
  de aprovação.
- A carteira dessas contas é `v` mais seis dígitos, para não se confundir com matrícula.
- `conviteId` fica gravado na conta: dá para auditar por qual código cada visitante entrou.

**O consumo do uso é atômico.** O incremento e as três validações (ativo, não expirado, dentro
do teto) acontecem no mesmo `UPDATE`, com as condições no `WHERE`. Cinco pessoas disputando as
duas últimas vagas ao mesmo tempo resultam em exatamente duas contas, e há teste para isso. Se
a criação da conta falhar depois do resgate, o uso é devolvido.

**Anti-varredura.** O balde de rate limit do convite é global de propósito: limitar por código
tentado daria a cada chute um balde próprio, que é exatamente o que um atacante quer ao varrer
códigos. O teto é alto (40 falhas em 15 minutos, ajustável) para não punir quem só errou de
digitar, e o volume aparece na aba Acessos. Email já cadastrado não alimenta esse balde, porque
não é chute de código.

A tela `/cadastro` passou a ter dois caminhos, escolhidos por um seletor no topo: **tenho
matrícula** e **tenho um convite**.

## 8. Login com Google

Fluxo completo implementado atrás de `GOOGLE_AUTH_ENABLED`, que vem `false`. Com a flag
desligada nenhuma rota aparece na interface e o callback recusa tudo.

O Google é **método secundário de login, nunca de cadastro**: a conta nasce pelo vínculo com o
Cotemig, e depois a pessoa associa a conta Google em `/conta`. Identidade Google sem vínculo
prévio não entra e não cria nada, e nunca concede papel elevado.

- Authorization Code com PKCE S256, `state` comparado em tempo constante, `nonce` conferido
  dentro do ID token, `email_verified` obrigatoriamente `true`.
- `hd` enviado na autorização **e domínio revalidado no servidor**, porque `hd` sozinho não é
  garantia. Aceita `cotemig.com.br` e `aluno.cotemig.com.br`: como o segundo é alias do
  primeiro no Workspace, a claim e o email podem voltar no domínio principal mesmo para aluno.
- Vínculo em modelo separado `contas_externas`, com unique em (`provider`, `providerAccountId`).
- A assinatura do ID token não é verificada contra o JWKS de propósito: o token chega pela
  troca server-to-server por TLS e não passa pelo navegador, dispensa prevista em OIDC 3.1.3.7.
  A condição que tornaria a verificação obrigatória está anotada no código.

## 9. Correção de build

`src/instrumentation.ts` é compilado por Next para os dois runtimes, nodejs e edge. O import
de `src/lib/session.ts` arrastava `node:crypto` para o bundle edge, onde esse esquema não
existe, e o `next dev` quebrava com `UnhandledSchemeError`. A guarda `NEXT_RUNTIME` era de
execução e não impedia o bundling.

A validação foi extraída para `src/lib/segredo.ts`, que não importa nada de Node. A regra
continua num lugar só, e a instrumentação roda em qualquer runtime.

## Cobertura de testes

80 testes novos. Os que valem citar:

- Nenhum método diferente de GET é emitido para `api.cotemig.com.br`, verificado percorrendo
  todos os caminhos de código: 200, 401, 403, 500, 302, erro de rede e timeout.
- A senha do portal não aparece em nenhuma saída de console nem em nenhum valor devolvido ao
  chamador, incluindo os caminhos de erro.
- Contagem do rate limiter é atômica sob dez falhas concorrentes.
- Vários usuários legítimos no mesmo IP conseguem operar sem bloqueio.
- Conta existente e inexistente devolvem exatamente a mesma resposta.
- API do Cotemig fora do ar não impede o login de quem já se cadastrou.
- Toda Server Action exportada chama uma guarda, e nenhuma emite sessão sem verificar
  credencial.

- Nenhum componente de cliente arrasta um módulo `node:` para o bundle, verificado seguindo a
  cadeia de imports a partir de cada arquivo `'use client'`. Quando falha, o teste imprime o
  caminho exato que causou o problema.
- O teto de usos de um convite aguenta corrida entre cinco cadastros simultâneos.

Totais: 201 unit e componentes, 64 integração, 51 e2e de actions. O e2e de navegador tem duas
falhas, ambas anteriores a este trabalho e reproduzíveis na `main`
(`fluxo.spec.ts` na unidade Floresta e `scanner.spec.ts`).

## Configuração nova

Tudo documentado no [.env.example](../.env.example), com padrões seguros. Os que exigem decisão
antes do evento:

| Variável | Padrão | Por que decidir |
|---|---|---|
| `SESSION_SECRET` | obrigatório | Sem ele o app não sobe em produção |
| `PROXIES_CONFIAVEIS` | `0` | Enquanto for 0, o limite por IP fica desligado |
| `SCRYPT_N` | `131072` | 128 MB e 300 ms por login; considere 65536 em servidor modesto |
| `GOOGLE_AUTH_ENABLED` | `false` | Depende de domínio público com HTTPS |

## Migrations

Três, todas aditivas, sem perda de dados:

1. `20260811190000_sessao_invalidavel`: coluna `session_version` em `users`.
2. `20260811200000_vinculo_cotemig_e_rate_limit`: colunas de vínculo em `users`, tabelas
   `tentativas_auth` e `baldes_rate`.
3. `20260811210000_conta_externa`: tabela `contas_externas`.
4. `20260811230000_convites`: tabela `convites` e coluna `convite_id` em `users`.

Ao subir a primeira vez, todas as sessões abertas caem uma única vez, porque o formato do
cookie mudou. É o comportamento desejado.

## Pendências conhecidas

- **`GET /rede` e o campo `grupo` não são usados.** O primeiro poderia substituir a regra de
  unidade por prefixo de matrícula, e o segundo poderia distinguir aluno de funcionário, mas
  as duas só foram observadas com uma credencial de faculdade. Decidir exige ver um perfil de
  aluno do técnico da Floresta.
- **URL pública de produção indefinida**, o que mantém o Google desligado e o limite por IP
  sem chave confiável.
