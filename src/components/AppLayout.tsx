import { Outlet } from "@tanstack/react-router";
import { AppSidebar } from "./AppSidebar";

export function AppLayout() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <AppSidebar />
      <main className="ml-64 min-h-screen overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
