import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../components/AuthContext';
import { PageContainer, Card, Field, Input, Select, Button, Alert, Badge } from '../../components/UI';
import { COURSES, MEMBER_TYPE_LABELS } from '../../utils/constants';
import { getMemberById, updateMemberData, calcAnnualFee, calcInsurance } from '../../api/data';
import type { Member } from '../../types';

export default function MyPage() {
  const { member, token, setMember, logout } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Member>>({});
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!member || !token) { navigate('/'); return; }
    getMemberById(member.id).then(fresh => {
      if (fresh) { setMember(fresh); setForm(fresh); }
    });
  }, []);

  if (!member) return null;

  const set = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));

  const toggleCourse = (id: string) => {
    setForm(prev => {
      const ids = prev.courseIds || [];
      return { ...prev, courseIds: ids.includes(id) ? ids.filter(c => c !== id) : [...ids, id] };
    });
  };

  const handleSave = async () => {
    const updated = await updateMemberData(member.id, form);
    if (updated) {
      setMember(updated);
      setEditing(false);
      setMsg({ type: 'success', text: '情報を更新しました' });
    }
  };

  const handleWithdraw = async () => {
    if (!confirm('本当に退会しますか？この操作は取り消せません。')) return;
    await updateMemberData(member.id, { isWithdrawn: true });
    logout();
    navigate('/');
  };

  const annualFee = calcAnnualFee(member.memberType, member.areaType);
  const insurance = calcInsurance(member.memberType, member.memberCount);
  const enrolledCourses = COURSES.filter(c => member.courseIds.includes(c.id));

  return (
    <PageContainer title="マイページ">
      <div className="max-w-2xl mx-auto space-y-4">
        {msg && <Alert type={msg.type}>{msg.text}</Alert>}

        {/* 会員情報カード */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <Badge color="blue">{MEMBER_TYPE_LABELS[member.memberType]}</Badge>
              <span className="ml-2 text-gray-500 text-xs">{member.memberNumber}</span>
            </div>
            {!editing && (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>編集</Button>
            )}
          </div>

          {editing ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="姓"><Input value={form.lastName || ''} onChange={e => set('lastName', e.target.value)} /></Field>
                <Field label="名"><Input value={form.firstName || ''} onChange={e => set('firstName', e.target.value)} /></Field>
              </div>
              <Field label="住所"><Input value={form.address || ''} onChange={e => set('address', e.target.value)} /></Field>
              <Field label="町内外区分">
                <Select value={form.areaType || 'in_town'} onChange={e => set('areaType', e.target.value)}>
                  <option value="in_town">町内</option>
                  <option value="out_of_town">町外</option>
                </Select>
              </Field>
              <Field label="電話番号"><Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
              <Field label="メールアドレス"><Input value={form.email || ''} onChange={e => set('email', e.target.value)} /></Field>

              {member.memberType === 'junior' && (
                <>
                  <Field label="通学先"><Input value={form.school || ''} onChange={e => set('school', e.target.value)} /></Field>
                  <Field label="保護者電話番号"><Input value={form.guardianPhone || ''} onChange={e => set('guardianPhone', e.target.value)} /></Field>
                </>
              )}

              <div className="flex gap-3 mt-4">
                <Button onClick={handleSave}>保存</Button>
                <Button variant="secondary" onClick={() => { setForm(member); setEditing(false); }}>キャンセル</Button>
              </div>
            </>
          ) : (
            <div className="space-y-2 text-sm">
              <Row label="氏名">{member.lastName} {member.firstName}（{member.lastNameKana} {member.firstNameKana}）</Row>
              <Row label="生年月日">{member.birthDate}</Row>
              <Row label="住所">{member.address}</Row>
              <Row label="区分">{member.areaType === 'in_town' ? '町内' : '町外'}</Row>
              <Row label="電話番号">{member.phone}</Row>
              <Row label="メール">{member.email}</Row>
              {member.memberType === 'junior' && (
                <>
                  <Row label="通学先">{member.school}</Row>
                  <Row label="保護者">{member.guardianLastName} {member.guardianFirstName}</Row>
                  <Row label="保護者電話">{member.guardianPhone}</Row>
                </>
              )}
              {member.memberType === 'group' && (
                <>
                  <Row label="団体名">{member.groupName}</Row>
                  <Row label="代表者">{member.representativeName}</Row>
                  <Row label="加入人数">{member.memberCount}名</Row>
                </>
              )}
            </div>
          )}
        </Card>

        {/* 費用情報 */}
        <Card>
          <h3 className="font-medium text-gray-700 text-sm mb-3">費用情報</h3>
          <div className="space-y-1 text-sm">
            <Row label="年会費">{annualFee.toLocaleString()}円</Row>
            {insurance > 0 && <Row label="保険料">{insurance.toLocaleString()}円</Row>}
          </div>
        </Card>

        {/* 参加教室 */}
        {member.memberType !== 'group' && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-700 text-sm">参加教室</h3>
              {!editing && (
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>教室を変更</Button>
              )}
            </div>
            {editing ? (
              <div className="space-y-2">
                {COURSES.map(c => (
                  <label key={c.id} className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(form.courseIds || []).includes(c.id)}
                      onChange={() => toggleCourse(c.id)}
                      className="mt-0.5"
                    />
                    <div className="text-sm">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-gray-500 text-xs ml-2">{c.note}</span>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              enrolledCourses.length > 0 ? (
                <div className="space-y-1">
                  {enrolledCourses.map(c => (
                    <div key={c.id} className="flex justify-between items-center text-sm py-1">
                      <span>{c.name}</span>
                      <span className="text-gray-500 text-xs">
                        {c.paymentMethod === 'ticket' ? 'チケット制' :
                          member.areaType === 'in_town'
                            ? `${c.feeInTown.toLocaleString()}円`
                            : `${c.feeOutOfTown.toLocaleString()}円`
                        }
                        <span className="ml-1">（{c.note}）</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">教室未登録</p>
              )
            )}
          </Card>
        )}

        {/* 退会 */}
        <Card className="border-red-100">
          <Button variant="danger" size="sm" onClick={handleWithdraw}>退会する</Button>
          <p className="text-xs text-gray-400 mt-1">退会後はログインできなくなります</p>
        </Card>
      </div>
    </PageContainer>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="w-28 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-800">{children}</span>
    </div>
  );
}
