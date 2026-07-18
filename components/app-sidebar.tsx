"use client"

import { Users, Mountain, LogOut, BrainCircuit, CheckSquare, FileText, BookOpen, Building2, BarChart3, HardHat, ReceiptText, Landmark, Coins, HandCoins } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { logout } from "@/app/actions/auth"

const navItems = [
  {
    title: "Extractos Bancarios",
    url: "/bank-statements",
    icon: FileText,
  },
  {
    title: "Contabilidad",
    url: "/accounting",
    icon: BookOpen,
  },
  {
    title: "Cuentas de Cobro",
    url: "/invoices",
    icon: ReceiptText,
  },
  {
    title: "Análisis",
    url: "/accounting/analysis",
    icon: BarChart3,
  },
  {
    title: "Mis Tareas",
    url: "/todos",
    icon: CheckSquare,
  },
  {
    title: "Demo RAG",
    url: "/demo-rag",
    icon: BrainCircuit,
  },
  {
    title: "Usuarios",
    url: "/users",
    icon: Users,
  },
  {
    title: "Contratistas",
    url: "/contractors",
    icon: HardHat,
  },
  {
    title: "Cuentas Bancarias",
    url: "/accounts",
    icon: Landmark,
  },
  {
    title: "Datos Edificio",
    url: "/building-data",
    icon: Building2,
  },
  {
    title: "Costos IA",
    url: "/ai-usage",
    icon: Coins,
  },
  {
    title: "Paz y Salvo",
    url: "/accounting/paz-y-salvo",
    icon: HandCoins,
  },
]

type User = {
  name?: string | null
  email?: string | null
  image?: string | null
}

export function AppSidebar({ user }: { user: User | null }) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link href="/accounting">
                <Mountain className="mr-2 h-6 w-6 !size-5" />
                <span className="text-base font-semibold">Cordillera</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.url}
                    tooltip={item.title}
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-sm">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">
                  {user?.name ?? user?.email ?? "User"}
                </span>
                {user?.name && user?.email && (
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                )}
              </div>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={logout}>
              <SidebarMenuButton
                type="submit"
                tooltip="Cerrar sesión"
                className="w-full text-muted-foreground hover:text-foreground"
              >
                <LogOut />
                <span>Cerrar sesión</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
