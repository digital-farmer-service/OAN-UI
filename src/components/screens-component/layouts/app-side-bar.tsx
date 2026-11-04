import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  LayoutGrid,
  Layers,
  LogOut,
  Settings,
  Sparkles,
  SquareGanttChart,
  User2,
  ChevronUp,
  ChevronRight,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const projects = [{ label: "Design Engineering" }, { label: "Sales & Marketing" }];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (to: string) => pathname === to;
  const startsWith = (base: string) => pathname.startsWith(base);

  return (
    <Sidebar collapsible="icon" className="border-r">
      {/* Header */}
      <SidebarHeader className="px-3 py-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <LayoutGrid className="h-5 w-5" />
          </div>

          <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <div className="truncate text-base font-semibold">Kriatix CRM</div>
            <div className="truncate text-xs text-muted-foreground">Enterprise</div>
          </div>

          <div className="ml-auto text-muted-foreground group-data-[collapsible=icon]:hidden">
            <ChevronUp className="h-4 w-4 rotate-180" />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {/* Platform */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-2">Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Dashboard */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/")}>
                  <Link to="/" search={(old) => old}>
                    <LayoutGrid className="h-5 w-5" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Supports */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/chat")}>
                  <Link to="/chat" search={(old) => old}>
                    <BookOpen className="h-5 w-5" />
                    <span>Chat</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Settings */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/")}>
                  <Link to="/" search={(old) => old}>
                    <Settings className="h-5 w-5" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Admin Reports (collapsible) */}
              <Collapsible defaultOpen={startsWith("/reports")} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={startsWith("/reports")}>
                      <SquareGanttChart className="h-5 w-5" />
                      <span>Reports</span>
                      <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                     <SidebarMenuSub className="group-data-[collapsible=icon]:hidden">
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/")}>
                          <Link to="/" search={(old) => old}>
                            <span>Completion Ratio</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>

                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild isActive={isActive("/")}>
                          <Link to="/" search={(old) => old}>
                            <span>Time Spend Analytic</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Projects */}
        <SidebarGroup>
          <SidebarGroupLabel className="px-2">Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((p) => (
                <SidebarMenuItem key={p.label}>
                  <SidebarMenuButton>
                    <Layers className="h-4 w-4" />
                    <span>{p.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="px-2 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-12 rounded-xl">
                  <div className="h-8 w-8 overflow-hidden rounded-lg bg-muted">
                    <img
                      alt="user"
                      src={`${import.meta.env.BASE_URL}images/default-avatar.png`}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="ml-2 min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <div className="truncate text-sm font-semibold">shadcn</div>
                    <div className="truncate text-xs text-muted-foreground">m@example.com</div>
                  </div>

                  <ChevronUp className="ml-auto h-4 w-4 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                side="top"
                align="start"
                className="w-[--radix-popper-anchor-width]"
              >
                <div className="px-3 py-2">
                  <div className="text-sm font-semibold">shadcn</div>
                  <div className="text-xs text-muted-foreground">m@example.com</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2">
                  <Sparkles className="h-4 w-4" /> Upgrade to Pro
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2">
                  <User2 className="h-4 w-4" /> Account
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2">
                  <Settings className="h-4 w-4" /> Billing
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* Rail click area (nice UX for collapse) */}
      <SidebarRail />
    </Sidebar>
  );
}
