import { useState, useEffect } from 'react';
import { PageContainer, Card, Button, Table, Th, Td, Badge, Modal, Field, Input, Select, Alert } from '../../components/UI';
import { COURSES, BILLING_STATUS_LABELS } from '../../utils/constants';
import {
  getAllMembers, getBillingByMonth, saveBillingRecords, replaceMonthlyBilling,
  updateBillingStatus, calcAnnualFee, calcInsurance,
  getFailedBillings,
} from '../../api/data';
import type { Member, BillingRecord } from '../../types';
import * as XLSX from 'xlsx';

function getCurrentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getTermForMonth(month: number): number | null {
  if (month >= 5 && month <= 7) return 1;
  if (month >= 8 && month <= 12) return 2;
  if (month >= 1 && month <= 3) return 3;
  return null;
}

export default function Billing() {
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth());
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [adjustModal, setAdjustModal] = useState<{ memberId: string; memberName: string } | null>(null);
  const [adjMemberId, setAdjMemberId] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [adjDue, setAdjDue] = useState('');
  const [msg, setMsg] = useState('');
  // 在籍中の個人会員（調整請求の対象選択用）
  const [activeMembers, setActiveMembers] = useState<Member[]>([]);

  useEffect(() => { loadBilling(); }, [yearMonth]);
  useEffect(() => {
    getAllMembers().then(all =>
      setActiveMembers(all.filter(m => !m.isWithdrawn && m.memberType !== 'group'))
    );
  }, []);

  const loadBilling = async () => {
    setRecords(await getBillingByMonth(yearMonth));
  };

  const generateBilling = async () => {
    const members = (await getAllMembers()).filter(m => !m.isWithdrawn && m.memberType !== 'group');
    const month = parseInt(yearMonth.split('-')[1], 10);
    const year = parseInt(yearMonth.split('-')[0], 10);
    const term = getTermForMonth(month);

    // 前月の引落不能を繰越
    const failed = await getFailedBillings();

    const newRecords: BillingRecord[] = [];

    members.forEach(m => {
      let courseFee = 0;

      m.courseIds.forEach(cid => {
        const course = COURSES.find(c => c.id === cid);
        if (!course) return;
        const fee = m.areaType === 'in_town' ? course.feeInTown : course.feeOutOfTown;

        if (course.paymentMethod === 'monthly') {
          courseFee += fee;
        } else if (course.paymentMethod === 'term3' && term !== null) {
          // 3期払いは各期の最初の月のみ請求
          const termFirstMonths = [5, 8, 1];
          if (termFirstMonths[term - 1] === month) {
            courseFee += fee;
          }
        }
        // term1 / ticket / none はここでは自動生成しない（none は徴収なし、他は事務局が手動）
      });

      // 年会費は4月のみ
      const annualFee = month === 4 ? calcAnnualFee(m.memberType, m.areaType) : 0;
      // 保険料は4月のみ
      const insuranceFee = month === 4 ? calcInsurance(m.memberType) : 0;

      const total = annualFee + insuranceFee + courseFee;
      if (total === 0) return;

      newRecords.push({
        id: `${yearMonth}-${m.id}`,
        memberId: m.id,
        memberNumber: m.memberNumber,
        memberName: `${m.lastName} ${m.firstName}`,
        yearMonth,
        dueDate: `${year}-${String(month).padStart(2, '0')}-27`,
        annualFee,
        insuranceFee,
        courseFee,
        adjustmentFee: 0,
        adjustmentNote: '',
        total,
        status: 'pending',
        isRetry: false,
      });
    });

    // 引落不能の繰越を追加
    failed.forEach(f => {
      const existing = newRecords.find(r => r.memberId === f.memberId);
      if (existing) {
        existing.adjustmentFee += f.total;
        existing.adjustmentNote = `前月繰越 ${f.total.toLocaleString()}円`;
        existing.total += f.total;
        existing.isRetry = true;
      } else {
        newRecords.push({
          ...f,
          id: `${yearMonth}-retry-${f.memberId}`,
          yearMonth,
          dueDate: `${year}-${String(month).padStart(2, '0')}-27`,
          annualFee: 0,
          insuranceFee: 0,
          courseFee: 0,
          adjustmentFee: f.total,
          adjustmentNote: `前月繰越`,
          total: f.total,
          status: 'pending',
          isRetry: true,
        });
      }
    });

    // 対象月を完全に置換（退会者の旧レコードを除去）。手動調整はデータ層で保持。
    await replaceMonthlyBilling(yearMonth, newRecords);
    await loadBilling();
    setMsg(`${yearMonth}の請求データを${newRecords.length}件生成しました`);
  };

  const toggleStatus = async (id: string, status: string) => {
    await updateBillingStatus(id, status);
    await loadBilling();
  };

  const handleAddAdjustment = async () => {
    if (!adjustModal || !adjAmount) return;
    const amount = parseInt(adjAmount, 10);
    if (isNaN(amount)) return;

    // 行から開いた場合は会員固定、ヘッダーから開いた場合は select で選択
    const memberId = adjustModal.memberId || adjMemberId;
    if (!memberId) return;
    const member = activeMembers.find(m => m.id === memberId);
    const memberName = member ? `${member.lastName} ${member.firstName}` : adjustModal.memberName;

    // 調整請求は常に独立した `-adj-` レコードとして登録する。
    // これにより個別引落日（1期払い教室の引落日設定など）が確実に反映され、
    // 月次請求の再生成でも調整が失われない。
    const adjId = `${yearMonth}-adj-${memberId}`;
    const existingAdj = records.find(r => r.id === adjId);
    const prevAmount = existingAdj ? existingAdj.adjustmentFee : 0;
    const newRecord: BillingRecord = {
      id: adjId,
      memberId,
      memberNumber: member ? member.memberNumber : (existingAdj ? existingAdj.memberNumber : ''),
      memberName,
      yearMonth,
      dueDate: adjDue || existingAdj?.dueDate || `${yearMonth}-27`,
      annualFee: 0, insuranceFee: 0, courseFee: 0,
      adjustmentFee: prevAmount + amount,
      adjustmentNote: adjNote,
      total: prevAmount + amount,
      status: 'pending',
      isRetry: false,
    };
    await saveBillingRecords([newRecord]);

    setAdjustModal(null);
    setAdjMemberId('');
    setAdjAmount('');
    setAdjNote('');
    setAdjDue('');
    await loadBilling();
  };

  const exportExcel = () => {
    const rows = records.map(r => ({
      '会員番号': r.memberNumber,
      '氏名': r.memberName,
      '年会費': r.annualFee,
      '保険料': r.insuranceFee,
      '参加費': r.courseFee,
      '調整額': r.adjustmentFee,
      '調整備考': r.adjustmentNote,
      '合計': r.total,
      '引落日': r.dueDate,
      'ステータス': BILLING_STATUS_LABELS[r.status],
      '再請求': r.isRetry ? '○' : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `請求_${yearMonth}`);
    XLSX.writeFile(wb, `請求一覧_${yearMonth}.xlsx`);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': return 'green';
      case 'failed': return 'red';
      case 'billed': return 'blue';
      default: return 'gray';
    }
  };

  const totalAmount = records.reduce((s, r) => s + r.total, 0);

  return (
    <PageContainer title="月次請求管理">
      <Card>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="w-48" />
          <Button size="sm" onClick={generateBilling}>請求データ生成</Button>
          <Button size="sm" variant="secondary" onClick={exportExcel}>Excel出力</Button>
          <Button size="sm" variant="secondary" onClick={() => { setAdjustModal({ memberId: '', memberName: '' }); setAdjMemberId(''); setAdjAmount(''); setAdjNote(''); setAdjDue(''); }}>調整請求追加</Button>
        </div>

        {msg && <Alert type="info">{msg}</Alert>}

        <div className="flex gap-4 text-sm text-gray-600 mb-3">
          <span>{records.length}件</span>
          <span>合計: <strong className="text-gray-800">{totalAmount.toLocaleString()}円</strong></span>
        </div>

        <Table>
          <thead>
            <tr>
              <Th>会員番号</Th>
              <Th>氏名</Th>
              <Th className="text-right">年会費</Th>
              <Th className="text-right hidden sm:table-cell">保険料</Th>
              <Th className="text-right">参加費</Th>
              <Th className="text-right hidden sm:table-cell">調整</Th>
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
                <Td className="text-right text-xs">{r.annualFee > 0 ? r.annualFee.toLocaleString() : '-'}</Td>
                <Td className="text-right text-xs hidden sm:table-cell">{r.insuranceFee > 0 ? r.insuranceFee.toLocaleString() : '-'}</Td>
                <Td className="text-right text-xs">{r.courseFee > 0 ? r.courseFee.toLocaleString() : '-'}</Td>
                <Td className="text-right text-xs hidden sm:table-cell">{r.adjustmentFee !== 0 ? r.adjustmentFee.toLocaleString() : '-'}</Td>
                <Td className="text-right font-medium">{r.total.toLocaleString()}</Td>
                <Td>
                  <Badge color={statusColor(r.status) as 'gray' | 'green' | 'red' | 'blue'}>
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
                      <Button size="sm" variant="ghost" onClick={() => setAdjustModal({ memberId: r.memberId, memberName: r.memberName })}>調整</Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><Td className="text-center text-gray-400 py-8" colSpan={9}>請求データがありません。「請求データ生成」をクリックしてください</Td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      {/* 調整モーダル */}
      <Modal open={!!adjustModal} onClose={() => setAdjustModal(null)} title="調整請求登録">
        {adjustModal?.memberId ? (
          <p className="text-sm text-gray-600 mb-4">対象: {adjustModal.memberName}</p>
        ) : (
          <Field label="対象会員">
            <Select value={adjMemberId} onChange={e => setAdjMemberId(e.target.value)}>
              <option value="">選択...</option>
              {activeMembers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.memberNumber} {m.lastName} {m.firstName}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="金額">
          <Input type="number" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="3000" />
        </Field>
        <Field label="備考">
          <Input value={adjNote} onChange={e => setAdjNote(e.target.value)} placeholder="途中参加 月割分" />
        </Field>
        <Field label="引落日">
          <Input type="date" value={adjDue} onChange={e => setAdjDue(e.target.value)} />
        </Field>
        <div className="flex gap-3 mt-4">
          <Button onClick={handleAddAdjustment}>登録</Button>
          <Button variant="secondary" onClick={() => setAdjustModal(null)}>キャンセル</Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
