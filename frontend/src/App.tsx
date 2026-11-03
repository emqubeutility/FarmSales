import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth-context.js';
import { RequireAuth } from './components/RequireAuth.js';
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
import { RecordDeliveryPage } from './pages/RecordDeliveryPage.js';
import { BillPage } from './pages/BillPage.js';
import { SuppliersPage } from './pages/SuppliersPage.js';
import { BatchLabelPage } from './pages/BatchLabelPage.js';
import { PlaceholderPage } from './pages/PlaceholderPage.js';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          {/* Phone-sized, no sidebar — matches docs/mock/delivery.html exactly. */}
          <Route path="/orders/:id/deliver" element={<RecordDeliveryPage />} />
          {/* Printable bill, no sidebar. */}
          <Route path="/bills/:id" element={<BillPage />} />
          {/* Printable batch label (70 x 70 mm), no sidebar. */}
          <Route path="/labels/batch/:id" element={<BatchLabelPage />} />
          <Route element={<AppShell />}>
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
            <Route path="/customers" element={<PlaceholderPage title="Customers" description="Customer profiles, contact details and purchase history will be managed here." />} />
            <Route path="/reports" element={<PlaceholderPage title="Reports" description="Sales, inventory, profitability and GST reports will be available here." />} />
            <Route path="/users" element={<PlaceholderPage title="User Management" description="Manage staff accounts, roles and access permissions here." />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
