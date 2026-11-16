import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth-context.js';
import { RequireAuth } from './components/RequireAuth.js';
import { RequireMenu } from './components/RequireMenu.js';
import { MenuAccessProvider } from './lib/menu-access-context.js';
import { AppShell } from './components/AppShell.js';
import { LoginPage } from './pages/LoginPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { PosPage } from './pages/PosPage.js';
import { SalesPage } from './pages/SalesPage.js';
import { ReturnsPage } from './pages/ReturnsPage.js';
import { ItemsPage } from './pages/ItemsPage.js';
import { BatchesPage } from './pages/BatchesPage.js';
import { InventoryPage } from './pages/InventoryPage.js';
import { ReceiveStockPage } from './pages/ReceiveStockPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { OrdersPage } from './pages/OrdersPage.js';
import { BillPage } from './pages/BillPage.js';
import { SuppliersPage } from './pages/SuppliersPage.js';
import { CustomersPage } from './pages/CustomersPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { ReportsPage } from './pages/ReportsPage.js';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          {/* Printable bill, no sidebar. */}
          <Route path="/bills/:id" element={<BillPage />} />
          <Route element={<MenuAccessProvider><AppShell /></MenuAccessProvider>}>
            {/* Each page is open only to the roles in MENU_ROLES (shared). */}
            <Route element={<RequireMenu />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/pos" element={<PosPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/returns" element={<ReturnsPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/receive-stock" element={<ReceiveStockPage />} />
            <Route path="/batches" element={<BatchesPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/users" element={<UsersPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
