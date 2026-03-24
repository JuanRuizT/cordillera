"use server"

import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { signIn, signOut } from "@/auth"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { z } from "zod"

const SignupSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

export type SignupState =
  | {
      errors?: {
        name?: string[]
        email?: string[]
        password?: string[]
        confirmPassword?: string[]
      }
      message?: string
    }
  | undefined

export async function signup(
  state: SignupState,
  formData: FormData
): Promise<SignupState> {
  const result = SignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors }
  }

  const { name, email, password } = result.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return { message: "Email already in use." }
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  await prisma.user.create({
    data: { name, email, password: hashedPassword },
  })

  await signIn("credentials", { email, password, redirectTo: "/demo-rag" })
}

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export type LoginState = { message?: string } | undefined

export async function login(
  state: LoginState,
  formData: FormData
): Promise<LoginState> {
  const result = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })

  if (!result.success) {
    return { message: "Invalid email or password." }
  }

  try {
    await signIn("credentials", {
      email: result.data.email,
      password: result.data.password,
      redirectTo: "/demo-rag",
    })
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { message: "Invalid email or password." }
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" })
}
