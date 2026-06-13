import { useState, useEffect } from 'react';
import { PageContainer, Card, Button, Table, Th, Td, Badge, Modal, Field, Input, Select, Alert } from '../../components/UI';
import { BILLING_STATUS_LABELS } from '../../utils/constants';
import { getAllMembers, getAllGroupBillings, addGroupBilling, updateGroupBillingStatus } from '../../api/data';
import type { Member, GroupBilling } from '../../types';
import * as XLSX from 'xlsx';

export default function GroupBillingPage() {
  const [billings, setBillings] = useState<GroupBilling[]>([]);
  const [groups, setGroups] = useState<Member[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getAllGroupBillings().then(setBillings);
    getAllMembers().then(all =>
      setGroups(all.filter(m => m.memberType === 'group' && !m.isWithdrawn))
    );
  }, []);

  const reload = () => { getAllGroupBillings().then(setBillings); };

  const handleAdd = async () => {
    if (!selectedGroup || !itemName || !amount || !dueDate) return;
    const group = groups.find(g => g.id === selectedGroup);
    if (!group) return;

    await addGroupBilling({
      memberId: group.id,
      memberNumber: group.memberNumber,
      groupName: group.groupName || '',
      itemName,
      amount: parseInt(amount, 10),
      dueDate,
      status: 'pending',
    });

    setShowModal(false);
    setSelectedGroup('');
    setItemName('');
    setAmount('');
    setDueDate('');
    setMsg('団体請求を登録しました');
    reload();
  };

  const toggleStatus = async (id: string, status: string) => {
    await updateGroupBillingStatus(id, status);
    reload();
  };

  const exportExcel = () => {
    const rows = billings.map(b => ({
      '会員番号': b.memberNumber,
      '団体名': b.groupName,
      '請求項目': b.itemName,
      '金額': b.amount,
      '支払日': b.dueDate,
      'ステータス': BILLING_STATUS_LABELS[b.status],
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '団体請求');
    XLSX.writeFile(wb, `団体請求_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'completed': return 'green' as const;
      case 'failed': return 'red' as const;
      case 'billed': return 'blue' as const;
      default: return 'gray' as const;
    }
  };

  return (
    <PageContainer title="団体請求管理">
      <Card>
        <div className="flex gap-3 mb-4">
          <Button size="sm" onClick={() => setShowModal(true)}>新規登録</Button>
          <Button size="sm" variant="secondary" onClick={exportExcel}>Excel出力</Button>
        </div>

        {msg && <Alert type="success">{msg}</Alert>}

        <Table>
          <thead>
            <tr>
              <Th>団体名</Th>
              <Th>請求項目</Th>
              <Th className="text-right">金額</Th>
              <Th>支払日</Th>
              <Th>状態</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {billings.map(b => (
              <tr key={b.id}>
                <Td className="font-medium">{b.groupName}</Td>
                <Td>{b.itemName}</Td>
                <Td className="text-right">{b.amount.toLocaleString()}円</Td>
                <Td className="text-xs">{b.dueDate}</Td>
                <Td><Badge color={statusColor(b.status)}>{BILLING_STATUS_LABELS[b.status]}</Badge></Td>
                <Td>
                  <div className="flex gap-1">
                    {b.status === 'pending' && (
                      <Button size="sm" variant="ghost" onClick={() => toggleStatus(b.id, 'billed')}>請求済</Button>
                    )}
                    {b.status === 'billed' && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => toggleStatus(b.id, 'completed')}>完了</Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleStatus(b.id, 'failed')}>不能</Button>
                      </>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
            {billings.length === 0 && (
              <tr><Td className="text-center text-gray-400 py-8" colSpan={6}>団体請求がありません</Td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="団体請求の登録">
        <Field label="団体" required>
          <Select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
            <option value="">選択...</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.groupName}（{g.memberNumber}）</option>
            ))}
          </Select>
        </Field>
        <Field label="請求項目" required>
          <Input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="大会参加費、追加保険料 等" />
        </Field>
        <Field label="金額" required>
          <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10000" />
        </Field>
        <Field label="支払日" required>
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </Field>
        <div className="flex gap-3 mt-4">
          <Button onClick={handleAdd}>登録</Button>
          <Button variant="secondary" onClick={() => setShowModal(false)}>キャンセル</Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
