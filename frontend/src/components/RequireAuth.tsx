import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context.js';
import { PageSkeleton } from './Skeleton.js';

export function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) return <PageSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
