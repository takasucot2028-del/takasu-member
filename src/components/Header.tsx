import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function Header() {
  const { isLoggedIn, role, logout, member } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  const handleLogout = () => {
    logout();
    navigate(isAdmin ? '/admin' : '/');
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to={role === 'admin' ? '/admin/members' : '/'} className="font-bold text-gray-800 text-sm">
          <span className="text-blue-600">TSC</span>{' '}
          {isAdmin ? '事務局管理' : '会員管理'}
        </Link>

        {isLoggedIn && role === 'admin' && (
          <nav className="hidden sm:flex items-center gap-1 text-xs">
            <NavLink to="/admin/members" current={location.pathname}>会員一覧</NavLink>
            <NavLink to="/admin/courses" current={location.pathname}>教室別名簿</NavLink>
            <NavLink to="/admin/insurance" current={location.pathname}>保険管理</NavLink>
            <NavLink to="/admin/billing" current={location.pathname}>継続会費</NavLink>
            <NavLink to="/admin/billing/group" current={location.pathname}>団体請求</NavLink>
            <NavLink to="/admin/billing/unpaid" current={location.pathname}>引落不能</NavLink>
          </nav>
        )}

        <div className="flex items-center gap-3 text-xs">
          {isLoggedIn && role === 'member' && member && (
            <span className="text-gray-500">{member.lastName} {member.firstName}</span>
          )}
          {isLoggedIn && (
            <button onClick={handleLogout} className="text-gray-500 hover:text-gray-700">
              ログアウト
            </button>
          )}
        </div>
      </div>

      {/* モバイルナビ */}
      {isLoggedIn && role === 'admin' && (
        <nav className="sm:hidden flex overflow-x-auto border-t border-gray-100 px-4 gap-1 text-xs">
          <NavLink to="/admin/members" current={location.pathname}>会員</NavLink>
          <NavLink to="/admin/courses" current={location.pathname}>教室</NavLink>
          <NavLink to="/admin/insurance" current={location.pathname}>保険</NavLink>
          <NavLink to="/admin/billing" current={location.pathname}>会費</NavLink>
          <NavLink to="/admin/billing/group" current={location.pathname}>団体</NavLink>
          <NavLink to="/admin/billing/unpaid" current={location.pathname}>不能</NavLink>
        </nav>
      )}
    </header>
  );
}

function NavLink({ to, current, children }: { to: string; current: string; children: React.ReactNode }) {
  const active = current === to || (to !== '/admin/members' && current.startsWith(to));
  return (
    <Link
      to={to}
      className={`px-3 py-2 rounded-md whitespace-nowrap transition-colors ${
        active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </Link>
  );
}
