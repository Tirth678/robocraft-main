import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import type { ReactElement } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { CartProvider } from "@/contexts/CartContext";
import { CompareProvider } from "@/contexts/CompareContext";
import { AuthProvider } from "@/contexts/AuthContext";
import PageTransition from "@/components/PageTransition";
import { hasBackendUrl } from "@/lib/backend";

const Index = lazy(() => import("./pages/Index"));
const Experience3D = lazy(() => import("./pages/Experience3D"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const SimpleAuthPage = lazy(() => import("./pages/SimpleAuthPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AdminProductsPage = lazy(() => import("./pages/AdminProductsPage"));
const AdminSalesPage = lazy(() => import("./pages/AdminSalesPage"));
const AdminPreOrdersPage = lazy(() => import("./pages/AdminPreOrdersPage"));
const InventoryAdminPage = lazy(() => import("./pages/InventoryAdminPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const TrackOrderPage = lazy(() => import("./pages/TrackOrderPage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CartDrawer = lazy(() => import("@/components/CartDrawer"));
const ChatWidget = lazy(() => import("@/components/ChatWidget"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
  </div>
);

const AnimatedRoutes = () => {
  const location = useLocation();

  const wrap = (element: ReactElement) => <PageTransition>{element}</PageTransition>;

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={wrap(<Index />)} />
        <Route path="/home" element={wrap(<Index />)}/>
        <Route path="/about" element={wrap(<AboutPage />)} />
        <Route path="/experience-3d" element={wrap(<Experience3D />)} />
        <Route path="/auth" element={wrap(<SimpleAuthPage initialMode="signup" />)} />
        <Route path="/signup" element={wrap(<SimpleAuthPage initialMode="signup" />)} />
        <Route path="/register" element={wrap(<SimpleAuthPage initialMode="signup" />)} />
        <Route path="/login" element={wrap(<SimpleAuthPage initialMode="login" />)} />
        <Route path="/auth/callback" element={wrap(<SimpleAuthPage initialMode="login" />)} />
        <Route path="/admin" element={wrap(<AdminPage />)} />
        <Route path="/admin/products" element={wrap(<AdminProductsPage />)} />
        <Route path="/admin/sales" element={wrap(<AdminSalesPage />)} />
        <Route path="/admin/pre-orders" element={wrap(<AdminPreOrdersPage />)} />
        <Route path="/admin/inventory" element={wrap(<InventoryAdminPage />)} />
        <Route path="/checkout" element={wrap(<CheckoutPage />)} />
        <Route path="/track-order" element={wrap(<TrackOrderPage />)} />
        <Route path="/products" element={wrap(<ProductsPage />)} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={wrap(<NotFound />)} />
      </Routes>
    </AnimatePresence>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <CartProvider>
          <CompareProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Suspense fallback={null}>
                <CartDrawer />
                {hasBackendUrl ? <ChatWidget /> : null}
              </Suspense>
              <Suspense fallback={<RouteFallback />}>
                <AnimatedRoutes />
              </Suspense>
            </BrowserRouter>
          </CompareProvider>
        </CartProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
