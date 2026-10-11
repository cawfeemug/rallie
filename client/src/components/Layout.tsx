import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ThemeToggle } from './ThemeToggle';

export function RallieMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#3A3AF0" />
      <path d="M11 24V8h6.5a4.5 4.5 0 0 1 0 9H11M17 17l5 7" fill="none" stroke="#FFC226" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />    </svg>
  );
}

/** Page chrome for the marketing and host screens. The phone and projector views have their own. */
export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <RallieMark />
          Rallie
        </Link>
        <nav className="topnav" aria-label="Main">
          {user ? (
            <>
              <Link to="/host">My sessions</Link>
              <span className="muted">{user.name}</span>
              <button
                type="button"
                className="btn btn-sm btn-quiet"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <Link to="/auth">Host sign in</Link>
          )}
          <ThemeToggle />
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
