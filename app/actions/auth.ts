"use server"

import { signIn, signOut } from "@/auth"
import { isRedirectError } from "next/dist/client/components/redirect-error"
import { z } from "zod"

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
      redirectTo: "/accounting",
    })
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { message: "Invalid email or password." }
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" })
}
