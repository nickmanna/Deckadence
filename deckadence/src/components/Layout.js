import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Footer from './Footer';
import './Layout.css';

const Layout = () => {
  return (
    <div className="app-shell">
      <Sidebar />
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
