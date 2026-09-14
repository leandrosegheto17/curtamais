// TEMPORÁRIO — diagnóstico de injeção de variáveis de ambiente em produção.
// NÃO expõe nada na resposta HTTP: o resultado sai apenas no log da função
// (painel autenticado da Vercel). Nenhum valor de variável é lido ou logado,
// só presença, tamanho e o nome literal da chave. Remover assim que a causa
// do NO_SECRET for identificada.

export const dynamic = "force-dynamic";

const WATCHED = [
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "DATABASE_URL",
  "OPENAI_API_KEY",
] as const;

export function GET() {
  for (const name of WATCHED) {
    const value = process.env[name];
    console.log(
      `[_diag] ${name} present=${Boolean(value)} length=${(value ?? "").length}`,
    );
  }

  for (const key of Object.keys(process.env)) {
    if (/NEXTAUTH|DATABASE|OPENAI|AI_GATEWAY/i.test(key)) {
      console.log(`[_diag] chave literal: ${JSON.stringify(key)}`);
    }
  }

  return new Response(null, { status: 204 });
}
