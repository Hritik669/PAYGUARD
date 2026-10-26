import type { ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeftRight,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  LogOut,
  Scale,
  Shield,
  Send,
  WalletCards,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { api, setCsrfToken } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import type { Permission } from "../api/types";

const links: Array<{ to: string; label: string; icon: ReactNode; permission?: Permission; end?: boolean }> = [
  { to: "/", label: "Overview", icon: <LayoutDashboard size={18} />, end: true },
  { to: "/payments", label: "Payments", icon: <WalletCards size={18} /> },
  { to: "/transactions", label: "Transactions", icon: <ArrowLeftRight size={18} /> },
  { to: "/webhooks", label: "Webhooks", icon: <Webhook size={18} /> },
  { to: "/exceptions", label: "Exceptions", icon: <Inbox size={18} /> },
  { to: "/merchant-webhooks", label: "Merchant events", icon: <Send size={18} /> },
  { to: "/reconciliation", label: "Reconciliation", icon: <Scale size={18} /> },
  { to: "/audit", label: "Audit log", icon: <ClipboardList size={18} />, permission: "audit:read" },
  { to: "/health", label: "System health", icon: <Activity size={18} /> },
];

export function AppShell() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      toast.error("The session could not be revoked cleanly. Local session state was cleared.");
    }
    setCsrfToken(null);
    setUser(null);
    navigate("/login");
  }

  const visible = links.filter((link) => !link.permission || user?.permissions.includes(link.permission));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="flex flex-col bg-navy text-white lg:min-h-screen">
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent">
            <Shield size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-wide">PayGuard</p>
            <p className="text-xs text-slate-400">Operations sandbox</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-auto px-3 pb-4 lg:block lg:flex-1" aria-label="Primary">
          {visible.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              {link.icon}
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 p-4 lg:block">
          <p className="text-sm font-semibold">{user?.name}</p>
          <p className="text-xs text-slate-400">{user?.role === "ADMIN" ? "Administrator" : "Analyst"}</p>
          <button className="btn btn-ghost mt-3 w-full justify-start px-2" onClick={() => void logout()}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:px-8">
          <p className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            Sandbox environment · simulated payments only
          </p>
          <button className="btn btn-secondary lg:hidden" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
        <main className="px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
