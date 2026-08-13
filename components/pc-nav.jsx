import { SidebarContentGrouped } from "./sidebar-content-grouped";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function PcNav({ user, collapsed, onToggle }) {
  return (
    <aside
      className={cn(
        "hidden lg:flex bg-sidebar border-r border-sidebar-border flex-col h-screen sticky top-0 shrink-0 transition-all duration-300",
        collapsed ? "w-17" : "w-64"
      )}
    >
      <SidebarContentGrouped user={user} collapsed={collapsed} />
      {/* Collapse toggle button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-7 z-20 w-6 h-6 rounded-full bg-sidebar border border-sidebar-border flex items-center justify-center text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors shadow-sm"
      >
        {collapsed ? (
          <PanelLeftOpen className="w-3.5 h-3.5" />
        ) : (
          <PanelLeftClose className="w-3.5 h-3.5" />
        )}
      </button>
    </aside>
  );
}
