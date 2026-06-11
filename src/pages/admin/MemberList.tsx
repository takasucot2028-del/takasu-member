import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer, Card, Input, Button, Table, Th, Td, Badge } from '../../components/UI';
import { MEMBER_TYPE_LABELS } from '../../utils/constants';
import { getAllMembers } from '../../api/data';
import type { Member } from '../../types';
import * as XLSX from 'xlsx';

export default function MemberList() {
  const [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState('');
  const [showWithdrawn, setShowWithdrawn] = useState(false);

  useEffect(() => { getAllMembers().then(setMembers); }, []);

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
        </div>

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
    </PageContainer>
  );
}
