import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../components/AuthContext';
import { PageContainer, Card, Field, Input, Select, Button, Alert, Badge } from '../../components/UI';
import { COURSES, MEMBER_TYPE_LABELS, GENDER_LABELS } from '../../utils/constants';
import { getMemberById, updateMemberData, calcAnnualFee, calcInsurance, getMemberBilling, changePassword } from '../../api/data';
import type { Member, BillingRecord } from '../../types';

// 請求レコードの費目内訳（0でないもの）を「ラベル 金額円」の配列で返す
const FEE_LABELS: [keyof BillingRecord, string][] = [
  ['annualFee', '年会費'], ['monthlyClassroom', '月会費(教室)'], ['monthlyConsigned', '月会費(委託)'],
  ['monthlyCommunity', '月会費(地域クラブ)'], ['insuranceFee', '保険料'], ['specialFee', '特別徴収'],
];
function breakdown(r: BillingRecord): string[] {
  const parts = FEE_LABELS
    .filter(([k]) => (r[k] as number) > 0)
    .map(([k, label]) => `${label} ${(r[k] as number).toLocaleString()}円`);
  if (r.specialFee > 0 && r.specialNote) parts[parts.length - 1] += `（${r.specialNote}）`;
  return parts;
}
function statusText(s: string): string {
  return s === 'completed' ? '振替済' : s === 'failed' ? '引落不能' : s === 'carried' ? '翌月へ繰越' : '振替予定';
}

export default function MyPage() {
  const { member, members, activeMemberId, setActiveMemberId, token, setMember, setHousehold, logout } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Member>>({});
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [billing, setBilling] = useState<BillingRecord[]>([]);

  // パスワード変更
  const [pwForm, setPwForm] = useState({ old: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  // 世帯の請求（振替予定・履歴）を取得
  useEffect(() => {
    if (members.length === 0) return;
    getMemberBilling(members.map(m => m.id)).then(setBilling);
  }, [members]);

  // 初回マウント時、アクティブ会員の最新情報を取得
  useEffect(() => {
    if (!member || !token) { navigate('/'); return; }
    getMemberById(member.id).then(fresh => {
      if (fresh) { setMember(fresh); setForm(fresh); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 子ども（世帯内会員）を切り替えたらフォームを同期し、編集を閉じる
  useEffect(() => {
    if (member) setForm(member);
    setEditing(false);
    setMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMemberId]);

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

  const handleNextYear = async (id: string, value: string) => {
    await updateMemberData(id, { nextYearStatus: value as Member['nextYearStatus'] });
    setHousehold(members.map(x => (x.id === id ? { ...x, nextYearStatus: value as Member['nextYearStatus'] } : x)));
    setMsg({ type: 'success', text: '翌年度の意思を保存しました' });
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (pwForm.next.length < 6) { setPwMsg({ type: 'error', text: '新しいパスワードは6文字以上で入力してください' }); return; }
    if (pwForm.next !== pwForm.confirm) { setPwMsg({ type: 'error', text: '新しいパスワード（確認）が一致しません' }); return; }
    setPwSaving(true);
    try {
      await changePassword(pwForm.old, pwForm.next, members.map(m => m.id));
      setPwForm({ old: '', next: '', confirm: '' });
      setPwMsg({ type: 'success', text: 'パスワードを変更しました' });
    } catch (e) {
      setPwMsg({ type: 'error', text: e instanceof Error ? e.message : 'パスワードの変更に失敗しました' });
    } finally {
      setPwSaving(false);
    }
  };

  const handleWithdraw = async () => {
    const label = member.memberType === 'group' ? member.groupName : `${member.lastName} ${member.firstName}`;
    if (!confirm(`${label} さんを退会しますか？この操作は取り消せません。`)) return;
    await updateMemberData(member.id, { isWithdrawn: true });
    // 世帯に他の会員が残っていればログインを維持し、いなければログアウト
    const remaining = members.filter(m => m.id !== member.id);
    if (remaining.length === 0) {
      logout();
      navigate('/');
    } else {
      setHousehold(remaining);
      setMsg({ type: 'success', text: `${label} さんの退会処理が完了しました` });
    }
  };

  const annualFee = calcAnnualFee(member.memberType, member.areaType);
  const insurance = calcInsurance(member.memberType, member.memberCount);
  const enrolledCourses = COURSES.filter(c => member.courseIds.includes(c.id));

  return (
    <PageContainer title="マイページ">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* 世帯切替（同一メールに複数会員がいる場合のみ表示） */}
        {members.length > 1 && (
          <Card>
            <h3 className="font-medium text-gray-700 text-sm mb-2">家族の切り替え</h3>
            <div className="flex flex-wrap gap-2">
              {members.map(m => {
                const label = m.memberType === 'group' ? m.groupName : `${m.lastName} ${m.firstName}`;
                const active = m.id === activeMemberId;
                return (
                  <button
                    key={m.id}
                    onClick={() => setActiveMemberId(m.id)}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Card>
        )}

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
              {member.memberType !== 'group' && (
                <Field label="性別">
                  <Select value={form.gender || ''} onChange={e => set('gender', e.target.value)}>
                    <option value="">未設定</option>
                    <option value="male">男性</option>
                    <option value="female">女性</option>
                  </Select>
                </Field>
              )}
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
              {member.memberType !== 'group' && <Row label="性別">{GENDER_LABELS[member.gender || ''] || '未設定'}</Row>}
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
                        {c.paymentMethod === 'ticket' || c.paymentMethod === 'none' ? '' :
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

        {/* 翌年度の継続手続き */}
        <Card>
          <h3 className="font-medium text-gray-700 text-sm mb-1">翌年度の継続手続き</h3>
          <p className="text-xs text-gray-500 mb-3">翌年度も継続するか退会するかを、3月末までに選択してください。</p>
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.id} className="flex justify-between items-center gap-2">
                <span className="text-sm">{m.memberType === 'group' ? m.groupName : `${m.lastName} ${m.firstName}`}</span>
                <Select
                  value={m.nextYearStatus || ''}
                  onChange={e => handleNextYear(m.id, e.target.value)}
                  className="w-40"
                >
                  <option value="">未選択</option>
                  <option value="continue">継続する</option>
                  <option value="withdraw">退会する</option>
                </Select>
              </div>
            ))}
          </div>
        </Card>

        {/* 請求・振替予定 */}
        <Card>
          <h3 className="font-medium text-gray-700 text-sm mb-3">請求・振替予定</h3>
          {(() => {
            const byMonth: Record<string, BillingRecord[]> = {};
            billing.forEach(r => { (byMonth[r.yearMonth] ||= []).push(r); });
            const months = Object.keys(byMonth).sort().reverse();
            if (months.length === 0) {
              return <p className="text-gray-400 text-sm">請求はまだありません</p>;
            }
            return (
              <div className="space-y-4">
                {months.map(ym => {
                  const recs = byMonth[ym];
                  const total = recs.reduce((s, r) => s + r.total, 0);
                  const due = recs[0]?.dueDate || '';
                  const anyFailed = recs.some(r => r.status === 'failed');
                  const [y, m] = ym.split('-');
                  return (
                    <div key={ym} className="border-b border-gray-100 pb-3 last:border-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-sm">{y}年{parseInt(m, 10)}月の口座振替</span>
                        <span className="text-xs text-gray-500">振替日: {due}</span>
                      </div>
                      <div className="space-y-1">
                        {recs.map(r => (
                          <div key={r.id} className="text-sm flex justify-between gap-2">
                            <span className="text-gray-700">
                              {members.length > 1 && <span className="text-gray-500 mr-1">{r.memberName}:</span>}
                              {breakdown(r).join(' / ') || '—'}
                            </span>
                            <Badge color={r.status === 'failed' ? 'red' : r.status === 'completed' ? 'green' : 'blue'}>
                              {statusText(r.status)}
                            </Badge>
                          </div>
                        ))}
                      </div>
                      <div className="text-right text-sm font-medium mt-1">合計 {total.toLocaleString()}円</div>
                      {anyFailed && (
                        <Alert type="error">この月は口座振替ができませんでした。翌月の請求に繰り越して再度引き落とします。</Alert>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </Card>

        {/* パスワード変更 */}
        <Card>
          <h3 className="font-medium text-gray-700 text-sm mb-1">パスワードの変更</h3>
          <p className="text-xs text-gray-500 mb-3">
            ログイン用パスワードを変更します。
            {members.length > 1 && '（ご家族共通のログインのため、世帯全員に適用されます）'}
          </p>
          {pwMsg && <Alert type={pwMsg.type}>{pwMsg.text}</Alert>}
          <div className="space-y-3 max-w-sm">
            <Field label="現在のパスワード">
              <Input type="password" value={pwForm.old} autoComplete="current-password"
                onChange={e => setPwForm(p => ({ ...p, old: e.target.value }))} />
            </Field>
            <Field label="新しいパスワード（6文字以上）">
              <Input type="password" value={pwForm.next} autoComplete="new-password"
                onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} />
            </Field>
            <Field label="新しいパスワード（確認）">
              <Input type="password" value={pwForm.confirm} autoComplete="new-password"
                onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} />
            </Field>
            <Button size="sm" onClick={handleChangePassword}
              disabled={pwSaving || !pwForm.old || !pwForm.next || !pwForm.confirm}>
              {pwSaving ? '変更中…' : 'パスワードを変更'}
            </Button>
          </div>
        </Card>

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
