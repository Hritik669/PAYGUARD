import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import type { Permission } from "../api/types";

export function RequireAuth({ children, permission }: { children: ReactNode; permission?: Permission }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted">
        Checking your session…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (permission && !user.permissions.includes(permission)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
