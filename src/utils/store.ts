import type { Member, BillingRecord, GroupBilling, AuthResponse, MemberType, AreaType } from '../types';
import { ANNUAL_FEES, INSURANCE_FEES } from './constants';

const STORAGE_KEY = 'tsc_members';
const BILLING_KEY = 'tsc_billing';
const GROUP_BILLING_KEY = 'tsc_group_billing';
const ADMIN_KEY = 'tsc_admin';

// --- ユーティリティ ---
function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function nextMemberNumber(members: Member[]): string {
  const max = members.reduce((m, mem) => {
    const n = parseInt(mem.memberNumber.replace('TSC-', ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `TSC-${String(max + 1).padStart(4, '0')}`;
}

// --- データアクセス ---
function loadMembers(): Member[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveMembers(members: Member[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
}

function loadBilling(): BillingRecord[] {
  try {
    return JSON.parse(localStorage.getItem(BILLING_KEY) || '[]');
  } catch { return []; }
}

function saveBilling(records: BillingRecord[]) {
  localStorage.setItem(BILLING_KEY, JSON.stringify(records));
}

function loadGroupBilling(): GroupBilling[] {
  try {
    return JSON.parse(localStorage.getItem(GROUP_BILLING_KEY) || '[]');
  } catch { return []; }
}

function saveGroupBilling(records: GroupBilling[]) {
  localStorage.setItem(GROUP_BILLING_KEY, JSON.stringify(records));
}

// --- 初期管理者 ---
export function initAdmin() {
  if (!localStorage.getItem(ADMIN_KEY)) {
    localStorage.setItem(ADMIN_KEY, JSON.stringify({
      email: 'admin@takasu-sc.jp',
      password: 'admin123',
    }));
  }
}

// --- 認証 ---
export function memberLogin(email: string, password: string): AuthResponse {
  // 同一メール＋パスワードに一致する全員（世帯）を返す。兄弟が同じメール・
  // パスワードを共有する場合、保護者は1回のログインで全員を管理できる。
  const all = loadMembers().filter(m => m.email === email && !m.isWithdrawn);
  const matched = all.filter(m =>
    JSON.parse(localStorage.getItem(`tsc_pw_${m.id}`) || '""') === password
  );
  if (matched.length === 0) {
    return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
  }
  return { success: true, token: matched[0].id, members: matched, member: matched[0], role: 'member' };
}

export function adminLoginCheck(email: string, password: string): AuthResponse {
  const admin = JSON.parse(localStorage.getItem(ADMIN_KEY) || '{}');
  if (admin.email === email && admin.password === password) {
    return { success: true, token: 'admin', role: 'admin' };
  }
  return { success: false, error: 'ログイン情報が正しくありません' };
}

// --- 会員CRUD ---
export function registerNewMember(data: Record<string, unknown> & { password?: string }): Member {
  const members = loadMembers();
  const member: Member = {
    ...(data as unknown as Member),
    id: genId(),
    memberNumber: nextMemberNumber(members),
    isWithdrawn: false,
    registeredAt: new Date().toISOString().slice(0, 10),
  };
  if (data.password) {
    localStorage.setItem(`tsc_pw_${member.id}`, JSON.stringify(data.password));
  }
  members.push(member);
  saveMembers(members);
  return member;
}

export function getAllMembers(): Member[] {
  return loadMembers();
}

export function getMemberById(id: string): Member | undefined {
  return loadMembers().find(m => m.id === id);
}

export function updateMemberData(id: string, data: Partial<Member>): Member | undefined {
  const members = loadMembers();
  const idx = members.findIndex(m => m.id === id);
  if (idx < 0) return undefined;
  members[idx] = { ...members[idx], ...data };
  saveMembers(members);
  return members[idx];
}

export function searchMembersLocal(query: string): Member[] {
  const q = query.toLowerCase();
  return loadMembers().filter(m =>
    m.memberNumber.toLowerCase().includes(q) ||
    `${m.lastName}${m.firstName}`.includes(q) ||
    `${m.lastNameKana}${m.firstNameKana}`.includes(q) ||
    (m.groupName && m.groupName.includes(q))
  );
}

export function getMembersByCourseLocal(courseId: string): Member[] {
  return loadMembers().filter(m => !m.isWithdrawn && m.courseIds.includes(courseId));
}

// --- 年会費計算 ---
export function calcAnnualFee(type: MemberType, area: AreaType): number {
  if (type === 'general') return ANNUAL_FEES.general;
  if (type === 'junior') return area === 'in_town' ? ANNUAL_FEES.junior_in : ANNUAL_FEES.junior_out;
  return ANNUAL_FEES.group;
}

// --- 保険料計算 ---
export function calcInsurance(type: MemberType, memberCount?: number): number {
  if (type === 'general') return INSURANCE_FEES.general;
  if (type === 'junior') return INSURANCE_FEES.junior;
  return (memberCount || 0) * INSURANCE_FEES.group_per_person;
}

// --- 請求管理 ---
export function getBillingByMonth(yearMonth: string): BillingRecord[] {
  return loadBilling().filter(r => r.yearMonth === yearMonth);
}

export function saveBillingRecords(records: BillingRecord[]) {
  const existing = loadBilling();
  const existingIds = new Set(existing.map(r => r.id));
  const newRecords = records.filter(r => !existingIds.has(r.id));
  const merged = [...existing.map(e => {
    const updated = records.find(r => r.id === e.id);
    return updated || e;
  }), ...newRecords];
  saveBilling(merged);
}

// 月次請求の再生成: 対象月の自動生成レコードを完全に置換する。
// 手動で登録した調整請求（id に `-adj-` を含む）は退会者の有無に関わらず保持する。
// これにより退会者の古いレコードが残存せず、手動調整も失われない。
export function replaceMonthlyBilling(yearMonth: string, records: BillingRecord[]) {
  const kept = loadBilling().filter(
    r => r.yearMonth !== yearMonth || r.id.includes('-adj-')
  );
  saveBilling([...kept, ...records]);
}

export function updateBillingStatusLocal(billingId: string, status: string) {
  const records = loadBilling();
  const idx = records.findIndex(r => r.id === billingId);
  if (idx >= 0) {
    records[idx].status = status as BillingRecord['status'];
    saveBilling(records);
  }
}

export function getFailedBillings(): BillingRecord[] {
  return loadBilling().filter(r => r.status === 'failed');
}

// --- 団体請求 ---
export function getAllGroupBillings(): GroupBilling[] {
  return loadGroupBilling();
}

export function addGroupBillingLocal(data: Omit<GroupBilling, 'id'>): GroupBilling {
  const records = loadGroupBilling();
  const record: GroupBilling = { ...data, id: genId() };
  records.push(record);
  saveGroupBilling(records);
  return record;
}

export function updateGroupBillingStatus(id: string, status: string) {
  const records = loadGroupBilling();
  const idx = records.findIndex(r => r.id === id);
  if (idx >= 0) {
    records[idx].status = status as GroupBilling['status'];
    saveGroupBilling(records);
  }
}
