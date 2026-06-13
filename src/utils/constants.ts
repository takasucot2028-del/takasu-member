import type { Course, CourseCategory } from '../types';

export const COURSES: Course[] = [
  { id: 'c01', name: 'スポーツやってみ隊', paymentMethod: 'term3', category: 'classroom', feeInTown: 5000, feeOutOfTown: 5000, note: '3期払い' },
  { id: 'c02', name: '運動遊び隊', paymentMethod: 'term3', category: 'classroom', feeInTown: 5000, feeOutOfTown: 5000, note: '3期払い' },
  { id: 'c03', name: '小学生水泳教室', paymentMethod: 'term1', category: 'consigned', feeInTown: 2000, feeOutOfTown: 2000, note: '1期払い' },
  { id: 'c04', name: '幼児水泳教室', paymentMethod: 'term1', category: 'consigned', feeInTown: 2000, feeOutOfTown: 2000, note: '1期払い' },
  { id: 'c05', name: 'ダンス教室', paymentMethod: 'term3', category: 'classroom', feeInTown: 6000, feeOutOfTown: 6000, note: '3期払い' },
  { id: 'c06', name: '英会話教室', paymentMethod: 'monthly', category: 'classroom', feeInTown: 5000, feeOutOfTown: 5000, note: '毎月払い' },
  { id: 'c18', name: '鷹栖REDWOLVES 男子U15', paymentMethod: 'monthly', category: 'community', feeInTown: 2000, feeOutOfTown: 4000, note: '毎月払い' },
  { id: 'c19', name: '鷹栖REDWOLVES 女子U15', paymentMethod: 'monthly', category: 'community', feeInTown: 2000, feeOutOfTown: 4000, note: '毎月払い' },
  { id: 'c20', name: '鷹栖REDWOLVES 男女U12', paymentMethod: 'none', category: 'community', feeInTown: 0, feeOutOfTown: 0, note: '徴収なし' },
  { id: 'c21', name: '鷹栖北野バドミントン少年団', paymentMethod: 'none', category: 'community', feeInTown: 0, feeOutOfTown: 0, note: '徴収なし' },
  { id: 'c08', name: '鷹栖バレーボールクラブ', paymentMethod: 'monthly', category: 'community', feeInTown: 2000, feeOutOfTown: 4000, note: '毎月払い' },
  { id: 'c09', name: '鷹栖ソフトテニスクラブ', paymentMethod: 'monthly', category: 'community', feeInTown: 2000, feeOutOfTown: 4000, note: '毎月払い' },
  { id: 'c10', name: '鷹栖剣道クラブ', paymentMethod: 'monthly', category: 'community', feeInTown: 2000, feeOutOfTown: 4000, note: '毎月払い' },
  { id: 'c11', name: 'NexusBC', paymentMethod: 'monthly', category: 'community', feeInTown: 7000, feeOutOfTown: 9000, note: '毎月払い' },
  { id: 'c12', name: 'TakasuXC', paymentMethod: 'monthly', category: 'community', feeInTown: 2000, feeOutOfTown: 4000, note: '毎月払い' },
  { id: 'c13', name: 'マルチスポーツクラブ', paymentMethod: 'monthly', category: 'community', feeInTown: 1000, feeOutOfTown: 2000, note: '毎月払い' },
  { id: 'c22', name: '鷹栖剣道少年団', paymentMethod: 'none', category: 'community', feeInTown: 0, feeOutOfTown: 0, note: '徴収なし' },
  { id: 'c23', name: '鷹栖北野クロスカントリースキー少年団', paymentMethod: 'none', category: 'community', feeInTown: 0, feeOutOfTown: 0, note: '徴収なし' },
  { id: 'c24', name: '鷹栖北野野球少年団', paymentMethod: 'none', category: 'community', feeInTown: 0, feeOutOfTown: 0, note: '徴収なし' },
  { id: 'c14', name: 'ヨガ教室', paymentMethod: 'ticket', category: 'classroom', feeInTown: 0, feeOutOfTown: 0, note: 'チケット制' },
  { id: 'c15', name: 'ストレッチ教室', paymentMethod: 'ticket', category: 'classroom', feeInTown: 0, feeOutOfTown: 0, note: 'チケット制' },
  { id: 'c16', name: 'たかスポレッチ', paymentMethod: 'ticket', category: 'classroom', feeInTown: 0, feeOutOfTown: 0, note: 'チケット制' },
  { id: 'c17', name: 'レッドコード教室', paymentMethod: 'term1', category: 'consigned', feeInTown: 3000, feeOutOfTown: 3000, note: '1期払い' },
];

// 教室カテゴリの表示ラベル（継続会費の費目）
export const COURSE_CATEGORY_LABELS: Record<CourseCategory, string> = {
  classroom: '教室',
  consigned: '教室（委託）',
  community: '教室（地域クラブ）',
};

export const MEMBER_TYPE_LABELS: Record<string, string> = {
  general: '一般会員',
  junior: 'ジュニア会員',
  group: '団体会員',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  monthly: '毎月払い',
  term3: '3期払い',
  term1: '1期払い',
  ticket: 'チケット制',
  none: '徴収なし',
};

export const BILLING_STATUS_LABELS: Record<string, string> = {
  pending: '未請求',
  billed: '請求済',
  completed: '引落完了',
  failed: '引落不能',
  carried: '繰越済',
};

// 請求スケジュールの初期値: 3期払いは第1〜3期=5/8/1月、1期払いは未設定（事務局が設定）。
// 毎月払い・チケット・徴収なしはスケジュール対象外。
export function defaultBillingSchedule(): Record<string, number[]> {
  const sched: Record<string, number[]> = {};
  COURSES.forEach(c => {
    if (c.paymentMethod === 'term3') sched[c.id] = [5, 8, 1];
    else if (c.paymentMethod === 'term1') sched[c.id] = [];
  });
  return sched;
}

// 年会費
export const ANNUAL_FEES = {
  general: 1000,
  junior_in: 0,
  junior_out: 500,
  group: 1000,
};

// 保険料
export const INSURANCE_FEES = {
  general: 0,
  junior: 800,
  group_per_person: 800,
};
