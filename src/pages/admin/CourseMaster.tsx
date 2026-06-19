import { useState, useEffect } from 'react';
import { PageContainer, Card, Button, Table, Th, Td, Badge, Modal, Field, Input, Select, Alert } from '../../components/UI';
import { PAYMENT_METHOD_LABELS, COURSE_CATEGORY_LABELS } from '../../utils/constants';
import { useCourses } from '../../components/CoursesContext';
import { saveCourses } from '../../api/data';
import type { Course, PaymentMethod, CourseCategory } from '../../types';

type EditState =
  | { mode: 'new' }
  | { mode: 'edit'; course: Course }
  | null;

const emptyForm = (): Partial<Course> => ({
  name: '', paymentMethod: 'monthly', category: 'classroom',
  feeInTown: 0, feeOutOfTown: 0, note: '', active: true,
});

export default function CourseMaster() {
  const { courses, reloadCourses } = useCourses();
  const [list, setList] = useState<Course[]>(courses);
  const [edit, setEdit] = useState<EditState>(null);
  const [form, setForm] = useState<Partial<Course>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // コンテキストの教室が読み込まれたらローカル一覧へ同期
  useEffect(() => { setList(courses); }, [courses]);

  const set = (key: keyof Course, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));

  const openNew = () => { setForm(emptyForm()); setEdit({ mode: 'new' }); };
  const openEdit = (c: Course) => { setForm({ ...c }); setEdit({ mode: 'edit', course: c }); };

  // 一覧を保存して再読込（追加・編集・有効切替で共通利用）
  const persist = async (next: Course[]) => {
    setSaving(true);
    try {
      await saveCourses(next);
      await reloadCourses();
      setMsg('教室マスタを保存しました');
    } catch (e) {
      setMsg(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.name || !form.name.trim()) { setMsg('教室名を入力してください'); return; }
    let next: Course[];
    if (edit?.mode === 'edit') {
      // 既存教室は名称・料金・備考・有効のみ変更（支払方式・カテゴリは保持）
      next = list.map(c => c.id === edit.course.id
        ? { ...c, name: form.name!.trim(), feeInTown: Number(form.feeInTown) || 0,
            feeOutOfTown: Number(form.feeOutOfTown) || 0, note: form.note || '', active: form.active !== false }
        : c);
    } else {
      const id = 'c_' + Date.now().toString(36);
      const created: Course = {
        id, name: form.name!.trim(),
        paymentMethod: (form.paymentMethod || 'monthly') as PaymentMethod,
        category: (form.category || 'classroom') as CourseCategory,
        feeInTown: Number(form.feeInTown) || 0, feeOutOfTown: Number(form.feeOutOfTown) || 0,
        note: form.note || '', active: true,
      };
      next = [...list, created];
    }
    setList(next);
    setEdit(null);
    await persist(next);
  };

  const toggleActive = async (c: Course) => {
    const next = list.map(x => x.id === c.id ? { ...x, active: !(x.active !== false) } : x);
    setList(next);
    await persist(next);
  };

  return (
    <PageContainer title="教室管理">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">{list.length}教室</p>
          <Button size="sm" onClick={openNew} disabled={saving}>＋ 新規教室を追加</Button>
        </div>

        {msg && <Alert type="success">{msg}</Alert>}

        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>教室名</Th>
                <Th>支払方式</Th>
                <Th className="hidden sm:table-cell">費目区分</Th>
                <Th className="text-right">町内</Th>
                <Th className="text-right">町外</Th>
                <Th>状態</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => (
                <tr key={c.id} className={c.active === false ? 'opacity-50' : ''}>
                  <Td className="font-medium">
                    {c.name}
                    {c.note && <span className="text-gray-400 text-xs ml-2">{c.note}</span>}
                  </Td>
                  <Td className="text-xs">{PAYMENT_METHOD_LABELS[c.paymentMethod]}</Td>
                  <Td className="text-xs hidden sm:table-cell">{COURSE_CATEGORY_LABELS[c.category]}</Td>
                  <Td className="text-right text-xs">{c.feeInTown ? c.feeInTown.toLocaleString() : '—'}</Td>
                  <Td className="text-right text-xs">{c.feeOutOfTown ? c.feeOutOfTown.toLocaleString() : '—'}</Td>
                  <Td>
                    {c.active === false
                      ? <Badge color="gray">無効</Badge>
                      : <Badge color="green">有効</Badge>}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)} disabled={saving}>編集</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(c)} disabled={saving}>
                        {c.active === false ? '有効化' : '無効化'}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><Td className="text-center text-gray-400 py-8" colSpan={7}>教室がありません</Td></tr>
              )}
            </tbody>
          </Table>
        </div>
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.mode === 'edit' ? '教室の編集' : '新規教室の追加'}>
        <div className="space-y-1">
          <Field label="教室名" required>
            <Input value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="例: ヨガ教室" />
          </Field>

          {edit?.mode === 'new' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="支払方式">
                <Select value={form.paymentMethod || 'monthly'} onChange={e => set('paymentMethod', e.target.value)}>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="費目区分">
                <Select value={form.category || 'classroom'} onChange={e => set('category', e.target.value)}>
                  {Object.entries(COURSE_CATEGORY_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm py-1">
              <div><span className="text-gray-500">支払方式：</span>{PAYMENT_METHOD_LABELS[form.paymentMethod as PaymentMethod] || '—'}</div>
              <div><span className="text-gray-500">費目区分：</span>{COURSE_CATEGORY_LABELS[form.category as CourseCategory] || '—'}</div>
            </div>
          )}
          {edit?.mode === 'edit' && (
            <p className="text-xs text-gray-400">※支払方式・費目区分は請求計算に影響するため変更できません。変更が必要な場合は新規教室として登録してください。</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="参加費（町内）">
              <Input type="number" value={form.feeInTown ?? 0} onChange={e => set('feeInTown', parseInt(e.target.value, 10) || 0)} />
            </Field>
            <Field label="参加費（町外）">
              <Input type="number" value={form.feeOutOfTown ?? 0} onChange={e => set('feeOutOfTown', parseInt(e.target.value, 10) || 0)} />
            </Field>
          </div>
          <Field label="備考">
            <Input value={form.note || ''} onChange={e => set('note', e.target.value)} placeholder="例: 毎月払い / 3期払い 等" />
          </Field>

          {edit?.mode === 'edit' && (
            <label className="flex items-center gap-2 text-sm py-1">
              <input type="checkbox" checked={form.active !== false} onChange={e => set('active', e.target.checked)} />
              有効（選択肢に表示する）
            </label>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSubmit} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
            <Button variant="secondary" onClick={() => setEdit(null)} disabled={saving}>キャンセル</Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
