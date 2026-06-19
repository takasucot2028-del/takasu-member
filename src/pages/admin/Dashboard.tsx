import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer, Card, Input, Badge } from '../../components/UI';
import { BILLING_STATUS_LABELS } from '../../utils/constants';
import { getAllMembers, getBillingByMonth, getAllGroupBillings, getFailedBillings } from '../../api/data';
import type { Member, BillingRecord, GroupBilling } from '../../types';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Dashboard() {
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [members, setMembers] = useState<Member[]>([]);
  const [billing, setBilling] = useState<BillingRecord[]>([]);
  const [groups, setGroups] = useState<GroupBilling[]>([]);
  const [failed, setFailed] = useState<BillingRecord[]>([]);

  useEffect(() => {
    getAllMembers().then(setMembers);
    getAllGroupBillings().then(setGroups);
    getFailedBillings().then(setFailed);
  }, []);
  useEffect(() => { getBillingByMonth(yearMonth).then(setBilling); }, [yearMonth]);

  const active = members.filter(m => !m.isWithdrawn);
  const countByType = {
    general: active.filter(m => m.memberType === 'general').length,
    junior: active.filter(m => m.memberType === 'junior').length,
    group: active.filter(m => m.memberType === 'group').length,
  };
  const newThisMonth = active.filter(m => (m.registeredAt || '').slice(0, 7) === yearMonth).length;

  const billingTotal = billing.reduce((s, r) => s + r.total, 0);
  const statusCount = (s: string) => billing.filter(r => r.status === s).length;

  const failedGroup = groups.filter(g => g.status === 'failed');
  const failedTotal = failed.length + failedGroup.length;

  // CSS番号未設定で当月の振替ができない会員（口座振替画面と同じ判定）
  const missingCss = billing.filter(r => {
    const m = members.find(x => x.id === r.memberId);
    const primary = String(m?.cssNumber ?? '').trim();
    const communityCss = String(m?.cssNumberCommunity ?? '').trim() || primary;
    const communityNet = (r.monthlyCommunity || 0) - (r.subsidy || 0);
    const nonCommunity = (r.annualFee || 0) + (r.monthlyClassroom || 0) + (r.monthlyConsigned || 0) + (r.insuranceFee || 0) + (r.specialFee || 0);
    return (nonCommunity > 0 && !primary) || (communityNet > 0 && !communityCss);
  }).length;

  const genderUnset = active.filter(m => m.memberType !== 'group' && !m.gender).length;
  const nextYearUnanswered = active.filter(m => !m.nextYearStatus).length;

  return (
    <PageContainer title="ダッシュボード">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">対象月</span>
          <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="w-40" />
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="在籍会員" value={`${active.length}名`}
            sub={`一般${countByType.general}・ジュニア${countByType.junior}・団体${countByType.group}`} />
          <Stat label={`${yearMonth} 請求`} value={`${billing.length}件`}
            sub={`合計 ${billingTotal.toLocaleString()}円`} />
          <Stat label="引落不能" value={`${failedTotal}件`} alert={failedTotal > 0}
            sub={failedTotal > 0 ? '要対応' : '対応済'} />
          <Stat label="今月の新規入会" value={`${newThisMonth}名`} sub={yearMonth} />
        </div>

        {/* 要対応 */}
        <Card>
          <h2 className="font-medium text-gray-800 mb-3">要対応</h2>
          <div className="divide-y divide-gray-100">
            <ActionRow label="引落不能の請求" count={failedTotal} to="/admin/billing/unpaid"
              hint="翌月へ自動繰越されます。入金確認後は完了に。" />
            <ActionRow label={`${yearMonth} 請求でCSS番号が未設定`} count={missingCss} to="/admin/transfer"
              hint="口座振替できません。会員詳細でCSS番号を設定してください。" />
            <ActionRow label="性別が未設定の会員" count={genderUnset} to="/admin/members"
              hint="スポーツ安全保険の様式に必要です。" />
            <ActionRow label="翌年度の意思が未回答" count={nextYearUnanswered} to="/admin/members"
              hint="年度更新の前に継続・退会の確認を。" />
          </div>
        </Card>

        {/* 当月請求ステータス */}
        <Card>
          <h2 className="font-medium text-gray-800 mb-3">{yearMonth} の請求ステータス</h2>
          {billing.length === 0 ? (
            <p className="text-sm text-gray-400">
              この月の請求データがありません。
              <Link to="/admin/billing" className="text-blue-600 hover:underline ml-1">継続会費管理で生成</Link>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(['pending', 'billed', 'completed', 'failed'] as const).map(s => (
                <span key={s} className="inline-flex items-center gap-1 text-sm">
                  <Badge color={s === 'completed' ? 'green' : s === 'failed' ? 'red' : s === 'billed' ? 'blue' : 'gray'}>
                    {BILLING_STATUS_LABELS[s]}
                  </Badge>
                  <span className="text-gray-700">{statusCount(s)}件</span>
                </span>
              ))}
              <Link to="/admin/billing" className="text-blue-600 hover:underline text-sm ml-auto self-center">継続会費管理へ →</Link>
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}

function Stat({ label, value, sub, alert = false }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <Card className={alert ? 'border-red-200' : ''}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${alert ? 'text-red-600' : 'text-gray-800'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </Card>
  );
}

function ActionRow({ label, count, to, hint }: { label: string; count: number; to: string; hint: string }) {
  const ok = count === 0;
  return (
    <Link to={to} className="flex items-center justify-between py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded">
      <div>
        <div className="text-sm text-gray-800">{label}</div>
        <div className="text-xs text-gray-400">{hint}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {ok
          ? <Badge color="green">0件</Badge>
          : <Badge color="red">{count}件</Badge>}
        <span className="text-gray-300">›</span>
      </div>
    </Link>
  );
}
