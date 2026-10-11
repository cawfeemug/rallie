import { Link, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth';
import { Layout } from './components/Layout';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import HostSession from './pages/HostSession';
import Landing from './pages/Landing';
import Participant from './pages/Participant';
import Present from './pages/Present';

function NotFound() {
  return (
    <main className="container container-narrow">
      <h1 className="page-title">Page not found</h1>
      <p className="muted">That address does not match anything here.</p>
      <p style={{ marginTop: '1rem' }}>
        <Link className="btn btn-primary" to="/">
          Back to Rallie
        </Link>
      </p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Phone and projector screens have their own full-bleed layouts. */}
      <Route path="/s/:code" element={<Participant />} />
      <Route path="/present/:code" element={<Present />} />

      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="auth" element={<Auth />} />
        <Route
          path="host"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route
          path="host/:code"
          element={
            <RequireAuth>
              <HostSession />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
