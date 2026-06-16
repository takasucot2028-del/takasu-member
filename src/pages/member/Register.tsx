import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../components/AuthContext';
import { PageContainer, Card, Field, Input, Select, Button, Alert } from '../../components/UI';
import { COURSES, MEMBER_TYPE_LABELS } from '../../utils/constants';
import { registerNewMember, memberLogin } from '../../api/data';
import type { MemberType, AreaType } from '../../types';

const INITIAL = {
  memberType: 'general' as MemberType,
  lastName: '', firstName: '',
  lastNameKana: '', firstNameKana: '',
  birthDate: '',
  gender: '' as '' | 'male' | 'female',
  postalCode: '', address: '',
  areaType: 'in_town' as AreaType,
  phone: '', email: '', password: '', passwordConfirm: '',
  courseIds: [] as string[],
  school: '',
  guardianLastName: '', guardianFirstName: '',
  guardianLastNameKana: '', guardianFirstNameKana: '',
  guardianPhone: '', guardianEmail: '',
  groupName: '', representativeName: '',
  memberCount: 1,
};

export default function Register() {
  const [form, setForm] = useState(INITIAL);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const set = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));

  const toggleCourse = (id: string) => {
    setForm(prev => ({
      ...prev,
      courseIds: prev.courseIds.includes(id)
        ? prev.courseIds.filter(c => c !== id)
        : [...prev.courseIds, id],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.passwordConfirm) {
      setError('パスワードが一致しません');
      return;
    }
    if (form.password.length < 6) {
      setError('パスワードは6文字以上で入力してください');
      return;
    }
    if (form.memberType !== 'group' && !form.gender) {
      setError('性別を選択してください');
      return;
    }
    if (form.memberType !== 'group' && form.courseIds.length === 0) {
      setError('参加する教室を1つ以上選択してください');
      return;
    }

    const { passwordConfirm, ...data } = form;
    void passwordConfirm;
    try {
      await registerNewMember(data);
      // 登録後にログインして正規のセッショントークンを取得（GAS/デモ共通）
      const auth = await memberLogin(data.email, data.password);
      const household = auth.members ?? (auth.member ? [auth.member] : []);
      if (auth.success && auth.token && household.length > 0) {
        login(auth.token, 'member', household);
        setSuccess(true); // 完了画面（LINE・口座振替案内）を表示。マイページへは手動で進む
      } else {
        setError('登録は完了しましたが自動ログインに失敗しました。ログイン画面からログインしてください');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '会員登録に失敗しました');
    }
  };

  if (success) {
    const formUrl = `${import.meta.env.BASE_URL}kouza_furikae_irai.pdf`;
    return (
      <PageContainer title="会員登録が完了しました">
        <div className="max-w-2xl mx-auto space-y-4">
          <Alert type="success">会員登録が完了しました。続いて、下記2点のお手続きをお願いします。</Alert>

          {/* 公式LINE登録案内 */}
          <Card>
            <h3 className="font-medium text-gray-800 mb-1">① 公式LINEの友だち登録</h3>
            <p className="text-sm text-gray-600 mb-3">
              クラブからの連絡は公式LINEで行います。下のボタンから友だち登録し、
              「保護者氏名・お申し込みされた方のお名前」をメッセージでお知らせください。
            </p>
            <a href="https://lin.ee/Z13UKHE" target="_blank" rel="noopener noreferrer">
              <Button>公式LINEに友だち登録する</Button>
            </a>
            <p className="text-xs text-gray-400 mt-2 break-all">https://lin.ee/Z13UKHE</p>
          </Card>

          {/* 口座振替案内 */}
          <Card>
            <h3 className="font-medium text-gray-800 mb-1">② 口座振替の手続き</h3>
            <p className="text-sm text-gray-600 mb-3">
              会費は口座振替でお支払いいただきます。下記の「口座振替依頼書」を印刷し、
              いずれかの方法でご提出ください。
            </p>
            <a href={formUrl} target="_blank" rel="noopener noreferrer" download="口座振替依頼書.pdf">
              <Button variant="secondary">口座振替依頼書（PDF）をダウンロード</Button>
            </a>
            <div className="mt-3 text-sm text-gray-700 space-y-2">
              <p className="font-medium">提出方法（いずれか）</p>
              <div className="pl-1 space-y-2">
                <p>
                  <span className="font-medium">方法①</span> 依頼書を印刷し、<span className="font-medium">通帳印を押印</span>のうえ、
                  <span className="font-medium">鷹栖町総合体育館</span> または <span className="font-medium">鷹栖町B&amp;G海洋センター</span> に提出
                </p>
                <p>
                  <span className="font-medium">方法②</span> <span className="font-medium">通帳印および通帳をご持参</span>のうえ、
                  <span className="font-medium">鷹栖町総合体育館</span> または <span className="font-medium">鷹栖町B&amp;G海洋センター</span> で用紙に記入して提出
                </p>
              </div>
            </div>
          </Card>

          <div className="flex justify-center pt-2">
            <Button onClick={() => navigate('/mypage')} className="px-8">マイページへ進む</Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  const availableCourses = form.memberType === 'group' ? [] : COURSES;

  return (
    <PageContainer title="新規会員登録">
      <div className="max-w-2xl mx-auto">
        <Card>
          {error && <Alert type="error">{error}</Alert>}
          <form onSubmit={handleSubmit}>
            {/* 会員種別 */}
            <Field label="会員種別" required>
              <Select value={form.memberType} onChange={e => set('memberType', e.target.value)}>
                {Object.entries(MEMBER_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </Field>

            {/* 基本情報 */}
            <div className="border-t pt-4 mt-4">
              <h3 className="font-medium text-gray-700 text-sm mb-3">基本情報</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="姓" required>
                  <Input value={form.lastName} onChange={e => set('lastName', e.target.value)} required />
                </Field>
                <Field label="名" required>
                  <Input value={form.firstName} onChange={e => set('firstName', e.target.value)} required />
                </Field>
                <Field label="セイ" required>
                  <Input value={form.lastNameKana} onChange={e => set('lastNameKana', e.target.value)} required />
                </Field>
                <Field label="メイ" required>
                  <Input value={form.firstNameKana} onChange={e => set('firstNameKana', e.target.value)} required />
                </Field>
              </div>
              <Field label="生年月日" required>
                <Input type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)} required />
              </Field>
              {form.memberType !== 'group' && (
                <Field label="性別" required>
                  <Select value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="">選択してください</option>
                    <option value="male">男性</option>
                    <option value="female">女性</option>
                  </Select>
                </Field>
              )}
              <Field label="郵便番号">
                <Input value={form.postalCode} onChange={e => set('postalCode', e.target.value)} placeholder="071-1200" />
              </Field>
              <Field label="住所" required>
                <Input value={form.address} onChange={e => set('address', e.target.value)} required />
              </Field>
              <Field label="町内外区分" required>
                <Select value={form.areaType} onChange={e => set('areaType', e.target.value)}>
                  <option value="in_town">町内</option>
                  <option value="out_of_town">町外</option>
                </Select>
              </Field>
              <Field label="電話番号" required>
                <Input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} required />
              </Field>
            </div>

            {/* ジュニア追加情報 */}
            {form.memberType === 'junior' && (
              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium text-gray-700 text-sm mb-3">通学先・保護者情報</h3>
                <Field label="通学先（学校・保育園名）" required>
                  <Input value={form.school} onChange={e => set('school', e.target.value)} required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="保護者 姓" required>
                    <Input value={form.guardianLastName} onChange={e => set('guardianLastName', e.target.value)} required />
                  </Field>
                  <Field label="保護者 名" required>
                    <Input value={form.guardianFirstName} onChange={e => set('guardianFirstName', e.target.value)} required />
                  </Field>
                  <Field label="保護者 セイ" required>
                    <Input value={form.guardianLastNameKana} onChange={e => set('guardianLastNameKana', e.target.value)} required />
                  </Field>
                  <Field label="保護者 メイ" required>
                    <Input value={form.guardianFirstNameKana} onChange={e => set('guardianFirstNameKana', e.target.value)} required />
                  </Field>
                </div>
                <Field label="保護者 電話番号" required>
                  <Input type="tel" value={form.guardianPhone} onChange={e => set('guardianPhone', e.target.value)} required />
                </Field>
                <Field label="保護者 メールアドレス">
                  <Input type="email" value={form.guardianEmail} onChange={e => set('guardianEmail', e.target.value)} />
                </Field>
              </div>
            )}

            {/* 団体追加情報 */}
            {form.memberType === 'group' && (
              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium text-gray-700 text-sm mb-3">団体情報</h3>
                <Field label="団体名" required>
                  <Input value={form.groupName} onChange={e => set('groupName', e.target.value)} required />
                </Field>
                <Field label="代表者氏名" required>
                  <Input value={form.representativeName} onChange={e => set('representativeName', e.target.value)} required />
                </Field>
                <Field label="加入人数" required>
                  <Input type="number" min={1} value={form.memberCount} onChange={e => set('memberCount', parseInt(e.target.value) || 1)} required />
                </Field>
              </div>
            )}

            {/* 教室選択 */}
            {form.memberType !== 'group' && (
              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium text-gray-700 text-sm mb-3">参加教室を選択</h3>
                <div className="space-y-2">
                  {availableCourses.map(c => (
                    <label key={c.id} className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.courseIds.includes(c.id)}
                        onChange={() => toggleCourse(c.id)}
                        className="mt-0.5"
                      />
                      <div className="text-sm">
                        <div className="font-medium text-gray-800">{c.name}</div>
                        <div className="text-gray-500 text-xs">
                          {c.paymentMethod === 'ticket' || c.paymentMethod === 'none' ? c.note :
                            c.feeInTown === c.feeOutOfTown
                              ? `${c.feeInTown.toLocaleString()}円（${c.note}）`
                              : `町内${c.feeInTown.toLocaleString()}円 / 町外${c.feeOutOfTown.toLocaleString()}円（${c.note}）`
                          }
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* ログイン情報 */}
            <div className="border-t pt-4 mt-4">
              <h3 className="font-medium text-gray-700 text-sm mb-3">ログイン情報</h3>
              <Field label="メールアドレス" required>
                <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} required />
              </Field>
              <Field label="パスワード（6文字以上）" required>
                <Input type="password" value={form.password} onChange={e => set('password', e.target.value)} required minLength={6} />
              </Field>
              <Field label="パスワード（確認）" required>
                <Input type="password" value={form.passwordConfirm} onChange={e => set('passwordConfirm', e.target.value)} required />
              </Field>
            </div>

            <div className="mt-6 flex gap-3">
              <Button type="submit" className="flex-1">登録する</Button>
              <Link to="/">
                <Button type="button" variant="secondary">戻る</Button>
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </PageContainer>
  );
}
