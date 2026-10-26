import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";
import { api, ApiError, setCsrfToken } from "../api/client";
import type { Envelope, User } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/ui";

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter your name.").max(80),
    email: z.string().trim().email("Enter a valid email address."),
    password: z.string().min(12, "Password must be at least 12 characters.").max(72, "Password must be at most 72 characters."),
    confirmPassword: z.string().min(1, "Confirm the password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const response = await api.post<Envelope<{ user: User; csrfToken: string }>>("/auth/register", {
        name: values.name,
        email: values.email,
        password: values.password,
      });
      setCsrfToken(response.data.data.csrfToken);
      setUser(response.data.data.user);
      toast.success("Account created. You are signed in as an analyst.");
      navigate("/");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Registration failed.";
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
          <h1 className="mt-6 max-w-md text-4xl leading-tight font-semibold">An analyst account can watch the ledger. It cannot move it.</h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
            Registration creates an analyst. Analysts review payments, webhooks, and reconciliation. Creating payments, replaying webhooks, and reading the audit log stay with the seeded administrator.
          </p>
        </div>
        <p className="max-w-md text-sm text-slate-300">This is a sandbox. The password is hashed and is never shown again.</p>
      </section>
      <section className="grid place-items-center px-5 py-12">
        <form className="card w-full max-w-md p-6" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">Create account</p>
          <h2 className="mt-2 text-2xl font-semibold">Analyst registration</h2>
          <p className="mt-1 text-sm text-muted">Use this for a personal sandbox login. Administrator access is not available here.</p>
          <div className="mt-5 grid gap-3">
            <label className="field">
              <span>Name</span>
              <input type="text" autoComplete="name" {...form.register("name")} />
              {form.formState.errors.name ? <em className="field-error">{form.formState.errors.name.message}</em> : null}
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" autoComplete="username" {...form.register("email")} />
              {form.formState.errors.email ? <em className="field-error">{form.formState.errors.email.message}</em> : null}
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" autoComplete="new-password" {...form.register("password")} />
              {form.formState.errors.password ? <em className="field-error">{form.formState.errors.password.message}</em> : null}
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
              {form.formState.errors.confirmPassword ? <em className="field-error">{form.formState.errors.confirmPassword.message}</em> : null}
            </label>
          </div>
          <Button className="mt-5 w-full" type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Create analyst account"}
          </Button>
          <p className="mt-4 text-center text-sm text-muted">
            Already have a demo login? <Link className="font-semibold text-accent" to="/login">Sign in</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
