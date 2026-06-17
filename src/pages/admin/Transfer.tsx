import { useState, useEffect, useRef } from 'react';
import { PageContainer, Card, Input, Button, Table, Th, Td, Badge, Alert } from '../../components/UI';
import { BILLING_STATUS_LABELS } from '../../utils/constants';
import { getAllMembers, getBillingByMonth, getAllGroupBillings, bulkUpdateCss } from '../../api/data';
import { downloadCssExport, downloadResultReport, matchCssNumbers, type CssMatchResult } from '../../utils/transfer';
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

  // CSS番号一括設定
  const cssFileRef = useRef<HTMLInputElement>(null);
  const [cssResult, setCssResult] = useState<CssMatchResult | null>(null);
  const [cssRunning, setCssRunning] = useState(false);

  const load = async () => {
    setMembers(await getAllMembers());
    setBilling(await getBillingByMonth(yearMonth));
    setGroups(await getAllGroupBillings());
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [yearMonth]);

  const groupsThisMonth = groups.filter(g => (g.dueDate || '').slice(0, 7) === yearMonth && g.status !== 'completed' && g.status !== 'failed');
  const billingTotal = billing.reduce((s, r) => s + r.total, 0);
  const groupTotal = groupsThisMonth.reduce((s, g) => s + g.amount, 0);
  // CSS番号未設定で引落できない費目がある会員を抽出。
  // 地域クラブ参加費は地域クラブ用CSS（未設定なら主CSS）、それ以外は主CSSが必要。
  const missingCss = billing.filter(r => {
    const m = members.find(x => x.id === r.memberId);
    const primary = String(m?.cssNumber ?? '').trim();
    const communityCss = String(m?.cssNumberCommunity ?? '').trim() || primary;
    const communityNet = (r.monthlyCommunity || 0) - (r.subsidy || 0);
    const nonCommunity = (r.annualFee || 0) + (r.monthlyClassroom || 0) + (r.monthlyConsigned || 0) + (r.insuranceFee || 0) + (r.specialFee || 0);
    return (nonCommunity > 0 && !primary) || (communityNet > 0 && !communityCss);
  });

  // 出力時は画面の状態に依存せず、最新データを取り直してから生成する。
  // （会員データの読み込み完了前に押されても空にならないようにするため）
  const exportCss = async () => {
    const [mems, bills, grps] = await Promise.all([
      getAllMembers(), getBillingByMonth(yearMonth), getAllGroupBillings(),
    ]);
    const grpThis = grps.filter(g => (g.dueDate || '').slice(0, 7) === yearMonth && g.status !== 'completed' && g.status !== 'failed');
    if (mems.length === 0 || bills.length === 0) {
      setMsg('データを取得できませんでした。少し待ってから再度お試しください。');
      return;
    }
    const n = downloadCssExport(yearMonth, mems, bills, grpThis);
    setMsg(`口座振替データ（CSS様式）を出力しました：${n}件（CSS番号ごと）`);
  };
  const exportResult = async () => {
    const bills = await getBillingByMonth(yearMonth);
    downloadResultReport(yearMonth, bills);
    setMsg('振替結果帳票を出力しました');
  };

  const handleCssFile = async (file: File) => {
    setMsg('');
    const buffer = await file.arrayBuffer();
    // 会員リストが未読込のまま照合されないよう、必ず最新を取得して使う
    const mems = await getAllMembers();
    if (mems.length === 0) { setMsg('会員データを取得できませんでした。再読み込みしてからお試しください。'); return; }
    setCssResult(matchCssNumbers(buffer, mems));
  };
  const runCss = async () => {
    if (!cssResult) return;
    setCssRunning(true);
    let resultMsg = '';
    try {
      const res = await bulkUpdateCss(cssResult.updates.map(u => ({ memberId: u.memberId, cssNumber: u.cssNumber })));
      resultMsg = `CSS番号を${res.updated}件設定しました`;
    } catch (e) {
      resultMsg = `設定に失敗しました: ${e instanceof Error ? e.message : String(e)}`;
    }
    setCssRunning(false);
    setCssResult(null);
    if (cssFileRef.current) cssFileRef.current.value = '';
    setMsg(resultMsg);
    await load();
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

        {/* CSS番号 一括設定 */}
        <Card>
          <h3 className="font-medium text-gray-700 text-sm mb-1">CSS番号の一括設定</h3>
          <p className="text-xs text-gray-500 mb-2">
            CSS加入者一覧（Excel）をアップロードすると、加入者名で会員を照合し、各会員にCSS番号を設定します（携帯番号で補助照合）。
          </p>
          <input
            ref={cssFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleCssFile(f); }}
            className="block text-xs text-gray-600"
          />
          {cssResult && (
            <div className="mt-3 space-y-2">
              <Alert type="info">照合できた会員: <strong>{cssResult.updates.length}件</strong></Alert>
              {(cssResult.unmatched.length > 0 || cssResult.ambiguous.length > 0) && (
                <Alert type="error">
                  <div className="font-medium mb-1">手動対応が必要: 未照合 {cssResult.unmatched.length}件 / 候補複数 {cssResult.ambiguous.length}件</div>
                  <ul className="list-disc list-inside max-h-32 overflow-auto text-xs">
                    {[...cssResult.unmatched, ...cssResult.ambiguous].slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </Alert>
              )}
              <Button onClick={runCss} disabled={cssResult.updates.length === 0 || cssRunning}>
                {cssRunning ? '設定中…' : `${cssResult.updates.length}件にCSS番号を設定`}
              </Button>
            </div>
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
                const mem = members.find(m => m.id === r.memberId);
                const css = String(mem?.cssNumber ?? '');
                const cssCommunity = String(mem?.cssNumberCommunity ?? '');
                return (
                  <tr key={r.id}>
                    <Td className="font-mono text-xs">{r.memberNumber}</Td>
                    <Td className="text-sm">{r.memberName}{r.isRetry && <Badge color="yellow" className="ml-1">再請求</Badge>}</Td>
                    <Td className={`font-mono text-xs ${css ? '' : 'text-red-500'}`}>
                      {css || '未設定'}{cssCommunity && <span className="text-gray-500">／地域:{cssCommunity}</span>}
                    </Td>
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
