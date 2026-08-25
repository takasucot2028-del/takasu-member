import { useState, useEffect } from 'react';
import { PageContainer, Card, Button, Table, Th, Td, Badge, Modal, Field, Input, Select, Alert } from '../../components/UI';
import { BILLING_STATUS_LABELS, SCHOOL_AID_MONTHLY_DISCOUNT } from '../../utils/constants';
import { useCourses } from '../../components/CoursesContext';
import {
  getAllMembers, getBillingByMonth, saveBillingRecords, replaceMonthlyBilling,
  updateBillingStatus, calcAnnualFee, calcInsurance,
  getBillingSchedule, saveBillingSchedule,
} from '../../api/data';
import type { Member, BillingRecord, BillingSchedule } from '../../types';
import * as XLSX from 'xlsx';

function getCurrentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 'YYYY-MM' または 'YYYY-MM-DD' の翌月を 'YYYY-MM' で返す。空なら ''。
function monthAfter(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m] = dateStr.split('-').map(n => parseInt(n, 10));
  if (!y || !m) return '';
  const d = new Date(y, m, 1); // m は0始まり換算で翌月
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function prevYearMonth(ym: string): string {
  const [y, m] = ym.split('-').map(n => parseInt(n, 10));
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type Fees = {
  annualFee: number; monthlyClassroom: number; monthlyConsigned: number;
  monthlyCommunity: number; insuranceFee: number; specialFee: number;
};
const emptyFees = (): Fees => ({
  annualFee: 0, monthlyClassroom: 0, monthlyConsigned: 0,
  monthlyCommunity: 0, insuranceFee: 0, specialFee: 0,
});
const sumFees = (f: Fees) =>
  f.annualFee + f.monthlyClassroom + f.monthlyConsigned + f.monthlyCommunity + f.insuranceFee + f.specialFee;

export default function Billing() {
  const { courses } = useCourses();
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth());
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [activeMembers, setActiveMembers] = useState<Member[]>([]);
  const [msg, setMsg] = useState('');

  // 特別徴収モーダル
  const [specialModal, setSpecialModal] = useState<{ memberId: string; memberName: string } | null>(null);
  const [spMemberId, setSpMemberId] = useState('');
  const [spAmount, setSpAmount] = useState('');
  const [spNote, setSpNote] = useState('');
  const [spDue, setSpDue] = useState('');

  // 請求月設定モーダル
  const [schedModal, setSchedModal] = useState(false);
  const [schedDraft, setSchedDraft] = useState<Record<string, string>>({});

  useEffect(() => { loadBilling(); }, [yearMonth]);
  useEffect(() => {
    getAllMembers().then(all => setActiveMembers(all.filter(m => !m.isWithdrawn && m.memberType !== 'group')));
  }, []);

  const loadBilling = async () => setRecords(await getBillingByMonth(yearMonth));

  const [generating, setGenerating] = useState(false);

  const generateBilling = async () => {
   setGenerating(true);
   setMsg('請求データを生成中です…');
   try {
    const year = parseInt(yearMonth.split('-')[0], 10);
    const month = parseInt(yearMonth.split('-')[1], 10);
    const due = `${year}-${String(month).padStart(2, '0')}-27`;
    const schedule = await getBillingSchedule();
    const members = (await getAllMembers()).filter(m => !m.isWithdrawn && m.memberType !== 'group');

    // 年会費の計上判定: 継続会員は4月、年度途中入会は入会翌月
    const annualDue = (m: Member) =>
      month === 4 ? (!!m.registeredAt && m.registeredAt < `${year}-04-01`) : (monthAfter(m.registeredAt) === yearMonth);
    // 保険料の計上判定: 一般会員以外＋加入者。
    // 継続（当年度4/1以前の加入＝年度更新で4/1に更新された継続者を含む）は4月に計上。
    // 年度途中の加入（4/1より後）は加入翌月に計上（4月計上分と二重にならないよう限定）。
    const insuranceDue = (m: Member) => {
      if (m.memberType === 'general' || !m.insuranceEnrolled) return false;
      const at = m.insuranceEnrolledAt || '';
      if (!at) return false;
      const fyStart = `${year}-04-01`;
      return month === 4 ? at <= fyStart : (at > fyStart && monthAfter(at) === yearMonth);
    };

    const build = (m: { id: string; memberNumber: string; memberName: string }, f: Fees, subsidy: number, isRetry: boolean): BillingRecord => ({
      id: `${yearMonth}-${m.id}`,
      memberId: m.id, memberNumber: m.memberNumber, memberName: m.memberName,
      yearMonth, dueDate: due,
      annualFee: f.annualFee, monthlyClassroom: f.monthlyClassroom, monthlyConsigned: f.monthlyConsigned,
      monthlyCommunity: f.monthlyCommunity, insuranceFee: f.insuranceFee, specialFee: f.specialFee,
      specialNote: '', subsidy, total: sumFees(f) - subsidy, status: 'pending', isRetry, carriedTo: '',
    });

    const recMap: Record<string, BillingRecord> = {};
    members.forEach(m => {
      // 入会月より前の月は請求しない
      if (m.registeredAt && m.registeredAt.slice(0, 7) > yearMonth) return;
      const f = emptyFees();
      m.courseIds.forEach(cid => {
        const course = courses.find(c => c.id === cid);
        if (!course) return;
        const fee = m.areaType === 'in_town' ? course.feeInTown : course.feeOutOfTown;
        let charge = false;
        if (course.paymentMethod === 'monthly') charge = true;
        else if (course.paymentMethod === 'term3' || course.paymentMethod === 'term1' || course.paymentMethod === 'scheduled') {
          charge = (schedule[cid] || []).includes(month);
        }
        if (!charge) return;
        if (course.category === 'classroom') f.monthlyClassroom += fee;
        else if (course.category === 'consigned') f.monthlyConsigned += fee;
        else f.monthlyCommunity += fee;
      });
      if (annualDue(m)) f.annualFee = calcAnnualFee(m.memberType, m.areaType);
      if (insuranceDue(m)) f.insuranceFee = calcInsurance(m.memberType, m.memberCount);

      // 就学援助受給世帯は毎月払いの地域クラブ参加費から2,000円控除（フロア0）
      const subsidy = (m.schoolAidRecipient && f.monthlyCommunity > 0)
        ? Math.min(SCHOOL_AID_MONTHLY_DISCOUNT, f.monthlyCommunity)
        : 0;

      if (sumFees(f) > 0) {
        recMap[m.id] = build({ id: m.id, memberNumber: m.memberNumber, memberName: `${m.lastName} ${m.firstName}` }, f, subsidy, false);
      }
    });

    // 前月の引落不能を「同じ費目のまま」当月へ繰越（合算・再請求）
    const carry = (await getBillingByMonth(prevYearMonth(yearMonth))).filter(r => r.status === 'failed');
    carry.forEach(cf => {
      let rec = recMap[cf.memberId];
      if (!rec) {
        rec = build({ id: cf.memberId, memberNumber: cf.memberNumber, memberName: cf.memberName }, emptyFees(), 0, true);
        recMap[cf.memberId] = rec;
      }
      rec.annualFee += cf.annualFee || 0;
      rec.monthlyClassroom += cf.monthlyClassroom || 0;
      rec.monthlyConsigned += cf.monthlyConsigned || 0;
      rec.monthlyCommunity += cf.monthlyCommunity || 0;
      rec.insuranceFee += cf.insuranceFee || 0;
      rec.specialFee += cf.specialFee || 0;
      rec.subsidy = (rec.subsidy || 0) + (cf.subsidy || 0); // 控除も繰越（同費目で再請求）
      if (cf.specialNote && !rec.specialNote) rec.specialNote = cf.specialNote;
      rec.isRetry = true;
      rec.total = rec.annualFee + rec.monthlyClassroom + rec.monthlyConsigned + rec.monthlyCommunity + rec.insuranceFee + rec.specialFee - rec.subsidy;
    });

    const newRecords = Object.values(recMap);

    // すでに処理済み（未請求以外＝請求済・引落完了・引落不能・繰越済）の請求は、
    // 再生成で内容・ステータスを巻き戻さない。未請求のものだけ最新内容へ差し替える。
    // （-adj- の手動調整は replaceMonthlyBilling 側で常に保持される）
    const existing = (await getBillingByMonth(yearMonth)).filter(r => !r.id.includes('-adj-'));
    const existingById = new Map(existing.map(r => [r.id, r]));
    const merged = newRecords.map(r => {
      const ex = existingById.get(r.id);
      return ex && ex.status !== 'pending' ? ex : r;
    });
    // 生成対象に含まれなくなったが処理済みの既存レコード（途中で対象外になった会員等）も保持
    const newIds = new Set(newRecords.map(r => r.id));
    const preservedProcessed = existing.filter(r => r.status !== 'pending' && !newIds.has(r.id));
    const finalRecords = [...merged, ...preservedProcessed];

    await replaceMonthlyBilling(yearMonth, finalRecords);
    await loadBilling();
    setMsg(`${yearMonth}の継続会費を${finalRecords.length}件生成しました（処理済みは保持）`);
   } catch (e) {
     setMsg(`請求生成でエラーが発生しました: ${e instanceof Error ? e.message : String(e)}`);
   } finally {
     setGenerating(false);
   }
  };

  const toggleStatus = async (id: string, status: string) => {
    await updateBillingStatus(id, status);
    await loadBilling();
  };

  const handleAddSpecial = async () => {
    if (!specialModal || !spAmount) return;
    const amount = parseInt(spAmount, 10);
    if (isNaN(amount)) return;
    const memberId = specialModal.memberId || spMemberId;
    if (!memberId) return;
    const member = activeMembers.find(m => m.id === memberId);
    const memberName = member ? `${member.lastName} ${member.firstName}` : specialModal.memberName;

    // 特別徴収は独立した `-adj-` レコード（再生成でも保持される）
    const id = `${yearMonth}-adj-${memberId}`;
    const existing = records.find(r => r.id === id);
    const prevAmount = existing ? existing.specialFee : 0;
    const rec: BillingRecord = {
      id, memberId,
      memberNumber: member ? member.memberNumber : (existing ? existing.memberNumber : ''),
      memberName, yearMonth,
      dueDate: spDue || existing?.dueDate || `${yearMonth}-27`,
      annualFee: 0, monthlyClassroom: 0, monthlyConsigned: 0, monthlyCommunity: 0, insuranceFee: 0,
      specialFee: prevAmount + amount, specialNote: spNote, subsidy: 0,
      total: prevAmount + amount, status: 'pending', isRetry: false, carriedTo: '',
    };
    await saveBillingRecords([rec]);
    setSpecialModal(null); setSpMemberId(''); setSpAmount(''); setSpNote(''); setSpDue('');
    await loadBilling();
  };

  // 請求月設定
  const openSchedule = async () => {
    const sched = await getBillingSchedule();
    const draft: Record<string, string> = {};
    termCourses.forEach(c => { draft[c.id] = (sched[c.id] || []).join(','); });
    setSchedDraft(draft);
    setSchedModal(true);
  };
  const saveSchedule = async () => {
    const sched: BillingSchedule = {};
    Object.entries(schedDraft).forEach(([cid, val]) => {
      sched[cid] = val.split(/[,、\s]+/).map(s => parseInt(s.trim(), 10)).filter(n => n >= 1 && n <= 12);
    });
    await saveBillingSchedule(sched);
    setSchedModal(false);
    setMsg('請求月設定を保存しました');
  };

  const exportExcel = () => {
    const rows = records.map(r => ({
      '会員番号': r.memberNumber, '氏名': r.memberName,
      '年会費': r.annualFee, '月会費(教室)': r.monthlyClassroom, '月会費(委託)': r.monthlyConsigned,
      '月会費(地域クラブ)': r.monthlyCommunity, '保険料': r.insuranceFee,
      '特別徴収': r.specialFee, '特別徴収備考': r.specialNote, '就学援助補助': r.subsidy ? -r.subsidy : 0,
      '合計': r.total, '引落日': r.dueDate, '状態': BILLING_STATUS_LABELS[r.status], '再請求': r.isRetry ? '○' : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `継続会費_${yearMonth}`);
    XLSX.writeFile(wb, `継続会費_${yearMonth}.xlsx`);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': return 'green';
      case 'failed': return 'red';
      case 'billed': return 'blue';
      case 'carried': return 'yellow';
      default: return 'gray';
    }
  };

  const termCourses = courses.filter(c => c.paymentMethod === 'term3' || c.paymentMethod === 'term1' || c.paymentMethod === 'scheduled');
  const totalAmount = records.reduce((s, r) => s + r.total, 0);
  const cell = (n: number) => (n > 0 ? n.toLocaleString() : '-');

  return (
    <PageContainer title="継続会費管理">
      <Card>
        <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
          <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="w-44" />
          <Button size="sm" onClick={generateBilling} disabled={generating}>{generating ? '生成中…' : '請求データ生成'}</Button>
          <Button size="sm" variant="secondary" onClick={openSchedule}>請求月設定</Button>
          <Button size="sm" variant="secondary" onClick={exportExcel}>Excel出力</Button>
          <Button size="sm" variant="secondary" onClick={() => { setSpecialModal({ memberId: '', memberName: '' }); setSpMemberId(''); setSpAmount(''); setSpNote(''); setSpDue(''); }}>特別徴収追加</Button>
        </div>

        {msg && <Alert type="info">{msg}</Alert>}

        <div className="flex gap-4 text-sm text-gray-600 mb-3">
          <span>{records.length}件</span>
          <span>合計: <strong className="text-gray-800">{totalAmount.toLocaleString()}円</strong></span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>会員番号</Th>
                <Th>氏名</Th>
                <Th className="text-right">年会費</Th>
                <Th className="text-right">月会費(教室)</Th>
                <Th className="text-right hidden md:table-cell">月会費(委託)</Th>
                <Th className="text-right hidden md:table-cell">月会費(地域)</Th>
                <Th className="text-right hidden sm:table-cell">保険料</Th>
                <Th className="text-right hidden sm:table-cell">特別徴収</Th>
                <Th className="text-right hidden lg:table-cell">就学援助補助</Th>
                <Th className="text-right">合計</Th>
                <Th>状態</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} className={r.isRetry ? 'bg-yellow-50' : ''}>
                  <Td className="font-mono text-xs">{r.memberNumber}</Td>
                  <Td className="text-sm">
                    {r.memberName}
                    {r.isRetry && <Badge color="yellow" className="ml-1">再請求</Badge>}
                  </Td>
                  <Td className="text-right text-xs">{cell(r.annualFee)}</Td>
                  <Td className="text-right text-xs">{cell(r.monthlyClassroom)}</Td>
                  <Td className="text-right text-xs hidden md:table-cell">{cell(r.monthlyConsigned)}</Td>
                  <Td className="text-right text-xs hidden md:table-cell">{cell(r.monthlyCommunity)}</Td>
                  <Td className="text-right text-xs hidden sm:table-cell">{cell(r.insuranceFee)}</Td>
                  <Td className="text-right text-xs hidden sm:table-cell" title={r.specialNote}>{cell(r.specialFee)}</Td>
                  <Td className="text-right text-xs hidden lg:table-cell text-blue-600">{r.subsidy ? `-${r.subsidy.toLocaleString()}` : '-'}</Td>
                  <Td className="text-right font-medium">{r.total.toLocaleString()}</Td>
                  <Td>
                    <Badge color={statusColor(r.status) as 'gray' | 'green' | 'red' | 'blue' | 'yellow'}>
                      {BILLING_STATUS_LABELS[r.status]}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      {r.status === 'pending' && (
                        <Button size="sm" variant="ghost" onClick={() => toggleStatus(r.id, 'billed')}>請求済</Button>
                      )}
                      {r.status === 'billed' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => toggleStatus(r.id, 'completed')}>完了</Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleStatus(r.id, 'failed')}>不能</Button>
                        </>
                      )}
                      {r.status !== 'completed' && (
                        <Button size="sm" variant="ghost" onClick={() => setSpecialModal({ memberId: r.memberId, memberName: r.memberName })}>特別徴収</Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><Td className="text-center text-gray-400 py-8" colSpan={12}>継続会費データがありません。「請求データ生成」をクリックしてください</Td></tr>
              )}
            </tbody>
          </Table>
        </div>
      </Card>

      {/* 特別徴収モーダル */}
      <Modal open={!!specialModal} onClose={() => setSpecialModal(null)} title="特別徴収の登録">
        {specialModal?.memberId ? (
          <p className="text-sm text-gray-600 mb-4">対象: {specialModal.memberName}</p>
        ) : (
          <Field label="対象会員">
            <Select value={spMemberId} onChange={e => setSpMemberId(e.target.value)}>
              <option value="">選択...</option>
              {activeMembers.map(m => (
                <option key={m.id} value={m.id}>{m.memberNumber} {m.lastName} {m.firstName}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="金額">
          <Input type="number" value={spAmount} onChange={e => setSpAmount(e.target.value)} placeholder="3000" />
        </Field>
        <Field label="備考">
          <Input value={spNote} onChange={e => setSpNote(e.target.value)} placeholder="大会参加費・ユニフォーム代 等" />
        </Field>
        <Field label="引落日">
          <Input type="date" value={spDue} onChange={e => setSpDue(e.target.value)} />
        </Field>
        <div className="flex gap-3 mt-4">
          <Button onClick={handleAddSpecial}>登録</Button>
          <Button variant="secondary" onClick={() => setSpecialModal(null)}>キャンセル</Button>
        </div>
      </Modal>

      {/* 請求月設定モーダル */}
      <Modal open={schedModal} onClose={() => setSchedModal(false)} title="請求月設定（3期・1期払い）">
        <p className="text-sm text-gray-600 mb-3">
          教室ごとに請求する月をカンマ区切りで入力します（例: 3期払い「6,9,1」／1期払い「6」）。毎月払いは毎月のため設定不要です。
        </p>
        <div className="space-y-2 max-h-96 overflow-auto">
          {termCourses.map(c => (
            <div key={c.id} className="flex items-center gap-2">
              <span className="text-sm flex-1">{c.name}<span className="text-gray-400 text-xs ml-1">({c.note})</span></span>
              <Input
                value={schedDraft[c.id] ?? ''}
                onChange={e => setSchedDraft(prev => ({ ...prev, [c.id]: e.target.value }))}
                placeholder={c.paymentMethod === 'term3' ? '6,9,1' : '6'}
                className="w-28"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-4">
          <Button onClick={saveSchedule}>保存</Button>
          <Button variant="secondary" onClick={() => setSchedModal(false)}>キャンセル</Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
