import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";
import { api, ApiError, setCsrfToken } from "../api/client";
import type { Envelope, User } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/ui";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(12, "Password must be at least 12 characters."),
});

type FormValues = z.infer<typeof schema>;

const demos = [
  { label: "Use admin demo", email: "admin@payguard.local", password: "PayGuard-Admin-Demo-1" },
  { label: "Use analyst demo", email: "analyst@payguard.local", password: "PayGuard-Analyst-Demo-1" },
];

export function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const response = await api.post<Envelope<{ user: User; csrfToken: string }>>("/auth/login", values);
      setCsrfToken(response.data.data.csrfToken);
      setUser(response.data.data.user);
      navigate("/");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Login failed.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden bg-navy px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-sm tracking-[0.16em] text-blue-200 uppercase">PayGuard</p>
          <h1 className="mt-6 max-w-md text-4xl leading-tight font-semibold">Payment operations, with the failure modes left visible.</h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
            Review simulated charges, idempotent retries, webhook delivery, and reconciliation mismatches from one console. No live money moves here.
          </p>
        </div>
        <ul className="grid max-w-md gap-3 text-sm text-slate-200">
          <li>Duplicate payment requests collapse to one record.</li>
          <li>A gateway timeout stays unknown until reconciliation.</li>
          <li>Provider events are stored before they are acknowledged.</li>
        </ul>
      </section>
      <section className="grid place-items-center px-5 py-12">
        <form className="card w-full max-w-md p-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">Sign in</p>
          <h2 className="mt-2 text-2xl font-semibold">Operations console</h2>
          <p className="mt-1 text-sm text-muted">Sandbox demo accounts only. These passwords are public and do not access a real bank.</p>
          <div className="mt-5 grid gap-3">
            <label className="field">
              <span>Email</span>
              <input type="email" autoComplete="username" {...form.register("email")} />
              {form.formState.errors.email ? <em className="field-error">{form.formState.errors.email.message}</em> : null}
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" autoComplete="current-password" {...form.register("password")} />
              {form.formState.errors.password ? <em className="field-error">{form.formState.errors.password.message}</em> : null}
            </label>
          </div>
          <Button className="mt-5 w-full" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
          <div className="mt-4 grid gap-2">
            {demos.map((demo) => (
              <button
                key={demo.email}
                type="button"
                className="btn btn-secondary w-full"
                onClick={() => form.reset({ email: demo.email, password: demo.password })}
              >
                {demo.label}
              </button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}
