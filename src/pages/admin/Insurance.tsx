import { useState, useEffect, useRef } from 'react';
import { PageContainer, Card, Input, Button, Table, Th, Td, Badge, Alert } from '../../components/UI';
import { MEMBER_TYPE_LABELS } from '../../utils/constants';
import { getAllMembers, calcInsurance, bulkUpdateInsurance } from '../../api/data';
import {
  downloadInsuranceTemplate, parseInsuranceWorkbook, type InsuranceUpdate,
} from '../../utils/memberImport';
import type { Member } from '../../types';
import * as XLSX from 'xlsx';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Insurance() {
  const [members, setMembers] = useState<Member[]>([]);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());

  // 一括インポート
  const fileRef = useRef<HTMLInputElement>(null);
  const [updates, setUpdates] = useState<InsuranceUpdate[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => getAllMembers().then(setMembers);
  useEffect(() => { load(); }, []);

  // 指定月に新規加入した会員（保険対象は一般会員以外）。翌月に保険料を請求する。
  const newEnrollees = members.filter(m =>
    !m.isWithdrawn &&
    m.memberType !== 'general' &&
    m.insuranceEnrolled &&
    (m.insuranceEnrolledAt || '').slice(0, 7) === yearMonth
  );

  const nextMonthLabel = (() => {
    const [y, mo] = yearMonth.split('-').map(n => parseInt(n, 10));
    const d = new Date(y, mo, 1); // mo は0始まり換算で「翌月」
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  })();

  const exportExcel = () => {
    const rows = newEnrollees.map(m => ({
      '会員番号': m.memberNumber,
      '氏名': m.memberType === 'group' ? m.groupName : `${m.lastName} ${m.firstName}`,
      '種別': MEMBER_TYPE_LABELS[m.memberType],
      '区分': m.areaType === 'in_town' ? '町内' : '町外',
      '保険加入日': m.insuranceEnrolledAt || '',
      '保険料': calcInsurance(m.memberType, m.memberCount),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '新規保険加入者');
    XLSX.writeFile(wb, `新規保険加入者_${yearMonth}.xlsx`);
  };

  const handleFile = async (file: File) => {
    setMsg('');
    const buffer = await file.arrayBuffer();
    const { updates: us, errors } = parseInsuranceWorkbook(buffer);
    setUpdates(us);
    setParseErrors(errors);
  };

  const runImport = async () => {
    setImporting(true);
    let resultMsg = '';
    try {
      const res = await bulkUpdateInsurance(updates);
      resultMsg = `${res.updated}件の保険加入を設定しました`
        + (res.notFound.length ? `（会員番号が見つからず未処理: ${res.notFound.length}件）` : '');
    } catch (e) {
      resultMsg = `更新に失敗しました: ${e instanceof Error ? e.message : String(e)}`;
    }
    setImporting(false);
    setUpdates([]);
    setParseErrors([]);
    if (fileRef.current) fileRef.current.value = '';
    setMsg(resultMsg);
    await load();
  };

  const totalFee = newEnrollees.reduce((s, m) => s + calcInsurance(m.memberType, m.memberCount), 0);

  return (
    <PageContainer title="保険管理">
      <div className="space-y-4">
        {msg && <Alert type="success">{msg}</Alert>}

        {/* 新規保険加入者一覧 */}
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
            <h2 className="font-medium text-gray-800">新規保険加入者</h2>
            <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="w-44" />
            <Badge color="blue">{newEnrollees.length}名</Badge>
            <span className="text-xs text-gray-500">合計保険料: {totalFee.toLocaleString()}円</span>
            {newEnrollees.length > 0 && (
              <Button size="sm" variant="secondary" onClick={exportExcel} className="sm:ml-auto">Excel出力</Button>
            )}
          </div>
          <Alert type="info">
            {yearMonth} に加入した会員です。<strong>{nextMonthLabel}の請求</strong>に保険料を計上してください。
          </Alert>

          <Table>
            <thead>
              <tr>
                <Th>会員番号</Th>
                <Th>氏名</Th>
                <Th>種別</Th>
                <Th>加入日</Th>
                <Th className="text-right">保険料</Th>
              </tr>
            </thead>
            <tbody>
              {newEnrollees.map(m => (
                <tr key={m.id}>
                  <Td className="font-mono text-xs">{m.memberNumber}</Td>
                  <Td className="font-medium">{m.memberType === 'group' ? m.groupName : `${m.lastName} ${m.firstName}`}</Td>
                  <Td><Badge>{MEMBER_TYPE_LABELS[m.memberType]}</Badge></Td>
                  <Td className="text-xs">{m.insuranceEnrolledAt}</Td>
                  <Td className="text-right">{calcInsurance(m.memberType, m.memberCount).toLocaleString()}円</Td>
                </tr>
              ))}
              {newEnrollees.length === 0 && (
                <tr><Td className="text-center text-gray-400 py-8" colSpan={5}>この月の新規保険加入者はいません</Td></tr>
              )}
            </tbody>
          </Table>
        </Card>

        {/* 保険一括インポート */}
        <Card>
          <h2 className="font-medium text-gray-800 mb-2">保険加入の一括インポート</h2>
          <p className="text-sm text-gray-600 mb-3">
            会員番号と保険加入日のExcel/CSVをアップロードすると、該当会員の保険加入をONにし加入日を設定します。
          </p>
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            <Button size="sm" variant="secondary" onClick={downloadInsuranceTemplate}>テンプレート出力</Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="block text-xs text-gray-600"
            />
          </div>

          {parseErrors.length > 0 && (
            <Alert type="error">
              <div className="font-medium mb-1">{parseErrors.length}件のエラー（該当行はスキップされます）</div>
              <ul className="list-disc list-inside max-h-32 overflow-auto">
                {parseErrors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </Alert>
          )}
          {updates.length > 0 && (
            <div className="mt-3">
              <Alert type="info">対象: <strong>{updates.length}件</strong></Alert>
              <Button onClick={runImport} disabled={importing} className="mt-2">
                {importing ? '更新中…' : `${updates.length}件を保険加入に設定`}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
