// ============================================
// たかすスポーツクラブ 会員管理システム
// Google Apps Script バックエンド
// ============================================

// --- 設定 ---
const SPREADSHEET_ID = '★ここにスプレッドシートIDを入力★';

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    initSheet(sheet, name);
  }
  return sheet;
}

// --- シート初期化 ---
function initSheet(sheet, name) {
  const headers = {
    members: ['id','memberNumber','memberType','lastName','firstName','lastNameKana','firstNameKana',
              'birthDate','postalCode','address','areaType','phone','email','passwordHash',
              'courseIds','isWithdrawn','registeredAt',
              'school','guardianLastName','guardianFirstName','guardianLastNameKana','guardianFirstNameKana',
              'guardianPhone','guardianEmail',
              'groupName','representativeName','memberCount'],
    member_courses: ['memberId','courseId','enrolledAt'],
    courses: ['id','name','paymentMethod','feeInTown','feeOutOfTown','note'],
    billing: ['id','memberId','memberNumber','memberName','yearMonth','dueDate',
              'annualFee','insuranceFee','courseFee','adjustmentFee','adjustmentNote',
              'total','status','isRetry'],
    billing_group: ['id','memberId','memberNumber','groupName','itemName','amount','dueDate','status'],
    billing_adjustment: ['id','memberId','memberNumber','memberName','amount','note','dueDate','status'],
    auth_users: ['email','passwordHash','role'],
  };

  if (headers[name]) {
    sheet.getRange(1, 1, 1, headers[name].length).setValues([headers[name]]);
    sheet.setFrozenRows(1);
  }
}

// --- 初期セットアップ（1回だけ実行）---
function setupSpreadsheet() {
  const sheetNames = ['members','member_courses','courses','billing','billing_group','billing_adjustment','auth_users'];
  sheetNames.forEach(name => getSheet(name));
  
  // 管理者アカウント作成
  // パスワードはリポジトリに平文で残さないため Script Properties から読む。
  // GAS エディタの「プロジェクトの設定 > スクリプト プロパティ」で
  //   ADMIN_EMAIL / ADMIN_PASSWORD を設定してから setupSpreadsheet() を実行する。
  // 未設定の場合はデモ用 admin@takasu-sc.jp / admin123 で作成される（本番では必ず設定すること）。
  const authSheet = getSheet('auth_users');
  if (authSheet.getLastRow() <= 1) {
    const props = PropertiesService.getScriptProperties();
    const adminEmail = props.getProperty('ADMIN_EMAIL') || 'admin@takasu-sc.jp';
    const adminPassword = props.getProperty('ADMIN_PASSWORD') || 'admin123';
    authSheet.appendRow([adminEmail, hashPassword(adminPassword), 'admin']);
  }

  // 教室マスタ挿入
  const courseSheet = getSheet('courses');
  if (courseSheet.getLastRow() <= 1) {
    const courses = [
      ['c01','スポーツやってみ隊','term3',5000,5000,'3期払い'],
      ['c02','運動遊び隊','term3',5000,5000,'3期払い'],
      ['c03','小学生水泳教室','term1',2000,2000,'1期払い'],
      ['c04','幼児水泳教室','term1',2000,2000,'1期払い'],
      ['c05','ダンス教室','term3',6000,6000,'3期払い'],
      ['c06','英会話教室','monthly',5000,5000,'毎月払い'],
      ['c07','鷹栖REDWOLVES U-15','monthly',2000,4000,'毎月払い'],
      ['c08','鷹栖バレーボールクラブ','monthly',2000,4000,'毎月払い'],
      ['c09','鷹栖ソフトテニスクラブ','monthly',2000,4000,'毎月払い'],
      ['c10','鷹栖剣道クラブ','monthly',2000,4000,'毎月払い'],
      ['c11','NexusBC','monthly',7000,9000,'毎月払い'],
      ['c12','TakasuXC','monthly',2000,4000,'毎月払い'],
      ['c13','マルチスポーツクラブ','monthly',1000,2000,'毎月払い'],
      ['c14','ヨガ教室','ticket',0,0,'チケット制'],
      ['c15','ストレッチ教室','ticket',0,0,'チケット制'],
      ['c16','たかスポレッチ','ticket',0,0,'チケット制'],
      ['c17','レッドコード教室','term1',3000,3000,'1期払い'],
    ];
    courses.forEach(row => courseSheet.appendRow(row));
  }
  
  Logger.log('セットアップ完了');
}

// 管理者の認証情報を Script Properties (ADMIN_EMAIL / ADMIN_PASSWORD) から再設定する。
// パスワード変更時に GAS エディタから手動実行する。既存の admin 行があれば更新、なければ追加。
function resetAdminCredentials() {
  const props = PropertiesService.getScriptProperties();
  const adminEmail = props.getProperty('ADMIN_EMAIL');
  const adminPassword = props.getProperty('ADMIN_PASSWORD');
  if (!adminEmail || !adminPassword) {
    throw new Error('Script Properties に ADMIN_EMAIL と ADMIN_PASSWORD を設定してください');
  }
  const sheet = getSheet('auth_users');
  const data = sheet.getDataRange().getValues();
  const hash = hashPassword(adminPassword);
  for (let i = 1; i < data.length; i++) {
    if (data[i][2] === 'admin') {
      sheet.getRange(i + 1, 1, 1, 3).setValues([[adminEmail, hash, 'admin']]);
      Logger.log('管理者認証情報を更新しました');
      return;
    }
  }
  sheet.appendRow([adminEmail, hash, 'admin']);
  Logger.log('管理者アカウントを作成しました');
}

// --- パスワードハッシュ化 ---
function hashPassword(pw) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw);
  return raw.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

// --- セッション管理（CacheService・TTL 6時間）---
// Web App は匿名アクセス可で公開するため、アプリ独自のトークンで認可を行う。
// ログイン成功時に推測困難なトークンを発行し、role と memberId をキャッシュに保持する。
var SESSION_TTL_SECONDS = 21600; // 6時間（CacheService の最大）

function issueToken(role, memberId) {
  const token = genId() + genId(); // 24文字
  CacheService.getScriptCache().put(
    'sess_' + token,
    JSON.stringify({ role: role, memberId: memberId || '' }),
    SESSION_TTL_SECONDS
  );
  return token;
}

function getSession(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('sess_' + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (err) { return null; }
}

// 認可: 公開アクション以外はトークン必須。管理者専用／本人or管理者を区別する。
var PUBLIC_ACTIONS = { login: true, adminLogin: true, registerMember: true };
var SELF_OR_ADMIN_ACTIONS = { getMember: true, updateMember: true, withdrawMember: true };

function enforceAuth(action, body) {
  if (PUBLIC_ACTIONS[action]) return;
  const session = getSession(body.token);
  if (!session) throw new Error('認証が必要です。再度ログインしてください');
  if (SELF_OR_ADMIN_ACTIONS[action]) {
    if (session.role === 'admin') return;
    if (session.memberId && session.memberId === body.memberId) return;
    throw new Error('この操作を行う権限がありません');
  }
  // それ以外はすべて管理者専用
  if (session.role !== 'admin') throw new Error('管理者権限が必要です');
}

// --- Web App エンドポイント ---
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    enforceAuth(action, body); // 認可チェック（失敗時は throw）
    let result;

    switch (action) {
      case 'login':
        result = handleLogin(body.email, body.password);
        break;
      case 'adminLogin':
        result = handleAdminLogin(body.email, body.password);
        break;
      case 'registerMember':
        result = handleRegister(body.data);
        break;
      case 'getMember':
        result = handleGetMember(body.memberId);
        break;
      case 'updateMember':
        result = handleUpdateMember(body.memberId, body.data);
        break;
      case 'withdrawMember':
        result = handleWithdraw(body.memberId);
        break;
      case 'getMembers':
        result = handleGetMembers();
        break;
      case 'searchMembers':
        result = handleSearchMembers(body.query);
        break;
      case 'getMembersByCourse':
        result = handleGetMembersByCourse(body.courseId);
        break;
      case 'getBillingRecords':
        result = handleGetBilling(body.yearMonth);
        break;
      case 'updateBillingStatus':
        result = handleUpdateBillingStatus(body.billingId, body.status);
        break;
      case 'generateBilling':
        result = handleGenerateBilling(body.yearMonth);
        break;
      case 'saveBillingRecords':
        result = handleSaveBillingRecords(body.records);
        break;
      case 'replaceMonthlyBilling':
        result = handleReplaceMonthlyBilling(body.yearMonth, body.records);
        break;
      case 'getFailedBillings':
        result = handleGetFailedBillings();
        break;
      case 'getGroupBillings':
        result = handleGetGroupBillings();
        break;
      case 'addGroupBilling':
        result = handleAddGroupBilling(body.data);
        break;
      case 'updateGroupBillingStatus':
        result = handleUpdateGroupBillingStatus(body.id, body.status);
        break;
      case 'addAdjustment':
        result = handleAddAdjustment(body.memberId, body.amount, body.note, body.dueDate);
        break;
      default:
        result = { success: false, error: '不明なアクション: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false, error: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- ユーティリティ ---
function genId() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function findRowIndex(sheet, colIndex, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][colIndex] === value) return i + 1; // 1-indexed
  }
  return -1;
}

function nextMemberNumber(sheet) {
  const data = sheet.getDataRange().getValues();
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const num = parseInt(String(data[i][1]).replace('TSC-', ''), 10);
    if (!isNaN(num) && num > max) max = num;
  }
  return 'TSC-' + String(max + 1).padStart(4, '0');
}

// --- ハンドラー ---
function handleLogin(email, password) {
  const sheet = getSheet('members');
  const members = sheetToObjects(sheet);
  const member = members.find(m => m.email === email && !m.isWithdrawn);
  if (!member) return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
  
  const hash = hashPassword(password);
  if (member.passwordHash !== hash) {
    return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
  }
  
  const token = issueToken('member', member.id);
  member.courseIds = member.courseIds ? member.courseIds.split(',') : [];
  delete member.passwordHash;
  return { success: true, token: token, member: member, role: 'member' };
}

function handleAdminLogin(email, password) {
  const sheet = getSheet('auth_users');
  const users = sheetToObjects(sheet);
  const hash = hashPassword(password);
  const user = users.find(u => u.email === email && u.passwordHash === hash);
  if (!user) return { success: false, error: 'ログイン情報が正しくありません' };
  return { success: true, token: issueToken('admin', ''), role: 'admin' };
}

function handleRegister(data) {
  const sheet = getSheet('members');
  const id = genId();
  const memberNumber = nextMemberNumber(sheet);
  const hash = hashPassword(data.password);
  const courseIds = (data.courseIds || []).join(',');
  const now = new Date().toISOString().slice(0, 10);

  const row = [
    id, memberNumber, data.memberType,
    data.lastName, data.firstName, data.lastNameKana, data.firstNameKana,
    data.birthDate, data.postalCode || '', data.address, data.areaType,
    data.phone, data.email, hash, courseIds, false, now,
    data.school || '', data.guardianLastName || '', data.guardianFirstName || '',
    data.guardianLastNameKana || '', data.guardianFirstNameKana || '',
    data.guardianPhone || '', data.guardianEmail || '',
    data.groupName || '', data.representativeName || '', data.memberCount || 0,
  ];
  sheet.appendRow(row);

  return { success: true, data: { id, memberNumber, ...data, registeredAt: now } };
}

function handleGetMember(memberId) {
  const sheet = getSheet('members');
  const members = sheetToObjects(sheet);
  const member = members.find(m => m.id === memberId);
  if (!member) return { success: false, error: '会員が見つかりません' };
  member.courseIds = member.courseIds ? member.courseIds.split(',') : [];
  delete member.passwordHash;
  return { success: true, data: member };
}

function handleUpdateMember(memberId, data) {
  const sheet = getSheet('members');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowIndex = findRowIndex(sheet, 0, memberId);
  if (rowIndex < 0) return { success: false, error: '会員が見つかりません' };

  Object.keys(data).forEach(key => {
    const colIndex = headers.indexOf(key);
    if (colIndex >= 0) {
      let value = data[key];
      if (key === 'courseIds' && Array.isArray(value)) value = value.join(',');
      sheet.getRange(rowIndex, colIndex + 1).setValue(value);
    }
  });

  return { success: true };
}

function handleWithdraw(memberId) {
  const sheet = getSheet('members');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowIndex = findRowIndex(sheet, 0, memberId);
  if (rowIndex < 0) return { success: false, error: '会員が見つかりません' };
  const colIndex = headers.indexOf('isWithdrawn');
  sheet.getRange(rowIndex, colIndex + 1).setValue(true);
  return { success: true };
}

function handleGetMembers() {
  const sheet = getSheet('members');
  const members = sheetToObjects(sheet);
  members.forEach(m => {
    m.courseIds = m.courseIds ? m.courseIds.split(',') : [];
    delete m.passwordHash;
  });
  return { success: true, data: members };
}

function handleSearchMembers(query) {
  const sheet = getSheet('members');
  const members = sheetToObjects(sheet);
  const q = query.toLowerCase();
  const results = members.filter(m =>
    String(m.memberNumber).toLowerCase().includes(q) ||
    (m.lastName + m.firstName).includes(q) ||
    (m.lastNameKana + m.firstNameKana).includes(q) ||
    (m.groupName && m.groupName.includes(q))
  );
  results.forEach(m => {
    m.courseIds = m.courseIds ? m.courseIds.split(',') : [];
    delete m.passwordHash;
  });
  return { success: true, data: results };
}

function handleGetMembersByCourse(courseId) {
  const sheet = getSheet('members');
  const members = sheetToObjects(sheet);
  const results = members.filter(m => {
    const ids = m.courseIds ? m.courseIds.split(',') : [];
    return ids.includes(courseId) && !m.isWithdrawn;
  });
  results.forEach(m => {
    m.courseIds = m.courseIds.split(',');
    delete m.passwordHash;
  });
  return { success: true, data: results };
}

function handleGetBilling(yearMonth) {
  const sheet = getSheet('billing');
  const records = sheetToObjects(sheet).filter(r => r.yearMonth === yearMonth);
  return { success: true, data: records };
}

function handleUpdateBillingStatus(billingId, status) {
  const sheet = getSheet('billing');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowIndex = findRowIndex(sheet, 0, billingId);
  if (rowIndex < 0) return { success: false, error: '請求が見つかりません' };
  const colIndex = headers.indexOf('status');
  sheet.getRange(rowIndex, colIndex + 1).setValue(status);
  return { success: true };
}

function handleGenerateBilling(yearMonth) {
  // 請求生成ロジックはフロントエンドで実行し、
  // saveBillingRecords / replaceMonthlyBilling で保存する方式。
  return { success: true, data: [] };
}

// billing シートのヘッダー順に BillingRecord を行配列へ変換
const BILLING_COLUMNS = ['id','memberId','memberNumber','memberName','yearMonth','dueDate',
  'annualFee','insuranceFee','courseFee','adjustmentFee','adjustmentNote','total','status','isRetry'];

function billingRecordToRow(r) {
  return BILLING_COLUMNS.map(c => (r[c] !== undefined && r[c] !== null) ? r[c] : '');
}

// 請求レコードを保存（id一致は更新、新規は追加）
function handleSaveBillingRecords(records) {
  const sheet = getSheet('billing');
  const data = sheet.getDataRange().getValues();
  const idToRow = {}; // id -> シート行番号(1-indexed)
  for (let i = 1; i < data.length; i++) idToRow[data[i][0]] = i + 1;

  (records || []).forEach(r => {
    const row = billingRecordToRow(r);
    if (idToRow[r.id]) {
      sheet.getRange(idToRow[r.id], 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
  });
  return { success: true };
}

// 対象月の自動生成レコードを置換（id に `-adj-` を含む手動調整は保持）
function handleReplaceMonthlyBilling(yearMonth, records) {
  const sheet = getSheet('billing');
  const data = sheet.getDataRange().getValues();
  const idCol = 0;
  const ymCol = BILLING_COLUMNS.indexOf('yearMonth');

  // 削除対象の行番号を収集（対象月かつ手動調整でないもの）
  const rowsToDelete = [];
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][idCol]);
    const ym = String(data[i][ymCol]);
    if (ym === yearMonth && id.indexOf('-adj-') === -1) rowsToDelete.push(i + 1);
  }
  // 下から削除して行番号のずれを防ぐ
  rowsToDelete.sort((a, b) => b - a).forEach(rowNum => sheet.deleteRow(rowNum));

  // 新しい自動生成レコードを追加
  (records || []).forEach(r => sheet.appendRow(billingRecordToRow(r)));
  return { success: true };
}

// 引落不能（status=failed）の請求を全月から取得
function handleGetFailedBillings() {
  const sheet = getSheet('billing');
  const records = sheetToObjects(sheet).filter(r => r.status === 'failed');
  return { success: true, data: records };
}

function handleUpdateGroupBillingStatus(id, status) {
  const sheet = getSheet('billing_group');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowIndex = findRowIndex(sheet, 0, id);
  if (rowIndex < 0) return { success: false, error: '団体請求が見つかりません' };
  const colIndex = headers.indexOf('status');
  sheet.getRange(rowIndex, colIndex + 1).setValue(status);
  return { success: true };
}

function handleGetGroupBillings() {
  const sheet = getSheet('billing_group');
  return { success: true, data: sheetToObjects(sheet) };
}

function handleAddGroupBilling(data) {
  const sheet = getSheet('billing_group');
  const id = genId();
  sheet.appendRow([
    id, data.memberId, data.memberNumber, data.groupName,
    data.itemName, data.amount, data.dueDate, data.status || 'pending'
  ]);
  return { success: true, data: { id, ...data } };
}

function handleAddAdjustment(memberId, amount, note, dueDate) {
  const sheet = getSheet('billing_adjustment');
  const id = genId();
  // 会員名を取得
  const memberSheet = getSheet('members');
  const members = sheetToObjects(memberSheet);
  const member = members.find(m => m.id === memberId);
  const name = member ? (member.lastName + ' ' + member.firstName) : '';
  const memberNumber = member ? member.memberNumber : '';

  sheet.appendRow([id, memberId, memberNumber, name, amount, note, dueDate, 'pending']);
  return { success: true };
}
