// Sondagem da API do Cotemig. Só leitura, só GET, só os endpoints da lista abaixo.
//
// Uso (as credenciais vêm do ambiente, nunca de arquivo nem de argumento):
//   COTEMIG_USER=... COTEMIG_PASS=... node scripts/sondar-cotemig.mjs
//
// A saída descreve a FORMA da resposta (chaves, tipos, tamanhos, classe de caracteres).
// Nenhum valor de campo textual é impresso, e a senha não aparece em lugar nenhum.

const BASE = 'https://api.cotemig.com.br/v1';

const ENDPOINTS = ['/perfil', '/rede'];

const METODO_PROIBIDO = /atualizarSenha|autenticacao|declaracoesEmitidas/i;

const usuario = process.env.COTEMIG_USER;
const senha = process.env.COTEMIG_PASS;

if (!usuario || !senha) {
  console.error('Defina COTEMIG_USER e COTEMIG_PASS no ambiente. Nada é lido de arquivo.');
  process.exit(1);
}

function autorizacao() {
  return `Basic ${Buffer.from(`${usuario}:${senha}`).toString('base64')}`;
}

function classe(texto) {
  if (/^\d+$/.test(texto)) return 'só dígitos';
  if (texto.includes('@')) return 'contém @';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(texto)) return 'data dd/mm/aaaa';
  if (/^[A-Za-zÀ-ÿ]+$/.test(texto)) return 'só letras';
  if (/^[A-Za-zÀ-ÿ ]+$/.test(texto)) return 'letras e espaços';
  return 'misto';
}

function descrever(valor) {
  if (valor === null) return 'null';
  if (Array.isArray(valor)) return `array[${valor.length}]`;
  if (typeof valor === 'object') return `object{${Object.keys(valor).join(',')}}`;
  if (typeof valor === 'boolean') return `boolean=${valor}`;
  if (typeof valor === 'number') return `number (${String(valor).length} dígitos)`;
  const texto = String(valor);
  const marcas = [];
  if (texto === usuario) marcas.push('IGUAL AO COTEMIG_USER');
  if (/^\d{4,12}$/.test(texto)) marcas.push('cara de matrícula');
  return `string (len ${texto.length}, ${classe(texto)})${marcas.length ? ' [' + marcas.join('; ') + ']' : ''}`;
}

async function sondar(caminho) {
  const url = `${BASE}${caminho}`;

  if (METODO_PROIBIDO.test(url)) {
    throw new Error(`Recusado: ${caminho} não é um endpoint de leitura seguro.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const inicio = Date.now();

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: autorizacao(), Accept: 'application/json' },
      signal: controller.signal,
      redirect: 'manual',
    });

    const ms = Date.now() - inicio;
    const texto = await res.text();

    console.log(`\n=== GET ${caminho} ===`);
    console.log(`status: ${res.status} ${res.statusText}   latência: ${ms} ms   bytes: ${texto.length}`);

    const rate = [...res.headers].filter(([k]) => /ratelimit|retry-after|x-rate/i.test(k));
    console.log(`headers de rate limit: ${rate.length ? JSON.stringify(rate) : 'nenhum'}`);

    if (res.status !== 200) {
      console.log('corpo (erro, seguro imprimir):', texto.slice(0, 300));
      return;
    }

    let dados;
    try {
      dados = JSON.parse(texto);
    } catch {
      console.log('resposta não é JSON.');
      return;
    }

    if (Array.isArray(dados)) {
      console.log(`resposta é um array de ${dados.length} itens`);
      dados = dados[0] ?? {};
    }

    console.log('campos:');
    for (const [chave, valor] of Object.entries(dados)) {
      console.log(`  ${chave}: ${descrever(valor)}`);
    }

    const comArroba = Object.entries(dados)
      .filter(([, v]) => typeof v === 'string' && v.includes('@'))
      .map(([k]) => k);
    console.log(`chaves com "@": ${comArroba.length ? comArroba.join(', ') : 'nenhuma'}`);

    const matricula = Object.entries(dados)
      .filter(([, v]) => /^\d{4,12}$/.test(String(v)))
      .map(([k]) => k);
    console.log(`candidatas a matrícula: ${matricula.length ? matricula.join(', ') : 'nenhuma'}`);
  } catch (err) {
    const motivo = err.name === 'AbortError' ? 'timeout (8s)' : err.message;
    console.log(`\n=== GET ${caminho} ===`);
    console.log(`falhou: ${motivo}`);
  } finally {
    clearTimeout(timer);
  }
}

console.log('Sondagem somente leitura. Nenhum valor de campo textual é impresso.');

for (const caminho of ENDPOINTS) {
  await sondar(caminho);
}

console.log('\n=== credencial inválida (controle) ===');
const res = await fetch(`${BASE}/perfil`, {
  method: 'GET',
  headers: { Authorization: `Basic ${Buffer.from('usuario-que-nao-existe:x').toString('base64')}` },
});
console.log(`status: ${res.status}   corpo: ${(await res.text()).slice(0, 200)}`);
