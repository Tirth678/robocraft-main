import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import RequireAdmin from "@/components/RequireAdmin";
import AdminLoginPage from "@/pages/AdminLoginPage";
import AdminPage from "@/pages/AdminPage";
import AdminProductsPage from "@/pages/AdminProductsPage";
import AdminPreOrdersPage from "@/pages/AdminPreOrdersPage";
import AdminSalesPage from "@/pages/AdminSalesPage";
import InventoryAdminPage from "@/pages/InventoryAdminPage";

/**
 * Private admin console. Every screen sits behind `RequireAdmin`, and the API
 * re-checks the session on each call — this router is convenience, not the
 * authorization boundary.
 */
const App = () => (
  <BrowserRouter>
    <AdminAuthProvider>
      <Routes>
        <Route path="/login" element={<AdminLoginPage />} />
        <Route
          path="/"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/products"
          element={
            <RequireAdmin>
              <AdminProductsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/pre-orders"
          element={
            <RequireAdmin>
              <AdminPreOrdersPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/pre-orders/:id"
          element={
            <RequireAdmin>
              <AdminPreOrdersPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/sales"
          element={
            <RequireAdmin>
              <AdminSalesPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/inventory"
          element={
            <RequireAdmin>
              <InventoryAdminPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" richColors />
    </AdminAuthProvider>
  </BrowserRouter>
);

export default App;