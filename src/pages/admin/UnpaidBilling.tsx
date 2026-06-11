import { useState, useEffect } from 'react';
import { PageContainer, Card, Button, Table, Th, Td, Badge, Alert } from '../../components/UI';
import { getFailedBillings, updateBillingStatus, getAllGroupBillings, updateGroupBillingStatus } from '../../api/data';
import type { BillingRecord, GroupBilling } from '../../types';

export default function UnpaidBilling() {
  const [failedRecords, setFailedRecords] = useState<BillingRecord[]>([]);
  const [failedGroupRecords, setFailedGroupRecords] = useState<GroupBilling[]>([]);
  const [msg, setMsg] = useState('');

  const reload = () => {
    getFailedBillings().then(setFailedRecords);
    getAllGroupBillings().then(all => setFailedGroupRecords(all.filter(b => b.status === 'failed')));
  };

  useEffect(() => { reload(); }, []);

  const handleResolve = async (id: string) => {
    await updateBillingStatus(id, 'completed');
    setMsg('引落完了に変更しました');
    reload();
  };

  const handleGroupResolve = async (id: string) => {
    await updateGroupBillingStatus(id, 'completed');
    setMsg('引落完了に変更しました');
    reload();
  };

  const total = failedRecords.length + failedGroupRecords.length;

  return (
    <PageContainer title="引落不能管理">
      <div className="space-y-4">
        {msg && <Alert type="success">{msg}</Alert>}

        <Card>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-medium text-gray-800">引落不能一覧</h2>
            <Badge color={total > 0 ? 'red' : 'green'}>{total}件</Badge>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            引落不能フラグの付いた請求は、次月の請求データ生成時に自動的に繰り越されます。
            手動で「引落完了」に変更することも可能です。
          </p>

          {/* 個人請求の引落不能 */}
          {failedRecords.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-gray-700 mb-2">個人請求</h3>
              <Table>
                <thead>
                  <tr>
                    <Th>会員番号</Th>
                    <Th>氏名</Th>
                    <Th>対象月</Th>
                    <Th className="text-right">金額</Th>
                    <Th>引落日</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {failedRecords.map(r => (
                    <tr key={r.id} className="bg-red-50">
                      <Td className="font-mono text-xs">{r.memberNumber}</Td>
                      <Td className="font-medium">{r.memberName}</Td>
                      <Td className="text-xs">{r.yearMonth}</Td>
                      <Td className="text-right font-medium">{r.total.toLocaleString()}円</Td>
                      <Td className="text-xs">{r.dueDate}</Td>
                      <Td>
                        <Button size="sm" variant="ghost" onClick={() => handleResolve(r.id)}>
                          引落完了に変更
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}

          {/* 団体請求の引落不能 */}
          {failedGroupRecords.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-gray-700 mt-6 mb-2">団体請求</h3>
              <Table>
                <thead>
                  <tr>
                    <Th>団体名</Th>
                    <Th>請求項目</Th>
                    <Th className="text-right">金額</Th>
                    <Th>引落日</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {failedGroupRecords.map(b => (
                    <tr key={b.id} className="bg-red-50">
                      <Td className="font-medium">{b.groupName}</Td>
                      <Td>{b.itemName}</Td>
                      <Td className="text-right font-medium">{b.amount.toLocaleString()}円</Td>
                      <Td className="text-xs">{b.dueDate}</Td>
                      <Td>
                        <Button size="sm" variant="ghost" onClick={() => handleGroupResolve(b.id)}>
                          引落完了に変更
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}

          {total === 0 && (
            <div className="text-center py-8 text-gray-400">
              引落不能の請求はありません
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
