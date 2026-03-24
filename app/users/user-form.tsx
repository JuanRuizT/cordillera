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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type User = { id: string; name: string | null; email: string; _count: { ragDocuments: number } }

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
        <label className="text-sm font-medium">Name</label>
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
        {pending ? 'Saving...' : user ? 'Update' : 'Create'}
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
            <SheetTitle>{editingUser ? 'Edit User' : 'New User'}</SheetTitle>
          </SheetHeader>
          <UserForm
            key={editingUser?.id ?? 'new'}
            user={editingUser}
            onSuccess={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <Button onClick={openCreate}>+ New User</Button>
      </div>

      {users.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          No users yet. Create the first one!
        </p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Documents</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{user.name ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3">{user._count.ragDocuments}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(user)}
                      >
                        Edit
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will delete the user{' '}
                              <span className="font-semibold">{user.name || user.email}</span>
                              {user._count.ragDocuments > 0 && (
                                <>
                                  {' and '}
                                  <span className="font-semibold">
                                    {user._count.ragDocuments} document{user._count.ragDocuments === 1 ? '' : 's'}
                                  </span>
                                </>
                              )}
                              . This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => {
                                const formData = new FormData()
                                formData.append('id', user.id)
                                deleteUser(formData)
                              }}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
