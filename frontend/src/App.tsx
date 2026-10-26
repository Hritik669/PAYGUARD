import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./auth/RequireAuth";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { PaymentDetailPage } from "./pages/PaymentDetailPage";
import { TransactionDetailPage, TransactionsPage } from "./pages/TransactionsPage";
import { WebhookDetailPage, WebhooksPage } from "./pages/WebhooksPage";
import { ReconciliationDetailPage, ReconciliationPage } from "./pages/ReconciliationPage";
import { AuditPage, HealthPage, NotFoundPage } from "./pages/AdminPages";
import { ExceptionsPage } from "./pages/ExceptionsPage";
import { MerchantWebhooksPage } from "./pages/MerchantWebhooksPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="payments/:id" element={<PaymentDetailPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="transactions/:id" element={<TransactionDetailPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="webhooks/:id" element={<WebhookDetailPage />} />
        <Route path="exceptions" element={<ExceptionsPage />} />
        <Route path="merchant-webhooks" element={<MerchantWebhooksPage />} />
        <Route path="reconciliation" element={<ReconciliationPage />} />
        <Route path="reconciliation/:id" element={<ReconciliationDetailPage />} />
        <Route path="audit" element={<RequireAuth permission="audit:read"><AuditPage /></RequireAuth>} />
        <Route path="health" element={<HealthPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
      <Route path="/home" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
