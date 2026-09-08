// Aumenta os tipos do NextAuth para expor `session.user.id` (userId
// autenticado), preenchido pelo callback `session` em `src/lib/auth.ts`.
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}
