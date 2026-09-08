// Configuração central do NextAuth.js (L1-T03, SDD.md §7, TASK.md item 12).
//
// Decisão de provider: Credentials (e-mail/senha), não magic link.
// Motivo: magic link exige um provider de e-mail (SMTP) configurado, que não
// está disponível/decidido neste estágio do projeto (nenhuma variável de
// ambiente de e-mail em `.env.example`); Credentials entrega o mesmo
// critério de aceite ("criar conta associa user_id") sem introduzir uma nova
// dependência de infraestrutura de e-mail transacional fora de escopo desta
// tarefa. Pode ser revisitado com um ADR próprio se o produto priorizar
// magic link depois.
//
// Consequência técnica dessa escolha: o NextAuth só suporta estratégia de
// sessão "jwt" quando o Credentials Provider está em uso (sessão de banco via
// adapter não é populada automaticamente nesse fluxo) — por isso
// `session.strategy = "jwt"` abaixo. O cookie de sessão do NextAuth
// continua httpOnly/secure (padrão da própria lib, reforçado nas opções de
// cookie), preenchendo o requisito de SDD.md §7 para o caminho autenticado;
// o caminho anônimo é resolvido à parte por `src/lib/anonymous-session.ts` +
// `src/middleware.ts`, e não depende do NextAuth.
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [
    CredentialsProvider({
      name: "Credenciais",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const isValid = await verifyPassword(
          credentials.password,
          user.passwordHash,
        );
        if (!isValid) {
          return null;
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    // `userId` persiste no token e sobrevive a reload (o token é o próprio
    // cookie de sessão, assinado com NEXTAUTH_SECRET) — critério de aceite
    // "sessão sobrevive a reload" para o caminho autenticado.
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
};
