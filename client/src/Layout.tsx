import React from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "./components/ui/sidebar";
import { AppSidebar } from "./components/AppSidebar";

const Layout: React.FC = () => {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex flex-1 w-full flex-col min-h-svh bg-gradient-to-b from-indigo-100 to-indigo-300 py-2 px-24">
        <AppSidebar />
        <div>
          <Outlet />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Layout;
