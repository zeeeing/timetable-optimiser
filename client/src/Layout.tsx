import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, useSidebar } from "./components/ui/sidebar";
import { AppSidebar } from "./components/AppSidebar";

function SidebarAutoCloser() {
  const location = useLocation();
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  React.useEffect(() => {
    if (isMobile && openMobile) setOpenMobile(false);
  }, [location.pathname]);
  return null;
}

const Layout: React.FC = () => {
  return (
    <SidebarProvider>
      <SidebarAutoCloser />
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
