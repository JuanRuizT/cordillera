'use client'

import { useState, useActionState } from 'react'
import { createTodo, updateTodo, deleteTodo, toggleTodo } from './actions'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type User = { id: number; name: string | null; email: string }
type Todo = {
  id: number
  title: string
  description: string | null
  completed: boolean
  authorId: number
  author: { name: string | null; email: string }
}

function TodoForm({
  todo,
  users,
  onSuccess,
}: {
  todo: Todo | null
  users: User[]
  onSuccess: () => void
}) {
  const action = todo ? updateTodo : createTodo
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
      {todo && <input type="hidden" name="id" value={todo.id} />}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Título *</label>
        <Input name="title" defaultValue={todo?.title ?? ''} required />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Descripción</label>
        <textarea
          name="description"
          defaultValue={todo?.description ?? ''}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Autor *</label>
        <select
          name="authorId"
          defaultValue={todo?.authorId ?? ''}
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Seleccionar usuario...</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.email}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Guardando...' : todo ? 'Actualizar' : 'Crear'}
      </Button>
    </form>
  )
}

export function TodosClient({
  todos,
  users,
}: {
  todos: Todo[]
  users: User[]
}) {
  const [open, setOpen] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)

  function openCreate() {
    setEditingTodo(null)
    setOpen(true)
  }

  function openEdit(todo: Todo) {
    setEditingTodo(todo)
    setOpen(true)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingTodo ? 'Editar Todo' : 'Nuevo Todo'}</SheetTitle>
          </SheetHeader>
          <TodoForm
            key={editingTodo?.id ?? 'new'}
            todo={editingTodo}
            users={users}
            onSuccess={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Mis Todos</h1>
        <Button onClick={openCreate}>+ Nuevo Todo</Button>
      </div>

      {todos.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          No hay todos aún. ¡Crea el primero!
        </p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Título</th>
                <th className="px-4 py-3 text-left font-medium">Descripción</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="px-4 py-3 text-left font-medium">Autor</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {todos.map((todo) => (
                <tr key={todo.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <span className={todo.completed ? 'line-through text-muted-foreground' : ''}>
                      {todo.title}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {todo.description ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        todo.completed
                          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                      }`}
                    >
                      {todo.completed ? 'Completado' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {todo.author.name ?? todo.author.email}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <form action={toggleTodo}>
                        <input type="hidden" name="id" value={todo.id} />
                        <input
                          type="hidden"
                          name="completed"
                          value={String(todo.completed)}
                        />
                        <Button type="submit" variant="outline" size="sm">
                          {todo.completed ? 'Desmarcar' : 'Completar'}
                        </Button>
                      </form>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(todo)}
                      >
                        Editar
                      </Button>
                      <form action={deleteTodo}>
                        <input type="hidden" name="id" value={todo.id} />
                        <Button type="submit" variant="outline" size="sm" className="text-destructive hover:text-destructive">
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
