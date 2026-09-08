// Hash/verificação de senha para o provider de Credenciais do NextAuth
// (L1-T03). bcryptjs é puro JS (sem binário nativo), compatível com
// qualquer plataforma de deploy serverless (SDD.md §3).
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
