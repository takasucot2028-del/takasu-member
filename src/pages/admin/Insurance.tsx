import { useState, useEffect, useRef } from 'react';
import { PageContainer, Card, Input, Button, Table, Th, Td, Badge, Alert } from '../../components/UI';
import { MEMBER_TYPE_LABELS } from '../../utils/constants';
import { calcAgeAtDate } from '../../utils/age';
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

  // スポーツ安全保険ネット（スポあんネット）貼り付け用様式で出力する。
  // 個人加入様式（姓名・性別・年齢を1行ずつ記入）のため、団体会員は除外する。
  // 年齢は「加入日（補償開始日）時点の満年齢」、性別は全角「男/女」（未設定は空欄）。
  const exportExcel = () => {
    const indiv = newEnrollees.filter(m => m.memberType !== 'group');
    const genderLabel = (g?: string) => (g === 'male' ? '男' : g === 'female' ? '女' : '');
    const ymd = (s: string) => (s ? s.replace(/-/g, '/') : '');

    const NOTE1 = '【表作成時のご注意】\n①赤枠内に情報を入力してください。（翌月一括追加方式での追加の場合は青枠内の入力も必要です。）\n②加入区分ごとに表を作成してください。（加入区分を混在させるとエラーとなります。）\n③姓、名は漢字で入力してください。外国籍の方は「全角アルファベット」または読みを「全角カナ」で入力してください。（文字数に制限があります。）';
    const NOTE2 = '【作成した表のスポあんネットへの貼り付け方法】\n①赤枠内（翌月一括追加方式の追加の場合は青枠も含める。）の団体員が入力されている最終行までをコピーし、貼り付けてください。';
    const HEAD = [
      '',
      '姓（全角10文字）+スペース+名（全角10文字）\n※必ず姓名の間にスペース（全角でも半角でも可）を入力してください。',
      '性別\n（全角 男or女）',
      '年齢\n（半角数字）',
      '入会日\n（YYYY/MM/DD）\n※翌月一括追加方式での追加加入のみ',
    ];

    const aoa: (string | number)[][] = [
      [NOTE1, '', '', '', ''],
      [NOTE2, '', '', '', ''],
      ['', '', '', '', ''],
      HEAD,
      ['例', '山田　太郎', '男', 12, '2022/04/01'],
    ];
    indiv.forEach((m, i) => {
      const age = calcAgeAtDate(m.birthDate, m.insuranceEnrolledAt || '');
      aoa.push([
        i + 1,
        `${m.lastName} ${m.firstName}`.trim(),
        genderLabel(m.gender),
        age === null ? '' : age,
        ymd(m.insuranceEnrolledAt || ''),
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 6 }, { wch: 24 }, { wch: 8 }, { wch: 8 }, { wch: 14 }];
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
