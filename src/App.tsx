import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthContext';
import Header from './components/Header';

// 会員側
import MemberLogin from './pages/member/Login';
import Register from './pages/member/Register';
import MyPage from './pages/member/MyPage';

// 事務局側
import AdminLogin from './pages/admin/AdminLogin';
import MemberList from './pages/admin/MemberList';
import MemberDetail from './pages/admin/MemberDetail';
import CourseRoster from './pages/admin/CourseRoster';
import Insurance from './pages/admin/Insurance';
import Billing from './pages/admin/Billing';
import GroupBillingPage from './pages/admin/GroupBilling';
import UnpaidBilling from './pages/admin/UnpaidBilling';

function MemberGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, role } = useAuth();
  if (!isLoggedIn || role !== 'member') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, role } = useAuth();
  if (!isLoggedIn || role !== 'admin') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <Routes>
        {/* 会員側 */}
        <Route path="/" element={<MemberLogin />} />
        <Route path="/register" element={<Register />} />
        <Route path="/mypage" element={<MemberGuard><MyPage /></MemberGuard>} />

        {/* 事務局側 */}
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/members" element={<AdminGuard><MemberList /></AdminGuard>} />
        <Route path="/admin/member/:id" element={<AdminGuard><MemberDetail /></AdminGuard>} />
        <Route path="/admin/courses" element={<AdminGuard><CourseRoster /></AdminGuard>} />
        <Route path="/admin/insurance" element={<AdminGuard><Insurance /></AdminGuard>} />
        <Route path="/admin/billing" element={<AdminGuard><Billing /></AdminGuard>} />
        <Route path="/admin/billing/group" element={<AdminGuard><GroupBillingPage /></AdminGuard>} />
        <Route path="/admin/billing/unpaid" element={<AdminGuard><UnpaidBilling /></AdminGuard>} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
