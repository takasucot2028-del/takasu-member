import type {
  Member,
  MemberFormData,
  AuthResponse,
  ApiResponse,
  BillingRecord,
  GroupBilling,
} from '../types';

// GAS Web App URL（デプロイ後に設定）
const API_BASE = import.meta.env.VITE_GAS_URL || '';

async function request<T>(action: string, payload?: Record<string, unknown>): Promise<ApiResponse<T>> {
  if (!API_BASE) {
    console.warn('GAS URLが未設定です。デモモードで動作します。');
    return { success: false, error: 'API未設定' };
  }
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action, ...payload }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// === 認証 ===
export const login = (email: string, password: string) =>
  request<AuthResponse>('login', { email, password });

export const adminLogin = (email: string, password: string) =>
  request<AuthResponse>('adminLogin', { email, password });

// === 会員 ===
export const registerMember = (data: MemberFormData) =>
  request<Member>('registerMember', { data });

// 既存会員の一括登録（移行用・管理者専用）
export const bulkRegister = (members: Record<string, unknown>[], token: string) =>
  request<{ created: number; members: { id: string; memberNumber: string }[] }>('bulkRegister', { members, token });

// 保険加入の一括設定（会員番号で照合・管理者専用）
export const bulkUpdateInsurance = (
  updates: { memberNumber: string; insuranceEnrolledAt: string }[],
  token: string
) => request<{ updated: number; notFound: string[] }>('bulkUpdateInsurance', { updates, token });

export const getMember = (memberId: string, token: string) =>
  request<Member>('getMember', { memberId, token });

export const updateMember = (memberId: string, data: Partial<Member>, token: string) =>
  request<Member>('updateMember', { memberId, data, token });

export const withdrawMember = (memberId: string, token: string) =>
  request<void>('withdrawMember', { memberId, token });

// === 事務局：会員管理 ===
export const getMembers = (token: string) =>
  request<Member[]>('getMembers', { token });

export const searchMembers = (query: string, token: string) =>
  request<Member[]>('searchMembers', { query, token });

export const getMembersByCoourse = (courseId: string, token: string) =>
  request<Member[]>('getMembersByCourse', { courseId, token });

// === 事務局：請求管理 ===
export const getBillingRecords = (yearMonth: string, token: string) =>
  request<BillingRecord[]>('getBillingRecords', { yearMonth, token });

export const updateBillingStatus = (billingId: string, status: string, token: string) =>
  request<void>('updateBillingStatus', { billingId, status, token });

export const generateBilling = (yearMonth: string, token: string) =>
  request<BillingRecord[]>('generateBilling', { yearMonth, token });

// フロントエンドで生成した請求レコードを保存（id一致は更新、新規は追加）
export const saveBillingRecords = (records: BillingRecord[], token: string) =>
  request<void>('saveBillingRecords', { records, token });

// 対象月の自動生成レコードを置換（手動調整 `-adj-` は保持）
export const replaceMonthlyBilling = (yearMonth: string, records: BillingRecord[], token: string) =>
  request<void>('replaceMonthlyBilling', { yearMonth, records, token });

// 引落不能（status=failed）の請求を全月から取得
export const getFailedBillings = (token: string) =>
  request<BillingRecord[]>('getFailedBillings', { token });

// === 事務局：団体請求 ===
export const getGroupBillings = (token: string) =>
  request<GroupBilling[]>('getGroupBillings', { token });

export const addGroupBilling = (data: Omit<GroupBilling, 'id'>, token: string) =>
  request<GroupBilling>('addGroupBilling', { data, token });

export const updateGroupBillingStatus = (id: string, status: string, token: string) =>
  request<void>('updateGroupBillingStatus', { id, status, token });

// === 事務局：調整請求 ===
export const addAdjustment = (
  memberId: string,
  amount: number,
  note: string,
  dueDate: string,
  token: string
) => request<void>('addAdjustment', { memberId, amount, note, dueDate, token });
