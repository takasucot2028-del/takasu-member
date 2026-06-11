// 会員種別
export type MemberType = 'general' | 'junior' | 'group';

// 支払方式
export type PaymentMethod = 'monthly' | 'term3' | 'term1' | 'ticket';

// 請求ステータス
export type BillingStatus = 'pending' | 'billed' | 'completed' | 'failed';

// 町内外区分
export type AreaType = 'in_town' | 'out_of_town';

// 教室マスタ
export interface Course {
  id: string;
  name: string;
  paymentMethod: PaymentMethod;
  feeInTown: number;
  feeOutOfTown: number;
  note: string;
}

// 会員情報
export interface Member {
  id: string;
  memberNumber: string;
  memberType: MemberType;
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  birthDate: string;
  postalCode: string;
  address: string;
  areaType: AreaType;
  phone: string;
  email: string;
  courseIds: string[];
  isWithdrawn: boolean;
  registeredAt: string;
  // ジュニア会員
  school?: string;
  guardianLastName?: string;
  guardianFirstName?: string;
  guardianLastNameKana?: string;
  guardianFirstNameKana?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  // 団体会員
  groupName?: string;
  representativeName?: string;
  memberCount?: number;
}

// 会員登録フォーム
export interface MemberFormData extends Omit<Member, 'id' | 'memberNumber' | 'isWithdrawn' | 'registeredAt'> {
  password: string;
}

// 請求レコード
export interface BillingRecord {
  id: string;
  memberId: string;
  memberNumber: string;
  memberName: string;
  yearMonth: string;
  dueDate: string;
  annualFee: number;
  insuranceFee: number;
  courseFee: number;
  adjustmentFee: number;
  adjustmentNote: string;
  total: number;
  status: BillingStatus;
  isRetry: boolean;
}

// 団体請求
export interface GroupBilling {
  id: string;
  memberId: string;
  memberNumber: string;
  groupName: string;
  itemName: string;
  amount: number;
  dueDate: string;
  status: BillingStatus;
}

// ログインレスポンス
export interface AuthResponse {
  success: boolean;
  token?: string;
  member?: Member;
  role?: 'member' | 'admin';
  error?: string;
}

// API レスポンス共通
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
