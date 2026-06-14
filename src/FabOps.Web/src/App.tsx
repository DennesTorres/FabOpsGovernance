import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import HexLogo from './components/HexLogo';
import LandingPage from './pages/LandingPage';
import ChatPage from './pages/ChatPage';
import ConfigPage from './pages/ConfigPage';

function AppShell() {
  const { account, isInitializing, authConfigured, logout } = useAuth();

  if (isInitializing) {
    return (
      <div className="loading-screen">
        <div className="loading-brand">
          <HexLogo id="load-logo" size={48} />
          <span>FabOps</span>
        </div>
        <div className="loading-spinner" />
      </div>
    );
  }

  // Gate on sign-in only when the backend has Entra configured; otherwise run open.
  if (authConfigured && !account) return <LandingPage />;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <HexLogo id="app-logo" size={28} />
          <span className="header-brand">FabOps</span>
        </div>

        <nav className="header-nav">
          <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Chat
          </NavLink>
          <NavLink to="/config" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            Configuration
          </NavLink>
        </nav>

        <div className="header-right">
          {account && (
            <>
              <span className="header-user" title={account.username}>
                {account.name ?? account.username}
              </span>
              <button className="btn-signout" onClick={logout}>Sign out</button>
            </>
          )}
        </div>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
