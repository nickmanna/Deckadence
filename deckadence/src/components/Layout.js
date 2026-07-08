import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Footer from './Footer';
import './Layout.css';

const Layout = () => {
  // Lives here rather than in Sidebar itself: Layout is the layout Route
  // that wraps <Outlet/>, so it never remounts on navigation between
  // pages - state here persists across route changes app-wide, whereas
  // state inside a page component would reset every time you navigated.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((c) => !c)} />
      <div className="app-shell-main">
        <main className="app-shell-content">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
};

export default Layout;
