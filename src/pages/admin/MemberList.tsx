import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer, Card, Input, Button, Table, Th, Td, Badge, Modal, Alert } from '../../components/UI';
import { MEMBER_TYPE_LABELS } from '../../utils/constants';
import { getAllMembers, registerNewMember } from '../../api/data';
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

  const loadMembers = () => getAllMembers().then(setMembers);
  useEffect(() => { loadMembers(); }, []);

  const handleFile = async (file: File) => {
    setImportMsg('');
    const buffer = await file.arrayBuffer();
    const { members: ms, errors } = parseWorkbook(buffer);

    // メールアドレスで重複を除外（既存会員との重複・ファイル内の重複）。
    // これにより同じファイルを2回アップロードしても二重登録されない。
    const existing = await getAllMembers();
    const existingEmails = new Set(existing.map(m => String(m.email || '').toLowerCase()));
    const seen = new Set<string>();
    const toRegister: ImportMember[] = [];
    const skips: string[] = [];
    ms.forEach(m => {
      const email = String(m.email || '').toLowerCase();
      const name = `${m.lastName || m.groupName || ''} ${m.firstName || ''}`.trim();
      if (existingEmails.has(email)) {
        skips.push(`${name}（${m.email}）: 既存会員と重複`);
      } else if (seen.has(email)) {
        skips.push(`${name}（${m.email}）: ファイル内で重複`);
      } else {
        seen.add(email);
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
    const failed: string[] = [];
    for (const m of parsed) {
      try {
        await registerNewMember(m);
        ok++;
      } catch (e) {
        failed.push(`${m.lastName || m.groupName} ${m.firstName || ''}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setImporting(false);
    setImportModal(false);
    setParsed([]);
    setParseErrors([]);
    setSkipped([]);
    if (fileRef.current) fileRef.current.value = '';
    setImportMsg(`${ok}件を登録しました${failed.length ? `（失敗 ${failed.length}件）` : ''}`);
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
    </PageContainer>
  );
}
