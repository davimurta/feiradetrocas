# Vínculo com a API do Cotemig

Contrato observado, decisões que ele determinou e como a integração está implementada.

Sondagem feita em 11/08/2026 com uma credencial real da faculdade, contra
`https://api.cotemig.com.br/v1` (OpenAPI 3.0.1, versão 1.3 da API). Nenhum valor de campo
foi registrado, só a forma da resposta.

## `GET /perfil`

Resposta 200 em 125 ms, 1023 bytes, sem headers `RateLimit-*`.

| Campo | Forma observada | Uso no projeto |
|---|---|---|
| `usuario` | 8 dígitos, igual ao login | **chave do vínculo** |
| `nome` | texto | nome da conta |
| `emailInstitucional` | texto com `@` | email da conta nova |
| `email` | texto com `@` | não usado |
| `emailValidado` | 5 letras | não usado |
| `ultimoAcesso` | texto | não usado |
| `fotoPerfilURL` | URL | não usado |
| `curso`, `cursoSigla`, `turma`, `numeroChamada` | texto e `null` | não usado |
| `idGrupo`, `grupo` | 1 dígito e texto | não usado |
| `telefone` | 2 dígitos | não usado |
| `permissoes` | objeto com 32 flags | não usado |

Guardamos apenas `cotemigId`, `cotemigUsuario`, `nome` e `vinculadoEm`. Nada além disso: não
replicamos a base do colégio.

### Divergências em relação à documentação oficial

1. **Não existe campo `id`.** O exemplo oficial em Node.js lê `json.id`, e a especificação não
   descreve a resposta de `/perfil` (só `200: description: Ok`, sem schema). O identificador
   estável disponível é o `usuario`, que é a matrícula. É ele que grava em `cotemigId`,
   normalizado em minúsculas.
2. **O corpo de erro tem um campo `codigo` fora do schema.** O 401 real é
   `{"erro":401,"codigo":103,"detalhes":"Usuário ou senha não conferem."}`, enquanto o
   `ErrorResponse` documentado só tem `erro` e `detalhes`. Por isso o parser é tolerante e
   nunca depende de campo não documentado.
3. **O método não é validado antes da autenticação.** `POST`, `PUT` e `DELETE` em `/perfil`
   também devolvem 401. Ou seja, a API não nos protege de um erro nosso de método: a trava
   tem que ser do nosso lado.

## `GET /rede`

Devolve `redeBarroca`, `redeFloresta` (booleanos) e as URLs `apiBarroca` e `apiFloresta`.

**Não é usado.** Indica permissão de acesso à rede wifi, não a unidade de matrícula, e só foi
observado com uma credencial da faculdade. A unidade continua saindo da regra existente
(matrícula começando com 2 é Floresta, senão Barroca). Trocar isso depende de observar um
aluno do técnico da Floresta.

## Restrição de somente GET

A mesma API expõe `PUT /atualizarSenha`, que troca a senha institucional do aluno. Um erro
nosso não pode encostar nisso.

- Toda a integração vive em [src/lib/cotemig-api.ts](../src/lib/cotemig-api.ts), com uma única
  função pública, `buscarPerfilCotemig`.
- O método é a constante `METODO = 'GET'` e a URL é montada dentro do módulo, nunca recebida
  de fora.
- [tests/unit/cotemigApi.test.ts](../tests/unit/cotemigApi.test.ts) percorre todos os caminhos
  de código (200, 401, 403, 500, 302, erro de rede, timeout) e afirma, para cada requisição
  emitida, que o método é `GET` e que a URL fica sob `api.cotemig.com.br/v1/`.

## Manuseio da senha do portal

A senha trafega pelo nosso servidor e é tratada como material tóxico.

- Usada para montar o header `Authorization` e descartada com o escopo da função. Não é
  persistida em nenhum campo, nem em forma embaralhada.
- Nunca em log. O objeto de erro do `fetch` carrega contexto da requisição, então a exceção
  original **nunca** é propagada nem registrada: o módulo devolve um motivo fechado
  (`credencial`, `indisponivel`, `resposta_invalida`).
- Nunca em URL, nunca em cookie, nunca de volta para o cliente. Dois testes afirmam isso:
  a senha não aparece em nenhuma saída de console, nem em nenhum valor devolvido ao chamador,
  incluindo os caminhos de erro.
- A tela `/cadastro` diz de forma explícita que é a senha do portal, que é usada uma única vez
  e que não fica armazenada. O campo usa `autoComplete="off"` e é limpo assim que a submissão
  termina, com ou sem sucesso.
- Timeout de 5 s por tentativa (`COTEMIG_TIMEOUT_MS`), no máximo uma repetição, e só para 5xx
  ou falha de rede. Erro de credencial nunca é repetido.

## Fluxo do cadastro

1. A pessoa informa usuário e senha do portal, mais a senha que vai usar na feira.
2. Rate limit por identidade é consultado **antes** de sair para a API do colégio.
3. `GET /perfil` com Basic Auth, server-side.
4. `200` prova o vínculo. `401/403` recusa. Rede ou 5xx é **fail-closed**: não cria conta e
   avisa indisponibilidade, sem consumir tentativa do limitador (o aluno não errou nada).
5. Casamento pelo `usuario`, que é a matrícula:
   - existe conta com esse `cotemigId` ou `codigoCarteira`, ela é **reivindicada** (é a conta
     pré-provisionada pela recepção);
   - senão, uma conta nova nasce como `participante`, com email vindo do
     `emailInstitucional` e unidade pela regra da matrícula.
6. `cotemigId` tem unique constraint: um aluno, uma conta na feira.

**Login não chama a API.** Depois de cadastrado, entra-se com a senha local. Se a API do
colégio cair no dia do evento, quem já se cadastrou continua entrando normalmente. Existe
teste afirmando exatamente isso.

## Anti-abuso

A tela de cadastro transforma a feira em superfície de brute force contra o portal do colégio,
e o portal provavelmente bloqueia a conta do aluno depois de N erros. O efeito colateral de um
ataque aqui não é só na feira: é o aluno perdendo o acesso ao boletim.

Por isso o limite do cadastro é mais duro que o do login: 3 falhas por usuário tentado contra
5 do login, e bloqueio base de 15 minutos contra 5. Enquanto o balde está bloqueado, **nenhuma
requisição sai para a API do colégio**. O admin acompanha volume anômalo na aba Acessos.

## O que não fazemos

- Não chamamos nenhum endpoint fora de `/perfil`.
- Não usamos `grupo`, `turma`, `curso`, `boletim`, `historico`, `boletos` nem `declaracoes`.
- Não guardamos foto, telefone, email pessoal nem permissões.
- Não existe credencial de aplicação: quem autentica é sempre o próprio aluno, uma vez só.
