'use client'

import { useState, useActionState } from 'react'
import { createUser, updateUser, deleteUser } from './actions'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type User = { id: number; name: string | null; email: string; _count: { todos: number } }

function UserForm({
  user,
  onSuccess,
}: {
  user: User | null
  onSuccess: () => void
}) {
  const action = user ? updateUser : createUser
  const [, formAction, pending] = useActionState(
    async (_prevState: null, formData: FormData) => {
      await action(null, formData)
      onSuccess()
      return null
    },
    null
  )

  return (
    <form action={formAction} className="flex flex-col gap-4 mt-4">
      {user && <input type="hidden" name="id" value={user.id} />}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Nombre</label>
        <Input name="name" defaultValue={user?.name ?? ''} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Email *</label>
        <Input
          name="email"
          type="email"
          defaultValue={user?.email ?? ''}
          required
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Guardando...' : user ? 'Actualizar' : 'Crear'}
      </Button>
    </form>
  )
}

export function UsersClient({ users }: { users: User[] }) {
  const [open, setOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  function openCreate() {
    setEditingUser(null)
    setOpen(true)
  }

  function openEdit(user: User) {
    setEditingUser(user)
    setOpen(true)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</SheetTitle>
          </SheetHeader>
          <UserForm
            key={editingUser?.id ?? 'new'}
            user={editingUser}
            onSuccess={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <Button onClick={openCreate}>+ Nuevo Usuario</Button>
      </div>

      {users.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          No hay usuarios aún. ¡Crea el primero!
        </p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Nombre</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Todos</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{user.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3">{user._count.todos}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(user)}
                      >
                        Editar
                      </Button>
                      <form action={deleteUser}>
                        <input type="hidden" name="id" value={user.id} />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                        >
                          Eliminar
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
