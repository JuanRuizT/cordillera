import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { auth } from "@/auth"

export async function BaseLayout({
  children,
  wide,
  selfManagedScroll,
}: {
  children: React.ReactNode
  // Drops the max-w-6xl cap so the page uses the full available width.
  wide?: boolean
  // Only for pages whose own content already carves out its own internal
  // flex-1/min-h-0/overflow-y-auto scroll region (e.g. a pinned toolbar above a scrolling
  // table) — opts out of the page-level scroll container below so that inner region gets the
  // raw, unconstrained height to divide up itself. Everything else gets the default page-level
  // scroll, which is what keeps the sidebar/"Cerrar sesión" fixed while content scrolls.
  selfManagedScroll?: boolean
}) {
  const session = await auth()
  const user = session?.user ?? null

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar user={user} />
      <SidebarInset className="min-w-0 min-h-0">
        <SiteHeader />
        <div className={`flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8 min-w-0 min-h-0${selfManagedScroll ? "" : " overflow-y-auto"}`}>
          <div
            className={`mx-auto w-full min-w-0${wide ? "" : " max-w-6xl"}${selfManagedScroll ? " flex flex-1 flex-col min-h-0" : ""}`}
          >
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
