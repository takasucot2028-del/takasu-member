import { useState } from 'react';
import { PageContainer, Card, Select, Button, Table, Th, Td, Badge } from '../../components/UI';
import { MEMBER_TYPE_LABELS } from '../../utils/constants';
import { useCourses } from '../../components/CoursesContext';
import { calcFiscalAge } from '../../utils/age';
import { getMembersByCourse } from '../../api/data';
import type { Member } from '../../types';
import * as XLSX from 'xlsx';

export default function CourseRoster() {
  const { courses } = useCourses();
  const [courseId, setCourseId] = useState('');
  const [members, setMembers] = useState<Member[]>([]);

  const handleSelect = async (id: string) => {
    setCourseId(id);
    if (id) setMembers(await getMembersByCourse(id));
    else setMembers([]);
  };

  const course = courses.find(c => c.id === courseId);

  const exportExcel = () => {
    if (!course) return;
    const rows = members.map((m, i) => ({
      'No.': i + 1,
      '会員番号': m.memberNumber,
      '種別': MEMBER_TYPE_LABELS[m.memberType],
      '氏名': `${m.lastName} ${m.firstName}`,
      'フリガナ': `${m.lastNameKana} ${m.firstNameKana}`,
      '区分': m.areaType === 'in_town' ? '町内' : '町外',
      '年齢': calcFiscalAge(m.birthDate) ?? '',
      '電話': m.phone,
      'メール': m.email,
      ...(m.memberType === 'junior' ? {
        '通学先': m.school || '',
        '保護者': `${m.guardianLastName || ''} ${m.guardianFirstName || ''}`,
        '保護者電話': m.guardianPhone || '',
      } : {}),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, course.name);
    XLSX.writeFile(wb, `${course.name}_名簿_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <PageContainer title="教室別名簿">
      <Card>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Select value={courseId} onChange={e => handleSelect(e.target.value)} className="flex-1">
            <option value="">教室を選択...</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.active === false ? '（無効）' : ''}</option>
            ))}
          </Select>
          {courseId && <Button size="sm" variant="secondary" onClick={exportExcel}>Excel出力</Button>}
        </div>

        {course && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-medium text-gray-800">{course.name}</h2>
              <Badge color="blue">{members.length}名</Badge>
              <span className="text-xs text-gray-500">{course.note}</span>
            </div>

            <Table>
              <thead>
                <tr>
                  <Th>No.</Th>
                  <Th>会員番号</Th>
                  <Th>種別</Th>
                  <Th>氏名</Th>
                  <Th className="hidden sm:table-cell">区分</Th>
                  <Th className="hidden sm:table-cell">年齢</Th>
                  <Th className="hidden sm:table-cell">電話</Th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.id}>
                    <Td>{i + 1}</Td>
                    <Td className="font-mono text-xs">{m.memberNumber}</Td>
                    <Td><Badge>{MEMBER_TYPE_LABELS[m.memberType]}</Badge></Td>
                    <Td className="font-medium">{m.lastName} {m.firstName}</Td>
                    <Td className="hidden sm:table-cell">{m.areaType === 'in_town' ? '町内' : '町外'}</Td>
                    <Td className="hidden sm:table-cell text-xs">{calcFiscalAge(m.birthDate) !== null ? `${calcFiscalAge(m.birthDate)}歳` : '—'}</Td>
                    <Td className="hidden sm:table-cell text-xs">{m.phone}</Td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr><Td className="text-center text-gray-400 py-8" colSpan={7}>参加者がいません</Td></tr>
                )}
              </tbody>
            </Table>
          </>
        )}

        {!courseId && (
          <p className="text-gray-400 text-sm text-center py-8">教室を選択してください</p>
        )}
      </Card>
    </PageContainer>
  );
}
