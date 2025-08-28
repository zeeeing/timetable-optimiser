import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Button } from "./components/ui/button";
import { cn } from "./lib/utils";

const Layout: React.FC = () => {
  const location = useLocation();

  const navigationItems = [
    { href: "/", label: "Dashboard", key: 1 },
    { href: "/overview", label: "Overview", key: 2 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-tr from-blue-100 to-indigo-300 p-6">
      <div className="container mx-auto flex gap-2 pb-6 pl-4">
        {navigationItems.map((item) => (
          <div key={item.key}>
            <Link to={item.href}>
              <Button
                variant="ghost"
                className={cn(
                  "cursor-pointer hover:bg-indigo-300",
                  `${location.pathname === item.href && "font-bold text-lg"}`
                )}
              >
                {item.label}
              </Button>
            </Link>
          </div>
        ))}
      </div>
      <div>
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
