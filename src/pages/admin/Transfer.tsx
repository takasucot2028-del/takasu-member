import { useState, useEffect } from 'react';
import { PageContainer, Card, Input, Button, Table, Th, Td, Badge, Alert } from '../../components/UI';
import { BILLING_STATUS_LABELS } from '../../utils/constants';
import { getAllMembers, getBillingByMonth, getAllGroupBillings } from '../../api/data';
import { downloadCssExport, downloadResultReport } from '../../utils/transfer';
import type { Member, BillingRecord, GroupBilling } from '../../types';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Transfer() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [members, setMembers] = useState<Member[]>([]);
  const [billing, setBilling] = useState<BillingRecord[]>([]);
  const [groups, setGroups] = useState<GroupBilling[]>([]);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setMembers(await getAllMembers());
    setBilling(await getBillingByMonth(yearMonth));
    setGroups(await getAllGroupBillings());
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [yearMonth]);

  const groupsThisMonth = groups.filter(g => (g.dueDate || '').slice(0, 7) === yearMonth && g.status !== 'completed' && g.status !== 'failed');
  const billingTotal = billing.reduce((s, r) => s + r.total, 0);
  const groupTotal = groupsThisMonth.reduce((s, g) => s + g.amount, 0);
  const missingCss = billing.filter(r => !(members.find(m => m.id === r.memberId)?.cssNumber || '').trim());

  const exportCss = () => {
    const n = downloadCssExport(yearMonth, members, billing, groupsThisMonth);
    setMsg(`口座振替データ（CSS様式）を出力しました：${n}件（CSS番号ごと）`);
  };
  const exportResult = () => {
    downloadResultReport(yearMonth, billing);
    setMsg('振替結果帳票を出力しました');
  };

  return (
    <PageContainer title="口座振替">
      <div className="space-y-4">
        {msg && <Alert type="success">{msg}</Alert>}

        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
            <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="w-44" />
            <span className="text-sm text-gray-600">
              継続会費 {billing.length}件・{billingTotal.toLocaleString()}円 ／ 団体請求 {groupsThisMonth.length}件・{groupTotal.toLocaleString()}円
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={exportCss}>口座振替データ出力（CSS様式）</Button>
            <Button variant="secondary" onClick={exportResult}>振替結果帳票出力</Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            その月に引き落とす継続会費（特別徴収含む）と、引落日が当月の団体請求を、CSS番号（家庭）ごとに合算して出力します。
          </p>

          {missingCss.length > 0 && (
            <Alert type="error">
              CSS番号が未設定の会員が {missingCss.length}件 あります（口座振替できません）。会員詳細でCSS番号を設定してください：
              {' '}{missingCss.slice(0, 10).map(r => r.memberName).join('、')}{missingCss.length > 10 ? ' ほか' : ''}
            </Alert>
          )}
        </Card>

        {/* 当月の継続会費プレビュー */}
        <Card>
          <h3 className="font-medium text-gray-700 text-sm mb-2">当月の継続会費（{yearMonth}）</h3>
          <Table>
            <thead>
              <tr>
                <Th>会員番号</Th>
                <Th>氏名</Th>
                <Th>CSS番号</Th>
                <Th className="text-right">合計</Th>
                <Th>状態</Th>
              </tr>
            </thead>
            <tbody>
              {billing.map(r => {
                const css = members.find(m => m.id === r.memberId)?.cssNumber || '';
                return (
                  <tr key={r.id}>
                    <Td className="font-mono text-xs">{r.memberNumber}</Td>
                    <Td className="text-sm">{r.memberName}{r.isRetry && <Badge color="yellow" className="ml-1">再請求</Badge>}</Td>
                    <Td className={`font-mono text-xs ${css ? '' : 'text-red-500'}`}>{css || '未設定'}</Td>
                    <Td className="text-right">{r.total.toLocaleString()}円</Td>
                    <Td><Badge>{BILLING_STATUS_LABELS[r.status]}</Badge></Td>
                  </tr>
                );
              })}
              {billing.length === 0 && (
                <tr><Td className="text-center text-gray-400 py-8" colSpan={5}>当月の継続会費データがありません（継続会費管理で生成してください）</Td></tr>
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </PageContainer>
  );
}
