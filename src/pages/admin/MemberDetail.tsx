import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageContainer, Card, Field, Input, Select, Button, Alert, Badge } from '../../components/UI';
import { MEMBER_TYPE_LABELS, GENDER_LABELS } from '../../utils/constants';
import { useCourses } from '../../components/CoursesContext';
import { calcFiscalAge, currentFiscalYear } from '../../utils/age';
import { getMemberById, updateMemberData, calcAnnualFee, calcInsurance } from '../../api/data';
import type { Member } from '../../types';

export default function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { courses } = useCourses();
  const [member, setMember] = useState<Member | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Member>>({});
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    getMemberById(id).then(m => {
      if (m) { setMember(m); setForm(m); }
      else navigate('/admin/members');
    });
  }, [id]);

  if (!member) return null;

  const set = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));

  const toggleCourse = (cid: string) => {
    setForm(prev => {
      const ids = prev.courseIds || [];
      return { ...prev, courseIds: ids.includes(cid) ? ids.filter(c => c !== cid) : [...ids, cid] };
    });
  };

  const handleSave = async () => {
    if (!id) return;
    const updated = await updateMemberData(id, form);
    if (updated) {
      setMember(updated);
      setEditing(false);
      setMsg({ type: 'success', text: '更新しました' });
    }
  };

  const handleToggleWithdraw = async () => {
    if (!id) return;
    const newStatus = !member.isWithdrawn;
    if (newStatus && !confirm('退会処理を行いますか？')) return;
    const updated = await updateMemberData(id, { isWithdrawn: newStatus });
    if (updated) {
      setMember(updated);
      setMsg({ type: 'success', text: newStatus ? '退会処理しました' : '復帰処理しました' });
    }
  };

  const annualFee = calcAnnualFee(member.memberType, member.areaType);
  const insurance = calcInsurance(member.memberType, member.memberCount);
  const enrolledCourses = courses.filter(c => member.courseIds.includes(c.id));
  // 選択肢は有効な教室＋すでに選択中の教室（無効化後も外せるよう表示）
  const selectableCourses = courses.filter(c => c.active !== false || (form.courseIds || []).includes(c.id));

  return (
    <PageContainer title="会員詳細">
      <div className="max-w-2xl mx-auto space-y-4">
        <Button size="sm" variant="ghost" onClick={() => navigate('/admin/members')}>← 一覧に戻る</Button>

        {msg && <Alert type={msg.type}>{msg.text}</Alert>}

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-gray-500">{member.memberNumber}</span>
              <Badge color="blue">{MEMBER_TYPE_LABELS[member.memberType]}</Badge>
              {member.isWithdrawn && <Badge color="red">退会</Badge>}
            </div>
            <div className="flex gap-2">
              {!editing && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>編集</Button>}
              <Button size="sm" variant={member.isWithdrawn ? 'secondary' : 'danger'} onClick={handleToggleWithdraw}>
                {member.isWithdrawn ? '復帰' : '退会処理'}
              </Button>
            </div>
          </div>

          {editing ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="姓"><Input value={form.lastName || ''} onChange={e => set('lastName', e.target.value)} /></Field>
                <Field label="名"><Input value={form.firstName || ''} onChange={e => set('firstName', e.target.value)} /></Field>
                <Field label="セイ"><Input value={form.lastNameKana || ''} onChange={e => set('lastNameKana', e.target.value)} /></Field>
                <Field label="メイ"><Input value={form.firstNameKana || ''} onChange={e => set('firstNameKana', e.target.value)} /></Field>
              </div>
              <Field label="生年月日"><Input type="date" value={form.birthDate || ''} onChange={e => set('birthDate', e.target.value)} /></Field>
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
              <Field label="メール"><Input value={form.email || ''} onChange={e => set('email', e.target.value)} /></Field>

              {member.memberType === 'junior' && (
                <>
                  <Field label="通学先"><Input value={form.school || ''} onChange={e => set('school', e.target.value)} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="保護者 姓"><Input value={form.guardianLastName || ''} onChange={e => set('guardianLastName', e.target.value)} /></Field>
                    <Field label="保護者 名"><Input value={form.guardianFirstName || ''} onChange={e => set('guardianFirstName', e.target.value)} /></Field>
                  </div>
                  <Field label="保護者 電話"><Input value={form.guardianPhone || ''} onChange={e => set('guardianPhone', e.target.value)} /></Field>
                </>
              )}

              {member.memberType === 'group' && (
                <>
                  <Field label="団体名"><Input value={form.groupName || ''} onChange={e => set('groupName', e.target.value)} /></Field>
                  <Field label="代表者"><Input value={form.representativeName || ''} onChange={e => set('representativeName', e.target.value)} /></Field>
                  <Field label="加入人数"><Input type="number" min={1} value={form.memberCount || 1} onChange={e => set('memberCount', parseInt(e.target.value) || 1)} /></Field>
                </>
              )}

              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium text-sm text-gray-700 mb-2">口座振替・保険（事務局管理）</h3>
                <Field label="CSS番号（口座振替番号・家庭共通）">
                  <Input value={form.cssNumber || ''} onChange={e => set('cssNumber', e.target.value)} />
                </Field>
                {member.memberType !== 'group' && (
                  <Field label="地域クラブ用CSS番号（任意・地域クラブ参加費を別口座から引落す場合）">
                    <Input value={form.cssNumberCommunity || ''} onChange={e => set('cssNumberCommunity', e.target.value)} />
                  </Field>
                )}
                {member.memberType !== 'group' && (
                  <label className="flex items-center gap-2 text-sm py-1">
                    <input type="checkbox" checked={!!form.schoolAidRecipient} onChange={e => set('schoolAidRecipient', e.target.checked)} />
                    就学援助受給世帯（地域クラブ参加費から毎月2,000円控除）
                  </label>
                )}
                {member.memberType !== 'general' && (
                  <>
                    <label className="flex items-center gap-2 text-sm py-1">
                      <input type="checkbox" checked={!!form.insuranceEnrolled} onChange={e => set('insuranceEnrolled', e.target.checked)} />
                      スポーツ安全保険に加入
                    </label>
                    <Field label="保険加入日">
                      <Input type="date" value={form.insuranceEnrolledAt || ''} onChange={e => set('insuranceEnrolledAt', e.target.value)} />
                    </Field>
                  </>
                )}
                <Field label="翌年度の意思">
                  <Select value={form.nextYearStatus || ''} onChange={e => set('nextYearStatus', e.target.value)}>
                    <option value="">未回答</option>
                    <option value="continue">継続</option>
                    <option value="withdraw">退会</option>
                  </Select>
                </Field>
              </div>

              {member.memberType !== 'group' && (
                <div className="border-t pt-4 mt-4">
                  <h3 className="font-medium text-sm text-gray-700 mb-2">参加教室</h3>
                  <div className="space-y-1">
                    {selectableCourses.map(c => (
                      <label key={c.id} className="flex items-center gap-2 p-1 text-sm cursor-pointer hover:bg-gray-50 rounded">
                        <input type="checkbox" checked={(form.courseIds || []).includes(c.id)} onChange={() => toggleCourse(c.id)} />
                        {c.name}
                        {c.active === false && <span className="text-gray-400 text-xs">（無効）</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <Button onClick={handleSave}>保存</Button>
                <Button variant="secondary" onClick={() => { setForm(member); setEditing(false); }}>キャンセル</Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2 text-sm">
                <Row label="氏名">{member.lastName} {member.firstName}（{member.lastNameKana} {member.firstNameKana}）</Row>
                <Row label="生年月日">{member.birthDate}</Row>
                {member.memberType !== 'group' && calcFiscalAge(member.birthDate) !== null && (
                  <Row label="年齢">
                    {calcFiscalAge(member.birthDate)}歳
                    <span className="text-gray-400 text-xs ml-1">（{currentFiscalYear()}年度・4月1日時点）</span>
                  </Row>
                )}
                {member.memberType !== 'group' && <Row label="性別">{GENDER_LABELS[member.gender || ''] || '未設定'}</Row>}
                <Row label="住所">{member.address}</Row>
                <Row label="区分">{member.areaType === 'in_town' ? '町内' : '町外'}</Row>
                <Row label="電話">{member.phone}</Row>
                <Row label="メール">{member.email}</Row>
                <Row label="登録日">{member.registeredAt}</Row>

                {member.memberType === 'junior' && (
                  <>
                    <Row label="通学先">{member.school}</Row>
                    <Row label="保護者">{member.guardianLastName} {member.guardianFirstName}（{member.guardianLastNameKana} {member.guardianFirstNameKana}）</Row>
                    <Row label="保護者電話">{member.guardianPhone}</Row>
                  </>
                )}
                {member.memberType === 'group' && (
                  <>
                    <Row label="団体名">{member.groupName}</Row>
                    <Row label="代表者">{member.representativeName}</Row>
                    <Row label="人数">{member.memberCount}名</Row>
                  </>
                )}
                <Row label="CSS番号">{member.cssNumber || '—'}</Row>
                {member.cssNumberCommunity && <Row label="地域クラブ用CSS">{member.cssNumberCommunity}</Row>}
                {member.memberType !== 'group' && member.schoolAidRecipient && (
                  <Row label="就学援助">受給世帯（地域クラブ参加費 -2,000円/月）</Row>
                )}
                {member.memberType !== 'general' && (
                  <Row label="保険加入">
                    {member.insuranceEnrolled
                      ? `加入${member.insuranceEnrolledAt ? `（${member.insuranceEnrolledAt}）` : ''}`
                      : '未加入'}
                  </Row>
                )}
                <Row label="翌年度">
                  {member.nextYearStatus === 'continue' ? '継続'
                    : member.nextYearStatus === 'withdraw' ? '退会'
                    : '未回答'}
                </Row>
              </div>

              <div className="border-t mt-4 pt-4">
                <h3 className="font-medium text-sm text-gray-700 mb-2">費用</h3>
                <div className="space-y-1 text-sm">
                  <Row label="年会費">{annualFee.toLocaleString()}円</Row>
                  {insurance > 0 && <Row label="保険料">{insurance.toLocaleString()}円</Row>}
                </div>
              </div>

              {member.memberType !== 'group' && (
                <div className="border-t mt-4 pt-4">
                  <h3 className="font-medium text-sm text-gray-700 mb-2">参加教室</h3>
                  {enrolledCourses.length > 0 ? (
                    <div className="space-y-1">
                      {enrolledCourses.map(c => (
                        <div key={c.id} className="text-sm flex justify-between">
                          <span>{c.name}</span>
                          <span className="text-gray-500 text-xs">{c.note}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">教室未登録</p>
                  )}
                </div>
              )}
            </>
          )}
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
