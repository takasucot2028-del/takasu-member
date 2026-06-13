// ============================================
// 統一データアクセス層
// VITE_GAS_URL が設定されていれば GAS Web App、
// 未設定ならば localStorage（デモモード）に切り替える。
// 全関数は Promise を返す（非同期統一）。
// ページはこの層だけを参照し、バックエンドの差異を意識しない。
// ============================================
import type { Member, BillingRecord, GroupBilling, AuthResponse } from '../types';
import * as local from '../utils/store';
import * as gas from './client';

const USE_GAS = !!import.meta.env.VITE_GAS_URL;

// セッションのトークン（GAS の各APIに付与する）
function token(): string {
  return sessionStorage.getItem('tsc_token') || '';
}

// ApiResponse から data を取り出す。失敗時は fallback を返す。
function unwrap<T>(res: { success: boolean; data?: T; error?: string }, fallback: T): T {
  if (res.success && res.data !== undefined) return res.data;
  if (!res.success) console.error('API エラー:', res.error);
  return fallback;
}

// === 純粋計算（バックエンド非依存・同期のまま） ===
export const calcAnnualFee = local.calcAnnualFee;
export const calcInsurance = local.calcInsurance;

// === 初期化（デモモードのみ管理者を作成） ===
export function initAdmin(): void {
  if (!USE_GAS) local.initAdmin();
}

// === 認証 ===
export async function memberLogin(email: string, password: string): Promise<AuthResponse> {
  if (!USE_GAS) return local.memberLogin(email, password);
  // GAS の login は AuthResponse 形状をそのまま返す
  return (await gas.login(email, password)) as unknown as AuthResponse;
}

export async function adminLoginCheck(email: string, password: string): Promise<AuthResponse> {
  if (!USE_GAS) return local.adminLoginCheck(email, password);
  return (await gas.adminLogin(email, password)) as unknown as AuthResponse;
}

// === 会員 ===
export async function registerNewMember(
  data: Record<string, unknown> & { password?: string }
): Promise<Member> {
  if (!USE_GAS) return local.registerNewMember(data);
  const res = await gas.registerMember(data as never);
  if (!res.success || !res.data) throw new Error(res.error || '会員登録に失敗しました');
  return res.data;
}

// 既存会員の一括登録（移行用）。GAS では1リクエストで全件追記、デモでは順次登録。
// 登録できた件数を返す。
export async function bulkRegisterMembers(
  members: (Record<string, unknown> & { password: string })[]
): Promise<number> {
  if (!USE_GAS) {
    members.forEach(m => local.registerNewMember(m));
    return members.length;
  }
  const res = await gas.bulkRegister(members, token());
  if (!res.success) throw new Error(res.error || '一括登録に失敗しました');
  return res.data?.created ?? 0;
}

export async function getMemberById(id: string): Promise<Member | undefined> {
  if (!USE_GAS) return local.getMemberById(id);
  const res = await gas.getMember(id, token());
  return res.success ? res.data : undefined;
}

export async function updateMemberData(
  id: string,
  data: Partial<Member>
): Promise<Member | undefined> {
  if (!USE_GAS) return local.updateMemberData(id, data);
  const res = await gas.updateMember(id, data, token());
  if (!res.success) return undefined;
  // GAS の updateMember は本体を返さないため、更新後に取得して返す
  return getMemberById(id);
}

export async function getAllMembers(): Promise<Member[]> {
  if (!USE_GAS) return local.getAllMembers();
  return unwrap(await gas.getMembers(token()), []);
}

// 保険加入の一括設定（会員番号で照合）
export async function bulkUpdateInsurance(
  updates: { memberNumber: string; insuranceEnrolledAt: string }[]
): Promise<{ updated: number; notFound: string[] }> {
  if (!USE_GAS) return local.bulkUpdateInsuranceLocal(updates);
  const res = await gas.bulkUpdateInsurance(updates, token());
  if (!res.success) throw new Error(res.error || '保険の一括更新に失敗しました');
  return res.data ?? { updated: 0, notFound: [] };
}

export async function getMembersByCourse(courseId: string): Promise<Member[]> {
  if (!USE_GAS) return local.getMembersByCourseLocal(courseId);
  return unwrap(await gas.getMembersByCoourse(courseId, token()), []);
}

// === 月次請求 ===
export async function getBillingByMonth(yearMonth: string): Promise<BillingRecord[]> {
  if (!USE_GAS) return local.getBillingByMonth(yearMonth);
  return unwrap(await gas.getBillingRecords(yearMonth, token()), []);
}

export async function saveBillingRecords(records: BillingRecord[]): Promise<void> {
  if (!USE_GAS) { local.saveBillingRecords(records); return; }
  await gas.saveBillingRecords(records, token());
}

export async function replaceMonthlyBilling(
  yearMonth: string,
  records: BillingRecord[]
): Promise<void> {
  if (!USE_GAS) { local.replaceMonthlyBilling(yearMonth, records); return; }
  await gas.replaceMonthlyBilling(yearMonth, records, token());
}

export async function updateBillingStatus(billingId: string, status: string): Promise<void> {
  if (!USE_GAS) { local.updateBillingStatusLocal(billingId, status); return; }
  await gas.updateBillingStatus(billingId, status, token());
}

export async function getFailedBillings(): Promise<BillingRecord[]> {
  if (!USE_GAS) return local.getFailedBillings();
  return unwrap(await gas.getFailedBillings(token()), []);
}

// === 団体請求 ===
export async function getAllGroupBillings(): Promise<GroupBilling[]> {
  if (!USE_GAS) return local.getAllGroupBillings();
  return unwrap(await gas.getGroupBillings(token()), []);
}

export async function addGroupBilling(data: Omit<GroupBilling, 'id'>): Promise<GroupBilling> {
  if (!USE_GAS) return local.addGroupBillingLocal(data);
  const res = await gas.addGroupBilling(data, token());
  if (!res.success || !res.data) throw new Error(res.error || '団体請求の登録に失敗しました');
  return res.data;
}

export async function updateGroupBillingStatus(id: string, status: string): Promise<void> {
  if (!USE_GAS) { local.updateGroupBillingStatus(id, status); return; }
  await gas.updateGroupBillingStatus(id, status, token());
}
