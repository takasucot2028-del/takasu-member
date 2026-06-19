// ============================================
// たかすスポーツクラブ 会員管理システム
// Google Apps Script バックエンド
// ============================================

// --- 設定 ---
// スプレッドシートID は GAS の「プロジェクトの設定 → スクリプト プロパティ」で
// SPREADSHEET_ID として設定する（公開リポジトリにIDを残さないため）。
function getSpreadsheetId() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('スクリプト プロパティに SPREADSHEET_ID を設定してください');
  return id;
}

// --- シート定義 ---
// 各シートは「論理キー」（英語・コード内部で使用）で参照し、
// 実際のシートタブ名・列見出しは日本語で表示する（事務局が見て分かるように）。
// データは列の「位置」で読むため、内部のフィールドキーは英語のまま保たれる。
// columns: [内部キー, 日本語見出し] の配列（この順序＝列順）。
var SHEETS = {
  members: { name: '会員', columns: [
    ['id', 'ID'], ['memberNumber', '会員番号'], ['memberType', '会員種別'],
    ['lastName', '姓'], ['firstName', '名'], ['lastNameKana', 'セイ'], ['firstNameKana', 'メイ'],
    ['birthDate', '生年月日'], ['postalCode', '郵便番号'], ['address', '住所'], ['areaType', '町内外区分'],
    ['phone', '電話番号'], ['email', 'メールアドレス'], ['passwordHash', 'パスワードハッシュ'],
    ['courseIds', '所属教室ID'], ['isWithdrawn', '退会'], ['registeredAt', '登録日'],
    ['school', '通学先'], ['guardianLastName', '保護者姓'], ['guardianFirstName', '保護者名'],
    ['guardianLastNameKana', '保護者セイ'], ['guardianFirstNameKana', '保護者メイ'],
    ['guardianPhone', '保護者電話'], ['guardianEmail', '保護者メール'],
    ['groupName', '団体名'], ['representativeName', '代表者氏名'], ['memberCount', '加入人数'],
    ['cssNumber', 'CSS番号'], ['insuranceEnrolled', '保険加入'], ['insuranceEnrolledAt', '保険加入日'],
    ['nextYearStatus', '翌年度意思'], ['gender', '性別'], ['schoolAidRecipient', '就学援助受給'],
    ['cssNumberCommunity', '地域クラブ用CSS番号'],
  ] },
  member_courses: { name: '会員教室', columns: [
    ['memberId', '会員ID'], ['courseId', '教室ID'], ['enrolledAt', '登録日'],
  ] },
  courses: { name: '教室マスタ', columns: [
    ['id', 'ID'], ['name', '教室名'], ['paymentMethod', '支払方式'], ['category', 'カテゴリ'],
    ['feeInTown', '町内料金'], ['feeOutOfTown', '町外料金'], ['note', '備考'], ['active', '有効'],
  ] },
  billing: { name: '継続会費', columns: [
    ['id', 'ID'], ['memberId', '会員ID'], ['memberNumber', '会員番号'], ['memberName', '氏名'],
    ['yearMonth', '対象年月'], ['dueDate', '引落日'],
    ['annualFee', '年会費'], ['monthlyClassroom', '月会費(教室)'], ['monthlyConsigned', '月会費(委託)'],
    ['monthlyCommunity', '月会費(地域クラブ)'], ['insuranceFee', '保険料'],
    ['specialFee', '特別徴収'], ['specialNote', '特別徴収備考'],
    ['total', '合計'], ['status', '状態'], ['isRetry', '再請求'], ['carriedTo', '繰越先'],
    ['subsidy', '就学援助補助'],
  ] },
  billing_group: { name: '団体請求', columns: [
    ['id', 'ID'], ['memberId', '会員ID'], ['memberNumber', '会員番号'], ['groupName', '団体名'],
    ['itemName', '請求項目'], ['amount', '金額'], ['dueDate', '引落日'], ['status', '状態'],
  ] },
  billing_adjustment: { name: '調整請求', columns: [
    ['id', 'ID'], ['memberId', '会員ID'], ['memberNumber', '会員番号'], ['memberName', '氏名'],
    ['amount', '金額'], ['note', '備考'], ['dueDate', '引落日'], ['status', '状態'],
  ] },
  auth_users: { name: '管理者', columns: [
    ['email', 'メールアドレス'], ['passwordHash', 'パスワードハッシュ'], ['role', '権限'],
  ] },
};

function sheetConf(key) {
  const conf = SHEETS[key];
  if (!conf) throw new Error('不明なシート: ' + key);
  return conf;
}
function colKeys(key) { return sheetConf(key).columns.map(function (c) { return c[0]; }); }
function colLabels(key) { return sheetConf(key).columns.map(function (c) { return c[1]; }); }
// 内部キーに対応する列番号（1始まり）。無ければ -1。
function colNum(key, fieldKey) {
  const idx = colKeys(key).indexOf(fieldKey);
  return idx < 0 ? -1 : idx + 1;
}

// 論理キーでシートを開く（なければ日本語見出しで新規作成）
function getSheet(key) {
  const conf = sheetConf(key);
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  let sheet = ss.getSheetByName(conf.name);
  if (!sheet) {
    sheet = ss.insertSheet(conf.name);
    const labels = colLabels(key);
    sheet.getRange(1, 1, 1, labels.length).setValues([labels]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// 会員シートのヘッダー行を最新の列定義に同期する（列を追加したときに手動実行）。
// 既存データ（2行目以降）には影響せず、1行目の見出しのみを colLabels に合わせる。
// 「性別」列など、後から追加した列の見出しを既存シートへ反映するために使う。
function syncMemberHeaders() {
  const sheet = getSheet('members');
  const labels = colLabels('members');
  sheet.getRange(1, 1, 1, labels.length).setValues([labels]);
  Logger.log('会員シートの見出しを同期しました（' + labels.length + '列）');
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
      ['c18','鷹栖REDWOLVES 男子U15','monthly',2000,4000,'毎月払い'],
      ['c19','鷹栖REDWOLVES 女子U15','monthly',2000,4000,'毎月払い'],
      ['c20','鷹栖REDWOLVES 男女U12','none',0,0,'徴収なし'],
      ['c21','鷹栖北野バドミントン少年団','none',0,0,'徴収なし'],
      ['c08','鷹栖バレーボールクラブ','monthly',2000,4000,'毎月払い'],
      ['c09','鷹栖ソフトテニスクラブ','monthly',2000,4000,'毎月払い'],
      ['c10','鷹栖剣道クラブ','monthly',2000,4000,'毎月払い'],
      ['c11','NexusBC','monthly',7000,9000,'毎月払い'],
      ['c12','TakasuXC','monthly',2000,4000,'毎月払い'],
      ['c13','マルチスポーツクラブ','monthly',1000,2000,'毎月払い'],
      ['c22','鷹栖剣道少年団','none',0,0,'徴収なし'],
      ['c23','鷹栖北野クロスカントリースキー少年団','none',0,0,'徴収なし'],
      ['c24','鷹栖北野野球少年団','none',0,0,'徴収なし'],
      ['c14','ヨガ教室','ticket',0,0,'チケット制'],
      ['c15','ストレッチ教室','ticket',0,0,'チケット制'],
      ['c16','たかスポレッチ','ticket',0,0,'チケット制'],
      ['c17','レッドコード教室','term1',3000,3000,'1期払い'],
    ];
    courses.forEach(row => courseSheet.appendRow(row));
  }
  
  Logger.log('セットアップ完了');
}

// 既存シートのヘッダー行を、現在の列定義（日本語見出し）に同期する。
// スキーマに列を追加したときに実行すると、データを保持したまま見出しだけ更新できる。
// （getSheet はシートが既存だと見出しを書き換えないため、列追加後はこれを実行する）
function syncHeaders() {
  Object.keys(SHEETS).forEach(function (key) {
    const sheet = getSheet(key);
    const labels = colLabels(key);
    sheet.getRange(1, 1, 1, labels.length).setValues([labels]);
    sheet.setFrozenRows(1);
  });
  Logger.log('ヘッダーを同期しました');
}

// 旧バージョンの英語名シート（members, courses など）を削除する。
// 日本語化の移行時に、setupSpreadsheet() で新シートを作成した後に1回だけ実行する。
function removeLegacySheets() {
  const legacy = ['members', 'member_courses', 'courses', 'billing', 'billing_group', 'billing_adjustment', 'auth_users'];
  const ss = SpreadsheetApp.openById(getSpreadsheetId());
  legacy.forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh) ss.deleteSheet(sh);
  });
  Logger.log('旧シートを削除しました');
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

// 電話番号の先頭「0」が欠落した会員を一括修正する（移行時に数値化で 0 が消えたデータの復旧）。
// GAS エディタから手動実行（Web App デプロイ不要）。電話番号・保護者電話が「0以外で始まる
// 数字のみ」の場合に先頭へ 0 を付与し、列をテキスト書式にして再数値化を防ぐ。
function fixPhoneLeadingZero() {
  const sheet = getSheet('members');
  const last = sheet.getLastRow();
  if (last < 2) { Logger.log('会員データなし'); return 0; }
  const cols = [colNum('members', 'phone'), colNum('members', 'guardianPhone')];
  let fixed = 0;
  cols.forEach(function (col) {
    if (col < 1) return;
    const rng = sheet.getRange(2, col, last - 1, 1);
    const vals = rng.getValues();
    for (let i = 0; i < vals.length; i++) {
      const s = String(vals[i][0] == null ? '' : vals[i][0]).trim();
      if (s && /^[0-9]+$/.test(s) && s.charAt(0) !== '0') { vals[i][0] = '0' + s; fixed++; }
      else { vals[i][0] = s; } // 文字列として書き戻し、以後の数値化を防ぐ
    }
    rng.setNumberFormat('@'); // 列をテキスト書式に
    rng.setValues(vals);
  });
  Logger.log('電話番号の先頭0を修正: ' + fixed + '件');
  return fixed;
}

// パスワードが「電話番号（先頭0なし）」で設定された会員のパスワードを、0付きの電話番号に
// 再設定する。必ず fixPhoneLeadingZero() の後（電話番号が0付きに修正済みの状態）で実行する。
// 現在のハッシュが「電話番号の先頭0を1つ除いた値」のハッシュと一致する会員だけを対象とするため、
// 独自パスワードや元から0付き電話=パスワードの既存会員は変更されない（安全）。
function fixPasswordLeadingZero() {
  const sheet = getSheet('members');
  const last = sheet.getLastRow();
  if (last < 2) { Logger.log('会員データなし'); return 0; }
  const pCol = colNum('members', 'phone');
  const hCol = colNum('members', 'passwordHash');
  const phones = sheet.getRange(2, pCol, last - 1, 1).getValues();
  const hashes = sheet.getRange(2, hCol, last - 1, 1).getValues();
  let fixed = 0;
  for (let i = 0; i < phones.length; i++) {
    const phone = String(phones[i][0] == null ? '' : phones[i][0]).trim();
    if (!phone || phone.charAt(0) !== '0' || !/^[0-9]+$/.test(phone)) continue;
    const oldPlain = phone.substring(1); // 取込時のパスワード候補（先頭0を1つ除去）
    if (String(hashes[i][0]) === hashPassword(oldPlain)) {
      hashes[i][0] = hashPassword(phone); // 0付きの電話番号で再設定
      fixed++;
    }
  }
  sheet.getRange(2, hCol, last - 1, 1).setValues(hashes);
  Logger.log('パスワード（電話番号）の先頭0を修正: ' + fixed + '件');
  return fixed;
}

// ============================================================
// ログイン情報の周知メール（マスキング送信）
// 会員が「どのメール・電話で登録したか（父?母?）」を思い出せるよう、
// 登録メール宛に、メール=最初2文字+ドメイン頭、電話=下4桁 のヒントを送る。
// 完全な値は本文に載せないため、傍受・転送されても認証情報は漏れない。
// ============================================================
var LOGIN_URL = 'https://takasucot2028-del.github.io/takasu-member/';
var CLUB_NAME = '一般社団法人たかすスポーツクラブ';

function maskEmail_(e) {
  e = String(e || '').trim();
  var at = e.indexOf('@');
  if (at < 1) return '●●●';
  var local = e.slice(0, at), domain = e.slice(at + 1);
  var lo = local.slice(0, 2) + '●●●';
  var dom = (domain.charAt(0) || '●') + '●●';
  return lo + '@' + dom;
}
function maskPhone_(p) {
  var d = String(p || '').replace(/[^0-9]/g, '');
  if (d.length < 4) return '●●●●';
  return '●●●●-●●●●-' + d.slice(-4);
}

// 登録メール＋電話の両方がある会員を、メール（世帯）ごとにまとめる
function buildLoginHouseholds_() {
  var sheet = getSheet('members');
  var members = sheetToObjects(sheet, 'members');
  var byEmail = {};
  members.forEach(function (m) {
    if (m.isWithdrawn) return;
    var email = String(m.email || '').trim();
    var phone = String(m.phone || '').replace(/[^0-9]/g, '');
    if (!email || !phone) return; // 両方そろっている会員のみ
    var key = email.toLowerCase();
    if (!byEmail[key]) byEmail[key] = { email: email, phone: phone, names: [] };
    if (!byEmail[key].phone && phone) byEmail[key].phone = phone;
    var nm = m.memberType === 'group' ? (m.groupName || '') : ((m.lastName || '') + ' ' + (m.firstName || ''));
    byEmail[key].names.push(nm.trim());
  });
  return Object.keys(byEmail).map(function (k) { return byEmail[k]; });
}

function loginMailBody_(h) {
  var names = h.names.filter(Boolean).map(function (n) { return '　・' + n; }).join('\n');
  return [
    'いつもお世話になっております。',
    '会員管理システムのログイン情報をお知らせします（安全のため一部を伏せています）。',
    '',
    '■ ログインID（メールアドレス）',
    '　' + maskEmail_(h.email) + '（＝このメールが届いたアドレスです）',
    '',
    '■ パスワード（ご登録の電話番号）',
    '　' + maskPhone_(h.phone) + '（下4桁）',
    '　※ハイフンなし・先頭の0を含む、下4桁が一致するご家族の電話番号です。',
    '',
    '■ ログインすると表示される会員',
    names || '　（情報なし）',
    '',
    'ログイン → ' + LOGIN_URL,
    '初回ログイン後、マイページ下部からパスワードの変更をお願いします。',
    '',
    CLUB_NAME,
  ].join('\n');
}

// テスト送信: 1件だけ自分（管理者）宛に見本を送る。本番会員には送らない。
// 送信先は Script Properties の TEST_EMAIL、無ければ ADMIN_EMAIL。
function sendLoginInfoTest() {
  var props = PropertiesService.getScriptProperties();
  var to = props.getProperty('TEST_EMAIL') || props.getProperty('ADMIN_EMAIL');
  if (!to) { Logger.log('Script Properties に TEST_EMAIL（または ADMIN_EMAIL）を設定してください'); return; }
  var hs = buildLoginHouseholds_();
  Logger.log('送信対象（メール＋電話あり世帯）: ' + hs.length + '件');
  if (hs.length === 0) { Logger.log('対象がありません'); return; }
  var sample = hs[0];
  MailApp.sendEmail({
    to: to,
    subject: '【たかすスポーツクラブ】ログイン情報のご確認（テスト見本）',
    body: '※これはテスト見本です。実際の会員には送信していません。\n\n' + loginMailBody_(sample),
    name: CLUB_NAME,
  });
  Logger.log('テスト見本を ' + to + ' へ送信しました。残り送信可能数: ' + MailApp.getRemainingDailyQuota());
}

// 本番送信: 未送信の世帯へ送る。1回あたり最大 limit 件（既定80）。
// 送信済みは「ログイン案内ログ」シートで管理し、再実行で重複送信しない。
function sendLoginInfoBatch(limit) {
  limit = limit || 80;
  var ss = SpreadsheetApp.openById(getSpreadsheetId());
  var log = ss.getSheetByName('ログイン案内ログ');
  if (!log) {
    log = ss.insertSheet('ログイン案内ログ');
    log.getRange(1, 1, 1, 3).setValues([['メールアドレス', '送信日時', '宛先会員']]);
    log.setFrozenRows(1);
  }
  var sent = {};
  var lv = log.getDataRange().getValues();
  for (var i = 1; i < lv.length; i++) { var e = String(lv[i][0] || '').trim().toLowerCase(); if (e) sent[e] = true; }

  var hs = buildLoginHouseholds_();
  var rows = [];
  var count = 0;
  for (var j = 0; j < hs.length; j++) {
    if (count >= limit) break;
    if (MailApp.getRemainingDailyQuota() <= 0) { Logger.log('本日の送信上限に達しました'); break; }
    var h = hs[j];
    if (sent[h.email.toLowerCase()]) continue;
    MailApp.sendEmail({
      to: h.email,
      subject: '【たかすスポーツクラブ】会員システム ログイン情報のご確認',
      body: loginMailBody_(h),
      name: CLUB_NAME,
    });
    rows.push([h.email, new Date(), h.names.filter(Boolean).join('・')]);
    count++;
  }
  if (rows.length) log.getRange(log.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  var remaining = hs.filter(function (h) { return !sent[h.email.toLowerCase()]; }).length - count;
  Logger.log('送信: ' + count + '件 / 未送信の残り: ' + remaining + '件 / 本日の残り送信可能数: ' + MailApp.getRemainingDailyQuota());
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

function issueToken(role, memberIds) {
  const token = genId() + genId(); // 24文字
  CacheService.getScriptCache().put(
    'sess_' + token,
    JSON.stringify({ role: role, memberIds: memberIds || [] }),
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
var PUBLIC_ACTIONS = { login: true, adminLogin: true, registerMember: true, getCourses: true };
var SELF_OR_ADMIN_ACTIONS = { getMember: true, updateMember: true, withdrawMember: true };
// 認証済みなら誰でも可（ハンドラ側でセッションの世帯に限定）
var AUTHED_ACTIONS = { getMemberBilling: true, changePassword: true };

function enforceAuth(action, body) {
  if (PUBLIC_ACTIONS[action]) return;
  const session = getSession(body.token);
  if (!session) throw new Error('認証が必要です。再度ログインしてください');
  if (AUTHED_ACTIONS[action]) return; // 認証済みなら許可（自分の世帯のみ返す）
  if (SELF_OR_ADMIN_ACTIONS[action]) {
    if (session.role === 'admin') return;
    // 世帯（同一メールの複数会員）のいずれかなら本人として許可
    if (session.memberIds && session.memberIds.indexOf(body.memberId) !== -1) return;
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
      case 'bulkRegister':
        result = handleBulkRegister(body.members);
        break;
      case 'bulkUpdateInsurance':
        result = handleBulkUpdateInsurance(body.updates);
        break;
      case 'bulkUpdateCss':
        result = handleBulkUpdateCss(body.updates);
        break;
      case 'runYearUpdate':
        result = handleRunYearUpdate(body.fiscalYear);
        break;
      case 'getMember':
        result = handleGetMember(body.memberId);
        break;
      case 'updateMember':
        result = handleUpdateMember(body.memberId, body.data, getSession(body.token));
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
      case 'getCourses':
        result = handleGetCourses();
        break;
      case 'saveCourses':
        result = handleSaveCourses(body.courses);
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
      case 'getMemberBilling':
        result = handleGetMemberBilling(body.token);
        break;
      case 'changePassword':
        result = handleChangePassword(body.token, body.oldPassword, body.newPassword);
        break;
      case 'getBillingSchedule':
        result = handleGetBillingSchedule();
        break;
      case 'saveBillingSchedule':
        result = handleSaveBillingSchedule(body.schedule);
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

// シートの各行を内部キーのオブジェクトへ変換。
// 見出しが日本語でもデータは「列の位置」で内部キー（英語）に対応づける。
function sheetToObjects(sheet, key) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const keys = colKeys(key);
  const tz = Session.getScriptTimeZone();
  return data.slice(1).map(row => {
    const obj = {};
    keys.forEach((k, i) => {
      const v = row[i];
      // スプレッドシートが日付文字列を Date 型へ自動変換するため、
      // 読み取り時に YYYY-MM-DD の文字列へ戻す（生年月日・引落日などの崩れ防止）。
      obj[k] = (Object.prototype.toString.call(v) === '[object Date]')
        ? Utilities.formatDate(v, tz, 'yyyy-MM-dd')
        : v;
    });
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
  const members = sheetToObjects(sheet, 'members');
  const hash = hashPassword(password);
  // 同一メール＋パスワードに一致する全員（世帯）を返す
  const matched = members.filter(function (m) {
    return m.email === email && !m.isWithdrawn && m.passwordHash === hash;
  });
  if (matched.length === 0) {
    return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
  }
  matched.forEach(function (m) {
    m.courseIds = m.courseIds ? String(m.courseIds).split(',') : [];
    delete m.passwordHash;
  });
  const token = issueToken('member', matched.map(function (m) { return m.id; }));
  return { success: true, token: token, members: matched, member: matched[0], role: 'member' };
}

function handleAdminLogin(email, password) {
  const sheet = getSheet('auth_users');
  const users = sheetToObjects(sheet, 'auth_users');
  const hash = hashPassword(password);
  const user = users.find(u => u.email === email && u.passwordHash === hash);
  if (!user) return { success: false, error: 'ログイン情報が正しくありません' };
  return { success: true, token: issueToken('admin', []), role: 'admin' };
}

function handleRegister(data) {
  const sheet = getSheet('members');
  const id = genId();
  const memberNumber = nextMemberNumber(sheet);
  const hash = hashPassword(data.password);
  const courseIds = (data.courseIds || []).join(',');
  const now = data.registeredAt || new Date().toISOString().slice(0, 10);

  const row = [
    id, memberNumber, data.memberType,
    data.lastName, data.firstName, data.lastNameKana, data.firstNameKana,
    data.birthDate, data.postalCode || '', data.address, data.areaType,
    data.phone, data.email, hash, courseIds, false, now,
    data.school || '', data.guardianLastName || '', data.guardianFirstName || '',
    data.guardianLastNameKana || '', data.guardianFirstNameKana || '',
    data.guardianPhone || '', data.guardianEmail || '',
    data.groupName || '', data.representativeName || '', data.memberCount || 0,
    data.cssNumber || '', data.insuranceEnrolled || false, data.insuranceEnrolledAt || '',
    data.nextYearStatus || '', data.gender || '', data.schoolAidRecipient || false,
    data.cssNumberCommunity || '',
  ];
  sheet.appendRow(row);

  notifyAdminNewMember_({ memberNumber: memberNumber, data: data, registeredAt: now });

  return { success: true, data: { id, memberNumber, ...data, registeredAt: now } };
}

// 新規入会を事務局（Script Properties の ADMIN_EMAIL）へメール通知する。
// 送信失敗で登録自体は止めない（try/catch で握りつぶす）。
function notifyAdminNewMember_(info) {
  try {
    const to = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL');
    if (!to) { Logger.log('ADMIN_EMAIL 未設定のため新規入会通知をスキップしました'); return; }
    if (MailApp.getRemainingDailyQuota() <= 0) { Logger.log('本日の送信上限のため新規入会通知をスキップしました'); return; }

    const d = info.data;
    const typeLabel = { general: '一般会員', junior: 'ジュニア会員', group: '団体会員' }[d.memberType] || d.memberType;
    const name = d.memberType === 'group'
      ? (d.groupName || '') + '（代表: ' + (d.representativeName || '') + '）'
      : (d.lastName || '') + ' ' + (d.firstName || '');

    MailApp.sendEmail({
      to: to,
      subject: '【新規入会】' + name + '（' + info.memberNumber + '）',
      body: [
        '新しい会員登録がありました。',
        '',
        '会員番号: ' + info.memberNumber,
        '氏名: ' + name,
        '会員種別: ' + typeLabel,
        '電話: ' + (d.phone || ''),
        'メール: ' + (d.email || ''),
        '登録日: ' + info.registeredAt,
        '',
        '※このメールは自動送信です。会員管理システムでご確認ください。',
      ].join('\n'),
      name: CLUB_NAME,
    });
  } catch (e) {
    Logger.log('新規入会通知メールの送信に失敗: ' + e);
  }
}

// テスト用: 架空データで事務局通知メールだけを送る（会員レコードは作らない）。
// GASエディタで本関数を選んで実行し、ADMIN_EMAIL にメールが届くか確認する。
function testNotifyAdminNewMember() {
  var to = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL');
  Logger.log('送信先 ADMIN_EMAIL: ' + (to || '(未設定)'));
  Logger.log('本日の残り送信可能数: ' + MailApp.getRemainingDailyQuota());
  notifyAdminNewMember_({
    memberNumber: 'TSC-TEST',
    data: {
      memberType: 'general', lastName: 'テスト', firstName: '太郎',
      phone: '090-0000-0000', email: 'test@example.com',
    },
    registeredAt: new Date().toISOString().slice(0, 10),
  });
  Logger.log('testNotifyAdminNewMember 実行完了。受信トレイを確認してください。');
}

// 教室ID→名称（教室変更の通知メール用。フロントの src/utils/constants.ts の COURSES と一致させる）
var COURSE_NAMES = {
  c01: 'スポーツやってみ隊', c02: '運動遊び隊', c03: '小学生水泳教室', c25: '水泳教室（大人）',
  c04: '幼児水泳教室', c05: 'ダンス教室', c06: '英会話教室', c18: '鷹栖REDWOLVES 男子U15',
  c19: '鷹栖REDWOLVES 女子U15', c20: '鷹栖REDWOLVES 男女U12', c21: '鷹栖北野バドミントン少年団',
  c08: '鷹栖バレーボールクラブ', c09: '鷹栖ソフトテニスクラブ', c10: '鷹栖剣道クラブ', c11: 'NexusBC',
  c12: 'TakasuXC', c13: 'マルチスポーツクラブ', c22: '鷹栖剣道少年団',
  c23: '鷹栖北野クロスカントリースキー少年団', c24: '鷹栖北野野球少年団', c26: '海洋クラブ',
  c27: 'ソルリッサ', c28: '旭川ウィングスFC', c29: 'コンディショニング', c14: 'ヨガ教室',
  c15: 'ストレッチ教室', c16: 'たかスポレッチ', c17: 'レッドコード教室',
};
// 教室名の解決: まず教室マスタシートの最新名称、無ければ固定マップ、最後にID。
function courseNameMap_() {
  var map = {};
  try {
    var res = handleGetCourses();
    if (res && res.data) res.data.forEach(function (c) { map[c.id] = c.name; });
  } catch (e) { /* シート未作成等は無視してフォールバック */ }
  return map;
}
function courseName_(id, map) {
  if (map && map[id]) return map[id];
  return COURSE_NAMES[id] || id;
}

// 会員本人による参加教室の変更（追加・削除）を事務局（ADMIN_EMAIL）へ通知する。
// 管理者の編集では呼ばない。変更が無ければ送らない。送信失敗で更新自体は止めない。
function notifyAdminCourseChange_(info) {
  try {
    var to = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL');
    if (!to) { Logger.log('ADMIN_EMAIL 未設定のため教室変更通知をスキップしました'); return; }

    var oldArr = info.oldIds ? String(info.oldIds).split(',').filter(String) : [];
    var newArr = info.newIds ? String(info.newIds).split(',').filter(String) : [];
    var added = newArr.filter(function (id) { return oldArr.indexOf(id) === -1; });
    var removed = oldArr.filter(function (id) { return newArr.indexOf(id) === -1; });
    if (added.length === 0 && removed.length === 0) return; // 変更なし

    if (MailApp.getRemainingDailyQuota() <= 0) { Logger.log('送信上限のため教室変更通知をスキップしました'); return; }

    var nmap = courseNameMap_();
    var nameList = function (ids) {
      return ids.length ? ids.map(function (id) { return '・' + courseName_(id, nmap); }).join('\n') : '（なし）';
    };
    var lines = [
      '会員が参加教室を変更しました。',
      '',
      '会員番号: ' + info.memberNumber,
      '氏名: ' + info.memberName,
      '',
    ];
    if (added.length) lines.push('【追加した教室】', nameList(added), '');
    if (removed.length) lines.push('【削除した教室】', nameList(removed), '');
    lines.push('現在の参加教室:', nameList(newArr), '', '※このメールは自動送信です。会員管理システムでご確認ください。');

    MailApp.sendEmail({
      to: to,
      subject: '【教室変更】' + info.memberName + '（' + info.memberNumber + '）',
      body: lines.join('\n'),
      name: CLUB_NAME,
    });
  } catch (e) {
    Logger.log('教室変更通知メールの送信に失敗: ' + e);
  }
}

// テスト用: 架空データで教室変更通知メールだけを送る（会員データは変更しない）。
function testNotifyAdminCourseChange() {
  var to = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL');
  Logger.log('送信先 ADMIN_EMAIL: ' + (to || '(未設定)'));
  notifyAdminCourseChange_({
    memberNumber: 'TSC-TEST', memberName: 'テスト 太郎',
    oldIds: 'c06,c08', newIds: 'c06,c10',
  });
  Logger.log('testNotifyAdminCourseChange 実行完了。受信トレイを確認してください。');
}

// 会員を一括登録（既存データ移行用・管理者専用）。
// 採番のための最大値を一度だけ読み、全件を1回の setValues でまとめて追記する（高速）。
function handleBulkRegister(members) {
  if (!members || !members.length) return { success: true, data: { created: 0, members: [] } };
  const sheet = getSheet('members');

  // 既存の最大会員番号を取得（連番採番）
  const data = sheet.getDataRange().getValues();
  const numCol = colNum('members', 'memberNumber') - 1;
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const num = parseInt(String(data[i][numCol]).replace('TSC-', ''), 10);
    if (!isNaN(num) && num > max) max = num;
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = [];
  const created = [];
  members.forEach(function (d) {
    max += 1;
    const id = genId();
    const memberNumber = 'TSC-' + String(max).padStart(4, '0');
    const hash = hashPassword(d.password || '');
    const courseIds = (d.courseIds || []).join(',');
    rows.push([
      id, memberNumber, d.memberType,
      d.lastName, d.firstName, d.lastNameKana, d.firstNameKana,
      d.birthDate, d.postalCode || '', d.address, d.areaType,
      d.phone, d.email, hash, courseIds, false, d.registeredAt || today,
      d.school || '', d.guardianLastName || '', d.guardianFirstName || '',
      d.guardianLastNameKana || '', d.guardianFirstNameKana || '',
      d.guardianPhone || '', d.guardianEmail || '',
      d.groupName || '', d.representativeName || '', d.memberCount || 0,
      d.cssNumber || '', d.insuranceEnrolled || false, d.insuranceEnrolledAt || '',
      d.nextYearStatus || '', d.gender || '', d.schoolAidRecipient || false,
      d.cssNumberCommunity || '',
    ]);
    created.push({ id: id, memberNumber: memberNumber });
  });

  // 1回の書き込みでまとめて追記
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return { success: true, data: { created: rows.length, members: created } };
}

// 年度更新（一括繰越・管理者専用）。
// 退会希望(nextYearStatus=withdraw)を退会処理、継続/未回答は在籍維持し、
// 保険加入者の加入日を新年度4/1に更新。処理後は意思をリセットする。
function handleRunYearUpdate(fiscalYear) {
  const sheet = getSheet('members');
  const data = sheet.getDataRange().getValues();
  const wCol = colNum('members', 'isWithdrawn');
  const nyCol = colNum('members', 'nextYearStatus');
  const insCol = colNum('members', 'insuranceEnrolled');
  const insAtCol = colNum('members', 'insuranceEnrolledAt');
  const apr = fiscalYear + '-04-01';
  let withdrawn = 0, continued = 0;
  for (let i = 1; i < data.length; i++) {
    const row = i + 1;
    if (data[i][wCol - 1] === true || String(data[i][wCol - 1]) === 'true') continue; // 既退会
    const ny = String(data[i][nyCol - 1] || '');
    if (ny === 'withdraw') {
      sheet.getRange(row, wCol).setValue(true);
      sheet.getRange(row, nyCol).setValue('');
      withdrawn++;
    } else {
      const insured = data[i][insCol - 1] === true || String(data[i][insCol - 1]) === 'true';
      if (insured) sheet.getRange(row, insAtCol).setValue(apr);
      sheet.getRange(row, nyCol).setValue('');
      continued++;
    }
  }
  return { success: true, data: { withdrawn: withdrawn, continued: continued } };
}

// CSS番号（口座振替番号）を会員IDで一括設定（管理者専用）。
function handleBulkUpdateCss(updates) {
  const sheet = getSheet('members');
  const data = sheet.getDataRange().getValues();
  const cssCol = colNum('members', 'cssNumber');
  const idToRow = {};
  for (let i = 1; i < data.length; i++) idToRow[data[i][0]] = i + 1;
  let updated = 0, notFound = 0;
  (updates || []).forEach(function (u) {
    const row = idToRow[u.memberId];
    if (!row) { notFound++; return; }
    sheet.getRange(row, cssCol).setValue(String(u.cssNumber));
    updated++;
  });
  return { success: true, data: { updated: updated, notFound: notFound } };
}

// 保険加入を一括設定（会員番号で照合し、加入フラグON＋加入日を更新・管理者専用）。
function handleBulkUpdateInsurance(updates) {
  const sheet = getSheet('members');
  const data = sheet.getDataRange().getValues();
  const numCol = colNum('members', 'memberNumber') - 1;
  const enrolledCol = colNum('members', 'insuranceEnrolled');
  const dateCol = colNum('members', 'insuranceEnrolledAt');
  const byNum = {};
  for (let i = 1; i < data.length; i++) byNum[String(data[i][numCol])] = i + 1;

  let updated = 0;
  const notFound = [];
  (updates || []).forEach(function (u) {
    const row = byNum[String(u.memberNumber)];
    if (!row) { notFound.push(u.memberNumber); return; }
    sheet.getRange(row, enrolledCol).setValue(true);
    if (u.insuranceEnrolledAt) sheet.getRange(row, dateCol).setValue(u.insuranceEnrolledAt);
    updated++;
  });
  return { success: true, data: { updated: updated, notFound: notFound } };
}

function handleGetMember(memberId) {
  const sheet = getSheet('members');
  const members = sheetToObjects(sheet, 'members');
  const member = members.find(m => m.id === memberId);
  if (!member) return { success: false, error: '会員が見つかりません' };
  member.courseIds = member.courseIds ? member.courseIds.split(',') : [];
  delete member.passwordHash;
  return { success: true, data: member };
}

function handleUpdateMember(memberId, data, session) {
  const sheet = getSheet('members');
  const rowIndex = findRowIndex(sheet, 0, memberId);
  if (rowIndex < 0) return { success: false, error: '会員が見つかりません' };

  // 教室変更を会員本人が行った場合に事務局へ通知するため、更新前の情報を控える。
  var notifyCourse = (data.courseIds !== undefined && session && session.role === 'member');
  var before = null;
  if (notifyCourse) {
    var ccol = colNum('members', 'courseIds');
    var gn = String(sheet.getRange(rowIndex, colNum('members', 'groupName')).getValue() || '');
    var ln = String(sheet.getRange(rowIndex, colNum('members', 'lastName')).getValue() || '');
    var fn = String(sheet.getRange(rowIndex, colNum('members', 'firstName')).getValue() || '');
    before = {
      oldIds: ccol > 0 ? String(sheet.getRange(rowIndex, ccol).getValue() || '') : '',
      memberNumber: String(sheet.getRange(rowIndex, colNum('members', 'memberNumber')).getValue() || ''),
      memberName: gn || (ln + ' ' + fn).trim(),
    };
  }

  Object.keys(data).forEach(key => {
    const cn = colNum('members', key);
    if (cn > 0) {
      let value = data[key];
      if (key === 'courseIds' && Array.isArray(value)) value = value.join(',');
      sheet.getRange(rowIndex, cn).setValue(value);
    }
  });

  if (notifyCourse) {
    var newIds = Array.isArray(data.courseIds) ? data.courseIds.join(',') : String(data.courseIds || '');
    notifyAdminCourseChange_({
      memberNumber: before.memberNumber, memberName: before.memberName,
      oldIds: before.oldIds, newIds: newIds,
    });
  }

  return { success: true };
}

function handleWithdraw(memberId) {
  const sheet = getSheet('members');
  const rowIndex = findRowIndex(sheet, 0, memberId);
  if (rowIndex < 0) return { success: false, error: '会員が見つかりません' };
  sheet.getRange(rowIndex, colNum('members', 'isWithdrawn')).setValue(true);
  return { success: true };
}

function handleGetMembers() {
  const sheet = getSheet('members');
  const members = sheetToObjects(sheet, 'members');
  members.forEach(m => {
    m.courseIds = m.courseIds ? m.courseIds.split(',') : [];
    delete m.passwordHash;
  });
  return { success: true, data: members };
}

function handleSearchMembers(query) {
  const sheet = getSheet('members');
  const members = sheetToObjects(sheet, 'members');
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
  const members = sheetToObjects(sheet, 'members');
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
  const records = sheetToObjects(sheet, 'billing').filter(function (r) { return ym7(r.yearMonth) === yearMonth; });
  records.forEach(function (r) { r.yearMonth = ym7(r.yearMonth); });
  return { success: true, data: records };
}

// 教室マスタを取得する（公開：新規登録画面でも使う）。空なら空配列を返し、
// フロント側で固定の初期教室にフォールバックする。
function handleGetCourses() {
  const sheet = getSheet('courses');
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { success: true, data: [] };
  // 旧フォーマット（カテゴリ・有効列が無い等）のシートは列位置がずれて誤読するため、
  // 見出しが現在の定義と一致しない場合は空を返し、フロントの既定教室にフォールバックさせる。
  // 教室管理で一度「保存」すると、正しい列構成でシート全体が書き直される。
  const header = values[0].map(function (h) { return String(h); });
  const expected = colLabels('courses');
  const headerOk = expected.every(function (label, i) { return header[i] === label; });
  if (!headerOk) {
    Logger.log('教室マスタの列が旧形式のため空として扱います（教室管理で保存すると修正されます）');
    return { success: true, data: [] };
  }
  const courses = sheetToObjects(sheet, 'courses').map(function (c) {
    return {
      id: String(c.id), name: String(c.name),
      paymentMethod: String(c.paymentMethod), category: String(c.category),
      feeInTown: Number(c.feeInTown) || 0, feeOutOfTown: Number(c.feeOutOfTown) || 0,
      note: String(c.note || ''),
      active: !(c.active === false || String(c.active).toLowerCase() === 'false'),
    };
  }).filter(function (c) { return c.id; });
  return { success: true, data: courses };
}

// 教室マスタを丸ごと保存する（管理者専用）。見出しを含めてシートを書き直すため、
// 列構成のずれ（旧バージョンのシート）も保存時に修正される。
function handleSaveCourses(courses) {
  const sheet = getSheet('courses');
  const labels = colLabels('courses');
  const keys = colKeys('courses');
  sheet.clear();
  sheet.getRange(1, 1, 1, labels.length).setValues([labels]);
  sheet.setFrozenRows(1);
  const list = courses || [];
  if (list.length) {
    const rows = list.map(function (c) {
      return keys.map(function (k) {
        if (k === 'active') return c.active !== false;
        return c[k] !== undefined && c[k] !== null ? c[k] : '';
      });
    });
    sheet.getRange(2, 1, rows.length, keys.length).setValues(rows);
  }
  return { success: true, data: { saved: list.length } };
}

function handleUpdateBillingStatus(billingId, status) {
  const sheet = getSheet('billing');
  const rowIndex = findRowIndex(sheet, 0, billingId);
  if (rowIndex < 0) return { success: false, error: '請求が見つかりません' };
  sheet.getRange(rowIndex, colNum('billing', 'status')).setValue(status);
  return { success: true };
}

function handleGenerateBilling(yearMonth) {
  // 請求生成ロジックはフロントエンドで実行し、
  // saveBillingRecords / replaceMonthlyBilling で保存する方式。
  return { success: true, data: [] };
}

// billing シートの列順（内部キー）。BillingRecord を行配列へ変換するのに使う。
const BILLING_COLUMNS = colKeys('billing');

function billingRecordToRow(r) {
  return BILLING_COLUMNS.map(c => (r[c] !== undefined && r[c] !== null) ? r[c] : '');
}

// 対象年月を 'YYYY-MM' に正規化（スプレッドシートが '2026-07' を日付化するため）
function ym7(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  return String(v == null ? '' : v).slice(0, 7);
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

// 対象月の自動生成レコードを置換（id に `-adj-` を含む手動調整は保持）。
// 大量レコードでも高速・タイムアウトしないよう、1行ずつでなく一括で書き込む。
function handleReplaceMonthlyBilling(yearMonth, records) {
  const sheet = getSheet('billing');
  const ncol = BILLING_COLUMNS.length;
  const data = sheet.getDataRange().getValues();
  const ymCol = BILLING_COLUMNS.indexOf('yearMonth');
  const fit = function (r) { const x = r.slice(0, ncol); while (x.length < ncol) x.push(''); return x; };

  // 残す行: 対象月の自動生成分（id に -adj- を含まない）以外
  const kept = [];
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0]);
    const ym = ym7(data[i][ymCol]);
    if (ym === yearMonth && id.indexOf('-adj-') === -1) continue;
    kept.push(fit(data[i]));
  }
  const newRows = (records || []).map(function (r) { return billingRecordToRow(r); });
  const out = [colLabels('billing')].concat(kept).concat(newRows);

  // 既存をクリアして一括書き込み（appendRow/deleteRow のループを排してタイムアウト回避）
  sheet.clearContents();
  sheet.getRange(1, 1, out.length, ncol).setValues(out);
  sheet.setFrozenRows(1);
  return { success: true };
}

// 会員（保護者）が自分の世帯の請求を取得。セッションの memberIds に限定する。
// 会員本人がパスワードを変更する。世帯（同一メール＋パスワードでログイン）の整合を保つため、
// セッションの世帯全員のパスワードをまとめて更新する。現在のパスワード照合を必須とする。
function handleChangePassword(token, oldPassword, newPassword) {
  const session = getSession(token);
  const ids = (session && session.memberIds) || [];
  if (ids.length === 0) return { success: false, error: '認証が必要です。再度ログインしてください' };
  if (!newPassword || String(newPassword).length < 6) {
    return { success: false, error: 'パスワードは6文字以上で入力してください' };
  }
  const sheet = getSheet('members');
  const data = sheet.getDataRange().getValues();
  const idCol = colNum('members', 'id') - 1;
  const hCol = colNum('members', 'passwordHash'); // 1始まり
  const oldHash = hashPassword(String(oldPassword || ''));
  const newHash = hashPassword(String(newPassword));

  const targetRows = [];
  let verified = false;
  for (let i = 1; i < data.length; i++) {
    if (ids.indexOf(data[i][idCol]) !== -1) {
      targetRows.push(i + 1); // 1始まり
      if (String(data[i][hCol - 1]) === oldHash) verified = true;
    }
  }
  if (targetRows.length === 0) return { success: false, error: '会員が見つかりません' };
  if (!verified) return { success: false, error: '現在のパスワードが正しくありません' };

  targetRows.forEach(function (r) { sheet.getRange(r, hCol).setValue(newHash); });
  return { success: true };
}

function handleGetMemberBilling(token) {
  const session = getSession(token);
  const ids = (session && session.memberIds) || [];
  const sheet = getSheet('billing');
  const records = sheetToObjects(sheet, 'billing').filter(function (r) {
    return ids.indexOf(r.memberId) !== -1;
  });
  records.forEach(function (r) { r.yearMonth = ym7(r.yearMonth); });
  return { success: true, data: records };
}

// 引落不能（status=failed）の請求を全月から取得
function handleGetFailedBillings() {
  const sheet = getSheet('billing');
  const records = sheetToObjects(sheet, 'billing').filter(r => r.status === 'failed');
  records.forEach(function (r) { r.yearMonth = ym7(r.yearMonth); });
  return { success: true, data: records };
}

// 請求スケジュール（教室ごとの請求月）。Script Properties に JSON で保持。
function handleGetBillingSchedule() {
  const raw = PropertiesService.getScriptProperties().getProperty('BILLING_SCHEDULE');
  let sched = {};
  if (raw) { try { sched = JSON.parse(raw); } catch (e) { sched = {}; } }
  return { success: true, data: sched };
}

function handleSaveBillingSchedule(schedule) {
  PropertiesService.getScriptProperties().setProperty('BILLING_SCHEDULE', JSON.stringify(schedule || {}));
  return { success: true };
}

function handleUpdateGroupBillingStatus(id, status) {
  const sheet = getSheet('billing_group');
  const rowIndex = findRowIndex(sheet, 0, id);
  if (rowIndex < 0) return { success: false, error: '団体請求が見つかりません' };
  sheet.getRange(rowIndex, colNum('billing_group', 'status')).setValue(status);
  return { success: true };
}

function handleGetGroupBillings() {
  const sheet = getSheet('billing_group');
  return { success: true, data: sheetToObjects(sheet, 'billing_group') };
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
  const members = sheetToObjects(memberSheet, 'members');
  const member = members.find(m => m.id === memberId);
  const name = member ? (member.lastName + ' ' + member.firstName) : '';
  const memberNumber = member ? member.memberNumber : '';

  sheet.appendRow([id, memberId, memberNumber, name, amount, note, dueDate, 'pending']);
  return { success: true };
}
