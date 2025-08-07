import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

const Layout: React.FC = () => {
  const location = useLocation();

  const navigationItems = [
    { href: "/", label: "Home", key: 1 },
    { href: "/overview", label: "Overview", key: 2 },
  ];

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-100 to-indigo-300">
      <div className="max-w-7xl mx-auto flex justify-center gap-8 py-6">
        {navigationItems.map((item) => (
          <div
            key={item.key}
            className={`${location.pathname === item.href && "font-bold"}`}
          >
            <Link to={item.href}>{item.label}</Link>
          </div>
        ))}
      </div>
      <div className="pb-6 px-6">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
