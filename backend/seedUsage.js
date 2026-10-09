// สร้างข้อมูลตัวอย่างสำหรับทดสอบแดชบอร์ด Usage (login/user activity)
// รันครั้งเดียวด้วยมือ: node seedUsage.js  — ไม่ใช่ migration อัตโนมัติตอน start server
// 1) "โรงพยาบาลทดสอบระบบ" (hcode 00000) ให้ตัวเลขตรงตาม spec ข้อ 7 เป๊ะ
// 2) จำลองข้อมูลการใช้งานของ รพ. จริง 15 แห่ง (ของเดิมในระบบ) ให้มีคะแนนหลายระดับ สำหรับพรีวิวหน้าภาพรวม
const mysql = require('mysql2/promise')
const { computeUsageScore } = require('./usageKpi')

const pool = mysql.createPool({
  host: 'localhost', port: 3306, user: 'vespazeza', password: '64120482', database: 'acc_system_setup',
  charset: 'utf8mb4', waitForConnections: true, connectionLimit: 5, dateStrings: true,
})
// ต้องตั้ง SET NAMES ทุก connection เหมือน server.js ไม่งั้นข้อความไทยที่ seed จะถูกเก็บแบบ mojibake
pool.on('connection', (conn) => { conn.query("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'") })

const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]] } return arr }
const repeatedPool = (countsMap) => { const out = []; for (const [k, c] of Object.entries(countsMap)) for (let i = 0; i < c; i++) out.push(k); return shuffle(out) }
const pad2 = (n) => String(n).padStart(2, '0')
const dstr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const businessDaysBetween = (start, end) => {
  const out = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) out.push(new Date(d))
  }
  return out
}

async function getOrCreateHospital(code, name, province, healthRegion, goLiveDate) {
  const [existing] = await pool.query('SELECT id FROM hospitals WHERE code=?', [code])
  if (existing.length) {
    await pool.query('UPDATE hospitals SET health_region=?, go_live_date=? WHERE id=?', [healthRegion, goLiveDate, existing[0].id])
    return existing[0].id
  }
  const [r] = await pool.query(
    'INSERT INTO hospitals (name, code, province, region, health_region, go_live_date, type) VALUES (?,?,?,?,?,?,?)',
    [name, code, province, 'ทดสอบ', healthRegion, goLiveDate, 'TEST']
  )
  return r.insertId
}

// ลบ batch เดิมของ รพ./งวดนี้ (ถ้ามี) แล้วสร้างใหม่ — เหมือนพฤติกรรม import จริง (แทนที่ทั้งงวด)
async function createBatch(hospitalId, periodStart, periodEnd, fileName) {
  const [old] = await pool.query('SELECT id FROM usage_import_batch WHERE hospital_id=? AND period_start=? AND period_end=?', [hospitalId, periodStart, periodEnd])
  for (const o of old) {
    for (const t of ['usage_fact_daily_activity', 'usage_fact_user_activity', 'usage_fact_menu_usage', 'usage_fact_hourly', 'usage_fact_failure', 'usage_fact_login', 'usage_fact_data_footprint', 'usage_snapshot_user']) {
      await pool.query(`DELETE FROM ${t} WHERE import_batch_id=?`, [o.id])
    }
    await pool.query('DELETE FROM usage_import_batch WHERE id=?', [o.id])
  }
  const [r] = await pool.query(
    `INSERT INTO usage_import_batch (hospital_id, period_start, period_end, spec_version, app_version, file_name, imported_by, status)
     VALUES (?,?,?,?,?,?,?,?)`,
    [hospitalId, periodStart, periodEnd, '1.0', 'seed-script', fileName, 'seed-script', 'ok']
  )
  return r.insertId
}

const OPERATIONAL_GROUPS = ['ระบบลูกหนี้', 'ระบบเจ้าหนี้', 'ระบบบัญชี', 'เมนูรายได้', 'ครุภัณฑ์']
const SETUP_GROUPS = ['ข้อมูลพื้นฐานระบบบัญชี', 'ข้อมูลพื้นฐานระบบเจ้าหนี้', 'ข้อมูลพื้นฐานระบบลูกหนี้', 'ความปลอดภัย']
const REPORTING_GROUPS = ['รายงาน', 'ผู้ช่วย AI']

// สร้างชุด event แล้ว roll-up ลงทุกตารางให้ตัวเลขรวม (marginal totals) ตรงกับ target ที่กำหนดเป๊ะทุกมิติ
async function seedPeriod(hospitalId, periodStart, periodEnd, users, actionCounts, categoryCounts, outcomeCounts, hourCounts, userCounts, loginPlan, journalByYm, fileName, activeDaysCount) {
  const batchId = await createBatch(hospitalId, periodStart, periodEnd, fileName)
  const total = Object.values(actionCounts).reduce((a, b) => a + b, 0)

  // snapshot_user
  for (const u of users) {
    await pool.query(
      `INSERT INTO usage_snapshot_user (hospital_id, import_batch_id, snapshot_date, username, full_name, position, user_groups, status, last_login)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [hospitalId, batchId, periodEnd, u.username, u.fullName, u.position, u.userGroups, u.status, u.lastLogin]
    )
  }

  // สร้าง pool ของแต่ละมิติแล้ว zip ตาม index — การันตี marginal sum ตรงเป๊ะทุกมิติ
  const menuGroupPool = repeatedPool(categoryCounts)
  const actionPool = repeatedPool(actionCounts)
  const outcomePool = repeatedPool(outcomeCounts)
  const hourBucketPool = repeatedPool(hourCounts) // 'in' | 'out'
  const userPool = repeatedPool(userCounts)
  let activeDates = businessDaysBetween(new Date(periodStart), new Date(periodEnd))
  if (activeDaysCount != null && activeDaysCount < activeDates.length) {
    activeDates = shuffle([...activeDates]).slice(0, activeDaysCount)
  }
  const dateWeights = {}
  activeDates.forEach(d => { dateWeights[dstr(d)] = 1 })
  const datePool = repeatedPool(Object.fromEntries(Object.keys(dateWeights).map(k => [k, Math.ceil(total / Object.keys(dateWeights).length)]))).slice(0, total)
  while (datePool.length < total) datePool.push(datePool[datePool.length % Math.max(datePool.length, 1)] || dstr(activeDates[0]))
  shuffle(datePool)

  const events = []
  for (let i = 0; i < total; i++) {
    const hourBucket = hourBucketPool[i]
    const hour = hourBucket === 'in' ? 8 + Math.floor(Math.random() * 9) : (Math.random() < 0.5 ? Math.floor(Math.random() * 8) : 17 + Math.floor(Math.random() * 5))
    events.push({
      date: datePool[i], menuGroup: menuGroupPool[i], action: actionPool[i], outcome: outcomePool[i],
      hour, hourBucket, username: userPool[i],
    })
  }

  // ── daily_activity ──
  const dailyMap = {}
  events.forEach(e => {
    const key = `${e.date}|${e.menuGroup}|${e.action}|${e.outcome}`
    if (!dailyMap[key]) dailyMap[key] = { ...e, n_actions: 0, users: new Set() }
    dailyMap[key].n_actions++; dailyMap[key].users.add(e.username)
  })
  for (const d of Object.values(dailyMap)) {
    await pool.query(
      `INSERT INTO usage_fact_daily_activity (hospital_id, import_batch_id, activity_date, menu_group, action, outcome, n_actions, n_users) VALUES (?,?,?,?,?,?,?,?)`,
      [hospitalId, batchId, d.date, d.menuGroup, d.action, d.outcome, d.n_actions, d.users.size]
    )
  }

  // ── user_activity ──
  const userMap = {}
  events.forEach(e => {
    if (!userMap[e.username]) userMap[e.username] = { n_actions: 0, n_add: 0, n_edit: 0, n_delete: 0, n_import: 0, n_export: 0, n_post: 0, n_failed: 0, dates: new Set(), hours: [], offhours: 0 }
    const u = userMap[e.username]
    u.n_actions++
    u[`n_${e.action}`]++
    if (e.outcome === 'failed') u.n_failed++
    u.dates.add(e.date)
    u.hours.push(`${e.date} ${pad2(e.hour)}:00:00`)
    if (e.hourBucket === 'out') u.offhours++
  })
  for (const [username, u] of Object.entries(userMap)) {
    u.hours.sort()
    await pool.query(
      `INSERT INTO usage_fact_user_activity (hospital_id, import_batch_id, username, n_actions, n_add, n_edit, n_delete, n_import, n_export, n_post, n_failed, active_days, first_at, last_at, n_offhours, n_ips)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [hospitalId, batchId, username, u.n_actions, u.n_add, u.n_edit, u.n_delete, u.n_import, u.n_export, u.n_post, u.n_failed, u.dates.size, u.hours[0], u.hours[u.hours.length - 1], u.offhours, 1 + Math.floor(Math.random() * 2)]
    )
  }

  // ── menu_usage ──
  const menuMap = {}
  events.forEach(e => {
    const key = `${e.menuGroup}|${e.username}|${e.action}`
    if (!menuMap[key]) menuMap[key] = { menuGroup: e.menuGroup, username: e.username, action: e.action, n_actions: 0, n_failed: 0 }
    menuMap[key].n_actions++
    if (e.outcome === 'failed') menuMap[key].n_failed++
  })
  for (const m of Object.values(menuMap)) {
    await pool.query(
      `INSERT INTO usage_fact_menu_usage (hospital_id, import_batch_id, menu_group, menu_label, username, action, n_actions, n_failed) VALUES (?,?,?,?,?,?,?,?)`,
      [hospitalId, batchId, m.menuGroup, m.menuGroup, m.username, m.action, m.n_actions, m.n_failed]
    )
  }

  // ── hourly ──
  const hourlyMap = {}
  events.forEach(e => {
    const dow = (new Date(`${e.date}T00:00:00`).getDay() + 6) % 7 + 1 // iso: 1=จันทร์..7=อาทิตย์
    const key = `${dow}|${e.hour}`
    if (!hourlyMap[key]) hourlyMap[key] = { dow, hour: e.hour, n_actions: 0, users: new Set() }
    hourlyMap[key].n_actions++; hourlyMap[key].users.add(e.username)
  })
  for (const h of Object.values(hourlyMap)) {
    await pool.query(
      `INSERT INTO usage_fact_hourly (hospital_id, import_batch_id, iso_dow, hour, n_actions, n_users) VALUES (?,?,?,?,?,?)`,
      [hospitalId, batchId, h.dow, h.hour, h.n_actions, h.users.size]
    )
  }

  // ── failures ──
  const FAIL_REASONS = ['ข้อมูลไม่ครบถ้วน', 'เลขที่เอกสารซ้ำ', 'หมดเวลาเชื่อมต่อ (timeout)', 'สิทธิ์การใช้งานไม่เพียงพอ']
  for (const e of events.filter(x => x.outcome === 'failed')) {
    await pool.query(
      `INSERT INTO usage_fact_failure (hospital_id, import_batch_id, activity_date, username, menu_group, menu_label, action, status_code, error_message, n)
       VALUES (?,?,?,?,?,?,?,?,?,1)`,
      [hospitalId, batchId, e.date, e.username, e.menuGroup, e.menuGroup, e.action, 'ERR_4' + (1 + Math.floor(Math.random() * 9)), FAIL_REASONS[Math.floor(Math.random() * FAIL_REASONS.length)]]
    )
  }

  // ── login ──
  for (const l of loginPlan) {
    await pool.query(
      `INSERT INTO usage_fact_login (hospital_id, import_batch_id, occurred_at, event, username, outcome, failure_reason, ip_address) VALUES (?,?,?,?,?,?,?,?)`,
      [hospitalId, batchId, l.occurredAt, l.event, l.username, l.outcome, l.failureReason || null, l.ip || '10.0.0.' + (1 + Math.floor(Math.random() * 50))]
    )
  }

  // ── journal_monthly (upsert ตาม hcode+ym+source_type+posted_flag) ──
  for (const [ym, nEntries] of Object.entries(journalByYm)) {
    await pool.query(
      `INSERT INTO usage_fact_journal_monthly (hospital_id, import_batch_id, ym, source_type, posted_flag, n_entries, debit_total, last_update)
       VALUES (?,?,?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE import_batch_id=VALUES(import_batch_id), n_entries=VALUES(n_entries), debit_total=VALUES(debit_total), last_update=VALUES(last_update)`,
      [hospitalId, batchId, ym, 'journal', 'posted', nEntries, nEntries * 15000]
    )
  }

  const score = await computeUsageScore(pool, { hospitalId, periodStart, periodEnd, importBatchId: batchId })
  return { batchId, score }
}

// ═══════════════════════════ 1) โรงพยาบาลทดสอบระบบ — ตรงตาม spec ข้อ 7 ═══════════════════════════
async function seedTestHospital() {
  const hospitalId = await getOrCreateHospital('00000', 'โรงพยาบาลทดสอบระบบ', 'กรุงเทพมหานคร', 'เขต 13', '2026-08-01')
  const periodStart = '2026-09-08', periodEnd = '2026-10-07'

  const users = [
    { username: 'dennapa', fullName: 'เด่นนภา ทีมติดตั้ง', position: 'เจ้าหน้าที่ติดตั้งระบบ', userGroups: 'Admin|Implementation', status: 'ใช้งาน', lastLogin: '2026-10-07 16:40:00' },
    { username: 'it1', fullName: 'ศุภกิจ ไอที', position: 'นักวิชาการคอมพิวเตอร์', userGroups: 'IT', status: 'ใช้งาน', lastLogin: '2026-10-07 11:20:00' },
    { username: 'it2', fullName: 'ปวีณา ไอที', position: 'นักวิชาการคอมพิวเตอร์', userGroups: 'IT', status: 'ใช้งาน', lastLogin: '2026-10-06 09:10:00' },
    { username: 'finance1', fullName: 'มาลี เจ้าพนักงานการเงิน', position: 'เจ้าพนักงานการเงินและบัญชี', userGroups: 'Finance', status: 'ใช้งาน', lastLogin: '2026-10-05 14:00:00' },
    { username: 'tester1', fullName: 'กิตติ ทดสอบระบบ', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: 'Tester', status: 'ใช้งาน', lastLogin: '2026-10-07 15:00:00' },
    { username: 'tester2', fullName: 'สมฤดี ทดสอบระบบ', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: 'Tester', status: 'ใช้งาน', lastLogin: '2026-10-04 10:00:00' },
    { username: 'tester3', fullName: 'อรุณ ทดสอบระบบ', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: 'Tester', status: 'ใช้งาน', lastLogin: '2026-10-03 13:00:00' },
    { username: 'tester4', fullName: 'ชลธิชา ทดสอบระบบ', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: 'Tester', status: 'ใช้งาน', lastLogin: '2026-09-30 09:00:00' },
    { username: 'tester5', fullName: 'ภานุวัฒน์ ทดสอบระบบ', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: 'Tester', status: 'ใช้งาน', lastLogin: '2026-09-28 09:00:00' },
    { username: 'tester6', fullName: 'นงลักษณ์ ทดสอบระบบ', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: 'Tester', status: 'ใช้งาน', lastLogin: '2026-09-25 09:00:00' },
    { username: 'viewer1', fullName: 'ธนาคาร ผู้ชม', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: 'Viewer', status: 'ใช้งาน', lastLogin: '2026-10-02 09:00:00' },
    { username: 'viewer2', fullName: 'กานดา ผู้ชม', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: 'Viewer', status: 'ใช้งาน', lastLogin: '2026-09-20 09:00:00' },
    { username: 'unused1', fullName: 'บัญชีสำรอง 1', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: '', status: 'ใช้งาน', lastLogin: null },
    { username: 'unused2', fullName: 'บัญชีสำรอง 2', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: '', status: 'ใช้งาน', lastLogin: null },
    { username: 'unused3', fullName: 'บัญชีสำรอง 3', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: '', status: 'ใช้งาน', lastLogin: null },
    { username: 'unused4', fullName: 'บัญชีสำรอง 4', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: '', status: 'ใช้งาน', lastLogin: null },
    { username: 'unused5', fullName: 'บัญชีสำรอง 5', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: '', status: 'ใช้งาน', lastLogin: null },
    { username: 'unused6', fullName: 'บัญชีสำรอง 6', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: '', status: 'ใช้งาน', lastLogin: null },
    { username: 'unused7', fullName: 'บัญชีสำรอง 7', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: '', status: 'ใช้งาน', lastLogin: null },
    { username: 'old_admin', fullName: 'ผู้ดูแลระบบเก่า', position: 'เจ้าหน้าที่ทดสอบระบบ', userGroups: 'Admin', status: 'ใช้งาน', lastLogin: '2026-07-01 09:00:00' },
  ] // 20 บัญชี

  const actionCounts = { edit: 853, add: 551, import: 125, export: 122, delete: 73, post: 11 } // รวม 1735
  const categoryCounts = {
    'ระบบลูกหนี้': 255, 'ระบบเจ้าหนี้': 213, 'ระบบบัญชี': 78, 'เมนูรายได้': 50, 'ครุภัณฑ์': 46, // operational 642
    'ข้อมูลพื้นฐานระบบบัญชี': 250, 'ข้อมูลพื้นฐานระบบเจ้าหนี้': 230, 'ข้อมูลพื้นฐานระบบลูกหนี้': 200, 'ความปลอดภัย': 118, // setup 798
    'รายงาน': 250, 'ผู้ช่วย AI': 45, // reporting 295
  }
  const outcomeCounts = { success: 1675, failed: 60 }
  const hourCounts = { in: 1513, out: 222 }
  // งานโดย finance1 (hospital_staff) ต้องมีแค่ 2 ครั้งเป๊ะ ที่เหลือกระจายในผู้ใช้ active อีก 10 คน (รวม 1733)
  const activeUserNames = ['dennapa', 'it1', 'it2', 'tester1', 'tester2', 'tester3', 'tester4', 'tester5', 'tester6', 'viewer1']
  const weights = activeUserNames.map(() => 0.5 + Math.random())
  const wsum = weights.reduce((a, b) => a + b, 0)
  let remaining = 1733
  const userCounts = { finance1: 2 }
  activeUserNames.forEach((name, i) => {
    const c = i === activeUserNames.length - 1 ? remaining : Math.round((weights[i] / wsum) * 1733)
    userCounts[name] = Math.max(1, c)
    remaining -= userCounts[name]
  })

  // login: 183 สำเร็จ (กระจาย 13 คน = 11 active + viewer2 + old_admin), login_failed 12 (รหัสผิด 9, ล็อก 3), license_activate ล้มเหลว 2
  const loginUsers = [...activeUserNames, 'finance1', 'viewer2', 'old_admin'] // 13 คน
  const loginPlan = []
  const successCounts = {}
  loginUsers.forEach(u => { successCounts[u] = 0 })
  for (let i = 0; i < 183; i++) successCounts[loginUsers[i % loginUsers.length]]++
  let li = 0
  for (const [username, cnt] of Object.entries(successCounts)) {
    for (let k = 0; k < cnt; k++) {
      const day = businessDaysBetween(new Date(periodStart), new Date(periodEnd))[li % 22]
      loginPlan.push({ occurredAt: `${dstr(day)} ${pad2(8 + Math.floor(Math.random() * 9))}:${pad2(Math.floor(Math.random() * 60))}:00`, event: 'login', username, outcome: 'success' })
      li++
    }
  }
  for (let i = 0; i < 9; i++) loginPlan.push({ occurredAt: `${periodEnd} ${pad2(8 + i)}:00:00`, event: 'login_failed', username: loginUsers[i % loginUsers.length], outcome: 'failed', failureReason: 'รหัสผ่านไม่ถูกต้อง' })
  for (let i = 0; i < 3; i++) loginPlan.push({ occurredAt: `${periodEnd} ${pad2(9 + i)}:30:00`, event: 'login_failed', username: 'old_admin', outcome: 'failed', failureReason: 'บัญชีถูกล็อก' })
  for (let i = 0; i < 2; i++) loginPlan.push({ occurredAt: `${periodEnd} ${pad2(10 + i)}:15:00`, event: 'license_activate', username: loginUsers[i], outcome: 'failed', failureReason: 'สิทธิ์การใช้งาน (License) หมดอายุ' })

  const journalByYm = { 202606: 20, 202607: 38, 202608: 27, 202609: 68, 202610: 4 }

  const { score } = await seedPeriod(hospitalId, periodStart, periodEnd, users, actionCounts, categoryCounts, outcomeCounts, hourCounts, userCounts, loginPlan, journalByYm, 'USAGE_00000_202610.xlsx', 21)
  console.log('✅ โรงพยาบาลทดสอบระบบ seed เสร็จ — usage score:', score.usageScore, score.usageLevel, '| hospital_staff_rate:', score.hospitalStaffRate + '%')
}

// ═══════════════════════════ 2) จำลองข้อมูล รพ. จริง 15 แห่ง (คะแนนหลายระดับ, บางเดือนไม่ส่ง) ═══════════════════════════
function randomUsers(n, staffShare) {
  const users = []
  const nStaff = Math.round(n * staffShare)
  for (let i = 0; i < n; i++) {
    const isStaff = i < nStaff
    users.push({
      username: `u${i + 1}`, fullName: `ผู้ใช้ทดสอบ ${i + 1}`,
      position: isStaff ? 'เจ้าพนักงานการเงินและบัญชี' : 'นักวิชาการคอมพิวเตอร์',
      userGroups: i === 0 ? 'Admin' : 'Staff', status: 'ใช้งาน',
      lastLogin: Math.random() < 0.85 ? '2026-10-0' + (1 + Math.floor(Math.random() * 7)) + ' 10:00:00' : null,
    })
  }
  return users
}

async function seedRealHospitalPeriod(hospitalId, periodStart, periodEnd, tier, fileName) {
  // tier: 'high' | 'mid' | 'low'
  const cfg = {
    high: { n: 14, staffShare: 0.75, total: 1400, active: 11, login: 12, fail: 20, offhours: 120, bizActiveRatio: 0.9 },
    mid: { n: 10, staffShare: 0.4, total: 600, active: 6, login: 7, fail: 30, offhours: 160, bizActiveRatio: 0.55 },
    low: { n: 6, staffShare: 0.1, total: 120, active: 3, login: 3, fail: 15, offhours: 40, bizActiveRatio: 0.2 },
  }[tier]

  const users = randomUsers(cfg.n, cfg.staffShare)
  const activeUserNames = users.slice(0, cfg.active).map(u => u.username)
  const weights = activeUserNames.map(() => 0.5 + Math.random())
  const wsum = weights.reduce((a, b) => a + b, 0)
  const userCounts = {}
  let remaining = cfg.total
  activeUserNames.forEach((name, i) => {
    const c = i === activeUserNames.length - 1 ? remaining : Math.round((weights[i] / wsum) * cfg.total)
    userCounts[name] = Math.max(1, c)
    remaining -= userCounts[name]
  })
  const actualTotal = Object.values(userCounts).reduce((a, b) => a + b, 0)

  const actionCounts = { edit: Math.round(actualTotal * 0.45), add: Math.round(actualTotal * 0.28), import: Math.round(actualTotal * 0.1), export: Math.round(actualTotal * 0.08), delete: Math.round(actualTotal * 0.06) }
  actionCounts.post = actualTotal - Object.values(actionCounts).reduce((a, b) => a + b, 0)
  if (actionCounts.post < 0) { actionCounts.edit += actionCounts.post; actionCounts.post = 0 }

  const opShare = cfg.bizActiveRatio > 0.7 ? 0.55 : cfg.bizActiveRatio > 0.4 ? 0.3 : 0.08
  const opTotal = Math.round(actualTotal * opShare)
  const categoryCounts = {
    'ระบบลูกหนี้': Math.round(opTotal * 0.3), 'ระบบเจ้าหนี้': Math.round(opTotal * 0.3), 'ระบบบัญชี': Math.round(opTotal * 0.2),
    'เมนูรายได้': Math.round(opTotal * 0.15), 'ครุภัณฑ์': opTotal - Math.round(opTotal * 0.95),
  }
  const restTotal = actualTotal - Object.values(categoryCounts).reduce((a, b) => a + b, 0)
  categoryCounts['ข้อมูลพื้นฐานระบบบัญชี'] = Math.round(restTotal * 0.4)
  categoryCounts['ข้อมูลพื้นฐานระบบเจ้าหนี้'] = Math.round(restTotal * 0.25)
  categoryCounts['ข้อมูลพื้นฐานระบบลูกหนี้'] = Math.round(restTotal * 0.2)
  categoryCounts['ความปลอดภัย'] = Math.round(restTotal * 0.05)
  categoryCounts['รายงาน'] = restTotal - (categoryCounts['ข้อมูลพื้นฐานระบบบัญชี'] + categoryCounts['ข้อมูลพื้นฐานระบบเจ้าหนี้'] + categoryCounts['ข้อมูลพื้นฐานระบบลูกหนี้'] + categoryCounts['ความปลอดภัย'])
  categoryCounts['ผู้ช่วย AI'] = 0
  // แก้ปัดเศษให้รวมเท่า actualTotal เป๊ะ (เติม/หักที่ "รายงาน")
  const catSum = Object.values(categoryCounts).reduce((a, b) => a + b, 0)
  categoryCounts['รายงาน'] += (actualTotal - catSum)

  const outcomeCounts = { success: actualTotal - cfg.fail, failed: cfg.fail }
  const hourCounts = { in: actualTotal - cfg.offhours, out: cfg.offhours }

  const loginUsers = users.slice(0, cfg.login).map(u => u.username)
  const loginPlan = []
  for (let i = 0; i < cfg.login * 10; i++) {
    const day = businessDaysBetween(new Date(periodStart), new Date(periodEnd))
    const d = day[Math.floor(Math.random() * day.length)]
    loginPlan.push({ occurredAt: `${dstr(d)} ${pad2(8 + Math.floor(Math.random() * 9))}:${pad2(Math.floor(Math.random() * 60))}:00`, event: 'login', username: loginUsers[i % loginUsers.length], outcome: 'success' })
  }

  const ym = periodEnd.slice(0, 4) + periodEnd.slice(5, 7)
  const journalByYm = cfg.bizActiveRatio > 0.3 ? { [ym]: Math.round(actualTotal * 0.03) } : {}

  return seedPeriod(hospitalId, periodStart, periodEnd, users, actionCounts, categoryCounts, outcomeCounts, hourCounts, userCounts, loginPlan, journalByYm, fileName)
}

async function seedRealHospitals() {
  const [hosps] = await pool.query("SELECT id, name FROM hospitals WHERE code <> '00000' AND code <> '' ORDER BY id")
  const tiers = ['high', 'high', 'mid', 'mid', 'mid', 'low', 'low', 'high', 'mid', 'low', 'high', 'mid', 'low', 'mid', 'high']
  const periods = [
    ['2026-08-01', '2026-08-31'],
    ['2026-09-01', '2026-09-30'],
    ['2026-10-01', '2026-10-07'],
  ]
  for (let i = 0; i < hosps.length; i++) {
    const tier = tiers[i % tiers.length]
    for (let p = 0; p < periods.length; p++) {
      // จำลอง รพ. บางแห่งไม่ส่งข้อมูลบางเดือน (เว้น batch นั้นไปเลย)
      if (tier === 'low' && p === 1) continue
      const [periodStart, periodEnd] = periods[p]
      const fname = `USAGE_${String(i).padStart(5, '0')}_${periodEnd.slice(0, 4)}${periodEnd.slice(5, 7)}.xlsx`
      await seedRealHospitalPeriod(hosps[i].id, periodStart, periodEnd, tier, fname)
    }
    console.log(`✅ ${hosps[i].name} (${tier}) seed เสร็จ`)
  }
}

async function main() {
  await seedTestHospital()
  await seedRealHospitals()
  console.log('🎉 Seed ข้อมูล Usage ทั้งหมดเสร็จสิ้น')
  process.exit(0)
}

main().catch(e => { console.error('❌ Seed error:', e); process.exit(1) })
