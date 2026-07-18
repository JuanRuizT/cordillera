import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { auth } from "@/auth"

export async function BaseLayout({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  const session = await auth()
  const user = session?.user ?? null

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar user={user} />
      <SidebarInset className="min-w-0 min-h-0">
        <SiteHeader />
        <div className={`flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8 min-w-0 min-h-0${wide ? "" : " overflow-y-auto"}`}>
          <div className={`mx-auto w-full min-w-0${wide ? " flex flex-1 flex-col min-h-0" : " max-w-6xl"}`}>{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
