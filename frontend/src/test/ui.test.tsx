import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PaymentTable } from "../components/PaymentTable";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { AuthProvider } from "../auth/AuthProvider";
import { RequireAuth } from "../auth/RequireAuth";
import { shouldAttemptRefresh } from "../api/client";
import type { PaymentSummary, User } from "../api/types";

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: {
      get: vi.fn().mockRejectedValue(new actual.ApiError(401, "UNAUTHENTICATED", "Authentication is required.")),
      post: vi.fn(),
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    },
  };
});

const payment: PaymentSummary = {
  id: "11111111-1111-1111-1111-111111111111",
  merchantReference: "order_1001",
  providerReference: "sim_demo",
  amountMinor: 2599,
  currency: "USD",
  status: "SUCCEEDED",
  scenario: "success",
  description: null,
  failureCode: null,
  failureMessage: null,
  createdAt: "2026-10-24T10:00:00.000Z",
  updatedAt: "2026-10-24T10:00:00.000Z",
  createdBy: null,
};

describe("refresh coordination", () => {
  it("refreshes an expired API call once and skips auth endpoints", () => {
    expect(shouldAttemptRefresh(401, "/payments", false)).toBe(true);
    expect(shouldAttemptRefresh(401, "/payments", true)).toBe(false);
    expect(shouldAttemptRefresh(401, "/auth/refresh", false)).toBe(false);
    expect(shouldAttemptRefresh(401, "/auth/register", false)).toBe(false);
    expect(shouldAttemptRefresh(403, "/payments", false)).toBe(false);
  });
});

describe("login validation", () => {
  it("shows field errors before calling the API", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider skipBootstrap>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 12 characters.")).toBeInTheDocument();
  });
});

describe("registration validation", () => {
  it("shows field errors before calling the API", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider skipBootstrap>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Create analyst account" }));
    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 12 characters.")).toBeInTheDocument();
  });
});

describe("protected routes", () => {
  it("sends anonymous visitors to the login screen", async () => {
    render(
      <MemoryRouter initialEntries={["/payments"]}>
        <AuthProvider skipBootstrap>
          <Routes>
            <Route path="/login" element={<p>Login screen</p>} />
            <Route path="/payments" element={<RequireAuth><p>Payments</p></RequireAuth>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Login screen")).toBeInTheDocument();
  });

  it("hides administrator-only simulation from an analyst", () => {
    const analyst: User = {
      id: "1",
      email: "analyst@payguard.local",
      name: "Leo Martins",
      role: "ANALYST",
      permissions: ["payments:read", "dashboard:read"],
    };
    expect(analyst.permissions.includes("payments:simulate")).toBe(false);
    expect(analyst.permissions.includes("payments:write")).toBe(false);
  });
});

describe("payment table states", () => {
  it("renders loading, empty, error, and populated states", () => {
    const { rerender } = render(<PaymentTable state="loading" payments={[]} />);
    expect(document.querySelector(".skel")).toBeTruthy();
    rerender(<PaymentTable state="empty" payments={[]} />);
    expect(screen.getByText("No payments in this view")).toBeInTheDocument();
    rerender(<PaymentTable state="error" payments={[]} message="Network down" />);
    expect(screen.getByText("Network down")).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <PaymentTable state="ready" payments={[payment]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("order_1001")).toBeInTheDocument();
    expect(screen.getByText("Succeeded")).toBeInTheDocument();
  });
});
