import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer, Card, Input, Button, Table, Th, Td, Badge, Modal, Field, Alert } from '../../components/UI';
import { MEMBER_TYPE_LABELS } from '../../utils/constants';
import { getAllMembers, bulkRegisterMembers, runYearUpdate } from '../../api/data';
import { downloadTemplate, parseWorkbook, DEFAULT_IMPORT_PASSWORD, type ImportMember } from '../../utils/memberImport';
import type { Member } from '../../types';
import * as XLSX from 'xlsx';

export default function MemberList() {
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState('');
  const [showWithdrawn, setShowWithdrawn] = useState(false);

  // 一括インポート
  const fileRef = useRef<HTMLInputElement>(null);
  const [importModal, setImportModal] = useState(false);
  const [parsed, setParsed] = useState<ImportMember[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  // 年度更新
  const [yearModal, setYearModal] = useState(false);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [yearRunning, setYearRunning] = useState(false);

  const loadMembers = () => getAllMembers().then(setMembers);
  useEffect(() => { loadMembers(); }, []);

  const handleFile = async (file: File) => {
    setImportMsg('');
    const buffer = await file.arrayBuffer();
    const { members: ms, errors } = parseWorkbook(buffer);

    // 兄弟は保護者の同じメールを共有しうるため、重複判定はメールだけでなく
    // 氏名・生年月日も含めた複合キーで行う。これにより
    // ・兄弟（同メール・別氏名/生年月日）は別人として登録される
    // ・同一人物の二重アップロードはスキップされる
    const keyOf = (m: Member | ImportMember) =>
      [m.email, m.lastName, m.firstName, m.groupName, m.birthDate]
        .map(v => String(v ?? '').trim().toLowerCase())
        .join('|');
    const existing = await getAllMembers();
    const existingKeys = new Set(existing.map(keyOf));
    const seen = new Set<string>();
    const toRegister: ImportMember[] = [];
    const skips: string[] = [];
    ms.forEach(m => {
      const key = keyOf(m);
      const name = `${m.lastName || m.groupName || ''} ${m.firstName || ''}`.trim();
      if (existingKeys.has(key)) {
        skips.push(`${name}（${m.email}）: 既存会員と重複（氏名・生年月日が一致）`);
      } else if (seen.has(key)) {
        skips.push(`${name}（${m.email}）: ファイル内で重複`);
      } else {
        seen.add(key);
        toRegister.push(m);
      }
    });

    setParsed(toRegister);
    setSkipped(skips);
    setParseErrors(errors);
  };

  const runImport = async () => {
    setImporting(true);
    let ok = 0;
    let errMsg = '';
    try {
      ok = await bulkRegisterMembers(parsed);
    } catch (e) {
      errMsg = e instanceof Error ? e.message : String(e);
    }
    setImporting(false);
    setImportModal(false);
    setParsed([]);
    setParseErrors([]);
    setSkipped([]);
    if (fileRef.current) fileRef.current.value = '';
    setImportMsg(errMsg ? `登録に失敗しました: ${errMsg}` : `${ok}件を登録しました`);
    await loadMembers();
  };

  const withdrawCount = members.filter(m => !m.isWithdrawn && m.nextYearStatus === 'withdraw').length;
  const activeCount = members.filter(m => !m.isWithdrawn).length;

  const runYear = async () => {
    setYearRunning(true);
    let resultMsg = '';
    try {
      const res = await runYearUpdate(fiscalYear);
      resultMsg = `年度更新を実行しました（新年度 ${fiscalYear}）：退会 ${res.withdrawn}件 ／ 継続 ${res.continued}件`;
    } catch (e) {
      resultMsg = `年度更新に失敗しました: ${e instanceof Error ? e.message : String(e)}`;
    }
    setYearRunning(false);
    setYearModal(false);
    setImportMsg(resultMsg);
    await loadMembers();
  };

  const q = query.toLowerCase();
  const filtered = members
    .filter(m =>
      !q ||
      m.memberNumber.toLowerCase().includes(q) ||
      `${m.lastName}${m.firstName}`.includes(query) ||
      `${m.lastNameKana}${m.firstNameKana}`.includes(query) ||
      (m.groupName ? m.groupName.includes(query) : false)
    )
    .filter(m => showWithdrawn || !m.isWithdrawn);

  const exportExcel = () => {
    const rows = filtered.map(m => ({
      '会員番号': m.memberNumber,
      '種別': MEMBER_TYPE_LABELS[m.memberType],
      '氏名': `${m.lastName} ${m.firstName}`,
      'フリガナ': `${m.lastNameKana} ${m.firstNameKana}`,
      '区分': m.areaType === 'in_town' ? '町内' : '町外',
      '電話': m.phone,
      'メール': m.email,
      '状態': m.isWithdrawn ? '退会' : '在籍',
      '登録日': m.registeredAt,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '会員名簿');
    XLSX.writeFile(wb, `会員名簿_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <PageContainer title="会員一覧">
      <Card>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Input
            placeholder="氏名・会員番号で検索..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1"
          />
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={showWithdrawn} onChange={e => setShowWithdrawn(e.target.checked)} />
            退会者を表示
          </label>
          <Button size="sm" variant="secondary" onClick={exportExcel}>Excel出力</Button>
          <Button size="sm" variant="secondary" onClick={() => { setImportModal(true); setImportMsg(''); setParsed([]); setParseErrors([]); setSkipped([]); }}>一括インポート</Button>
          <Button size="sm" variant="secondary" onClick={() => { setYearModal(true); setImportMsg(''); }}>年度更新</Button>
        </div>

        {importMsg && <Alert type="success">{importMsg}</Alert>}

        <p className="text-xs text-gray-500 mb-2">{filtered.length}件</p>

        <Table>
          <thead>
            <tr>
              <Th>会員番号</Th>
              <Th>種別</Th>
              <Th>氏名</Th>
              <Th className="hidden sm:table-cell">区分</Th>
              <Th className="hidden sm:table-cell">電話</Th>
              <Th>状態</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id} className={m.isWithdrawn ? 'opacity-50' : ''}>
                <Td className="font-mono text-xs">{m.memberNumber}</Td>
                <Td><Badge>{MEMBER_TYPE_LABELS[m.memberType]}</Badge></Td>
                <Td className="font-medium">
                  {m.memberType === 'group' ? m.groupName : `${m.lastName} ${m.firstName}`}
                </Td>
                <Td className="hidden sm:table-cell">{m.areaType === 'in_town' ? '町内' : '町外'}</Td>
                <Td className="hidden sm:table-cell text-xs">{m.phone}</Td>
                <Td>
                  {m.isWithdrawn
                    ? <Badge color="red">退会</Badge>
                    : <Badge color="green">在籍</Badge>
                  }
                </Td>
                <Td>
                  <Link to={`/admin/member/${m.id}`}>
                    <Button size="sm" variant="ghost">詳細</Button>
                  </Link>
                </Td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><Td className="text-center text-gray-400 py-8" colSpan={7}>会員データがありません</Td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal open={importModal} onClose={() => setImportModal(false)} title="会員の一括インポート">
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">
            テンプレートに既存会員データを記入し、Excel/CSVをアップロードしてください。
            パスワード未記入の会員は電話番号（数字）、それも無ければ
            <code className="bg-gray-100 px-1 rounded">{DEFAULT_IMPORT_PASSWORD}</code>
            が暫定パスワードになります（各自で変更を推奨）。
          </p>

          <Button size="sm" variant="secondary" onClick={downloadTemplate}>テンプレート出力</Button>

          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="block w-full text-xs text-gray-600"
            />
          </div>

          {parseErrors.length > 0 && (
            <Alert type="error">
              <div className="font-medium mb-1">{parseErrors.length}件のエラー（該当行はスキップされます）</div>
              <ul className="list-disc list-inside max-h-32 overflow-auto">
                {parseErrors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                {parseErrors.length > 20 && <li>…ほか {parseErrors.length - 20} 件</li>}
              </ul>
            </Alert>
          )}

          {skipped.length > 0 && (
            <Alert type="info">
              <div className="font-medium mb-1">{skipped.length}件をスキップ（メール重複・二重登録防止）</div>
              <ul className="list-disc list-inside max-h-32 overflow-auto">
                {skipped.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                {skipped.length > 20 && <li>…ほか {skipped.length - 20} 件</li>}
              </ul>
            </Alert>
          )}

          {parsed.length > 0 && (
            <Alert type="info">登録可能: <strong>{parsed.length}件</strong></Alert>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={runImport} disabled={parsed.length === 0 || importing}>
              {importing ? '登録中…' : `${parsed.length}件を登録`}
            </Button>
            <Button variant="secondary" onClick={() => setImportModal(false)} disabled={importing}>キャンセル</Button>
          </div>
        </div>
      </Modal>

      <Modal open={yearModal} onClose={() => setYearModal(false)} title="年度更新（一括繰越）">
        <div className="space-y-3 text-sm">
          <Field label="新年度（西暦）">
            <Input type="number" value={fiscalYear} onChange={e => setFiscalYear(parseInt(e.target.value, 10) || fiscalYear)} className="w-32" />
          </Field>
          <Alert type="info">
            実行すると次の処理を行います（在籍 {activeCount}名）:
            <ul className="list-disc list-inside mt-1">
              <li><strong>退会希望 {withdrawCount}名</strong> を退会処理します</li>
              <li>継続・未回答の会員は在籍維持。保険加入者の加入日を <strong>{fiscalYear}-04-01</strong> に更新</li>
              <li>全員の翌年度意思をリセット</li>
            </ul>
          </Alert>
          <p className="text-xs text-red-500">※退会処理を含みます。実行前に退会希望者の人数を確認してください。</p>
          <div className="flex gap-3 pt-1">
            <Button variant="danger" onClick={runYear} disabled={yearRunning}>
              {yearRunning ? '処理中…' : '年度更新を実行'}
            </Button>
            <Button variant="secondary" onClick={() => setYearModal(false)} disabled={yearRunning}>キャンセル</Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
