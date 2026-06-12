import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../components/AuthContext';
import { PageContainer, Card, Field, Input, Button, Alert } from '../../components/UI';
import { memberLogin } from '../../api/data';

export default function MemberLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await memberLogin(email, password);
    const household = result.members ?? (result.member ? [result.member] : []);
    if (result.success && result.token && household.length > 0) {
      login(result.token, 'member', household);
      navigate('/mypage');
    } else {
      setError(result.error || 'ログインに失敗しました');
    }
  };

  return (
    <PageContainer>
      <div className="max-w-sm mx-auto mt-12">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800">たかすスポーツクラブ</h1>
          <p className="text-gray-500 text-sm mt-1">会員管理システム</p>
        </div>
        <Card>
          <h2 className="font-bold text-gray-800 mb-4">会員ログイン</h2>
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
          <div className="mt-4 text-center">
            <Link to="/register" className="text-blue-600 text-sm hover:underline">
              新規会員登録はこちら
            </Link>
          </div>
        </Card>
        <div className="text-center mt-4">
          <Link to="/admin" className="text-gray-400 text-xs hover:underline">事務局ログイン</Link>
        </div>
      </div>
    </PageContainer>
  );
}
