import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../components/AuthContext';
import { PageContainer, Card, Field, Input, Button, Alert } from '../../components/UI';
import { adminLoginCheck } from '../../api/data';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await adminLoginCheck(email, password);
    if (result.success && result.token) {
      login(result.token, 'admin');
      navigate('/admin/members');
    } else {
      setError(result.error || 'ログインに失敗しました');
    }
  };

  return (
    <PageContainer>
      <div className="max-w-sm mx-auto mt-12">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800">TSC 事務局管理</h1>
          <p className="text-gray-500 text-sm mt-1">たかすスポーツクラブ</p>
        </div>
        <Card>
          <h2 className="font-bold text-gray-800 mb-4">事務局ログイン</h2>
          {error && <Alert type="error">{error}</Alert>}
          <form onSubmit={handleSubmit}>
            <Field label="メールアドレス" required>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </Field>
            <Field label="パスワード" required>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </Field>
            <Button type="submit" className="w-full mt-2">ログイン</Button>
          </form>
          <Alert type="info">
            初期アカウント: admin@takasu-sc.jp / admin123
          </Alert>
        </Card>
        <div className="text-center mt-4">
          <Link to="/" className="text-gray-400 text-xs hover:underline">会員ログインへ</Link>
        </div>
      </div>
    </PageContainer>
  );
}
