import React from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider } from "./components/ui/sidebar";
import { AppSidebar } from "./components/AppSidebar";

const Layout: React.FC = () => {
  return (
    <SidebarProvider>
      <div className="flex flex-1 w-full flex-col min-h-svh bg-gradient-to-tr from-blue-100 to-indigo-300 p-6">
        <AppSidebar />
        <div>
          <Outlet />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Layout;
