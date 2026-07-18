// Sets a user's password (there's no public sign-up or reset flow). Asks for the password twice
// without echoing it and stores the bcrypt hash, same as auth.ts expects. With --create it also
// creates the user when the email doesn't exist yet; without it a typo can't create a new account.
//
//   npx tsx --env-file=.env scripts/set-password.ts admin@ejemplo.com
//   npx tsx --env-file=.env scripts/set-password.ts nuevo@ejemplo.com --create --name "Nombre"
import readline from "node:readline"
import bcrypt from "bcryptjs"
import { prisma } from "../lib/db"

const MIN_LENGTH = 8

function askHidden(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  // Write the prompt, then swallow every echoed keystroke.
  let muted = false
  const out = rl as unknown as { _writeToOutput: (s: string) => void }
  out._writeToOutput = (s: string) => {
    if (!muted) process.stdout.write(s)
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write("\n")
      resolve(answer)
    })
    muted = true
  })
}

async function main() {
  const args = process.argv.slice(2)
  const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase()
  const create = args.includes("--create")
  const nameIdx = args.indexOf("--name")
  const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined

  if (!email) {
    console.error('Falta el email. Uso: npx tsx --env-file=.env scripts/set-password.ts <email> [--create --name "Nombre"]')
    process.exitCode = 1
    return
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } })
  if (!user && !create) {
    console.error(`No existe un usuario con el email ${email}. Para crearlo, agregá --create.`)
    process.exitCode = 1
    return
  }

  const password = await askHidden(`Nueva contraseña para ${email}: `)
  if (password.length < MIN_LENGTH) {
    console.error(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`)
    process.exitCode = 1
    return
  }
  const confirm = await askHidden("Repetila: ")
  if (password !== confirm) {
    console.error("Las contraseñas no coinciden. No se cambió nada.")
    process.exitCode = 1
    return
  }

  const hashed = await bcrypt.hash(password, 10)
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } })
    console.log(`Contraseña actualizada para ${email}.`)
  } else {
    await prisma.user.create({ data: { email, name: name ?? null, password: hashed } })
    console.log(`Usuario ${email} creado.`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
