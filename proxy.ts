import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/auth"

const protectedRoutes = ["/todos", "/users"]
const publicRoutes = ["/login", "/signup"]

export default async function proxy(req: NextRequest) {
  const session = await auth()
  const path = req.nextUrl.pathname
  const isProtected = protectedRoutes.some((r) => path.startsWith(r))
  const isPublic = publicRoutes.some((r) => path.startsWith(r))

  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }

  if (isPublic && session) {
    return NextResponse.redirect(new URL("/todos", req.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
}
