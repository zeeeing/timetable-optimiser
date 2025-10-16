import React from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "./components/ui/sidebar";
import { AppSidebar } from "./components/AppSidebar";

const Layout: React.FC = () => {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex flex-1 w-full flex-col min-h-svh bg-indigo-200 py-2 px-24">
        <AppSidebar />
        <div>
          <Outlet />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Layout;
