import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  // Auth.js only infers a safe host automatically in `next dev` or on known platforms like
  // Vercel. Running `next start` locally/self-hosted is neither, so every request gets marked
  // "untrusted" and session checks fail — see https://errors.authjs.dev#untrustedhost. Safe here
  // because this instance isn't exposed to arbitrary Host headers from the public internet; if it
  // ever is, prefer setting AUTH_URL to the real public URL instead of this blanket trust.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user?.password) return null

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!passwordMatch) return null

        return { id: user.id, email: user.email, name: user.name }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
})
