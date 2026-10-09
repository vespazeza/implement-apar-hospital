// คำนวณ KPI + Usage Score ของ "แดชบอร์ด Usage ผู้ใช้งาน" (login/user activity ของ BMS-Accounting)
// เขียนแยกจาก server.js เพราะสูตรเยอะ — เรียกใช้หลังนำเข้าแต่ละ batch เพื่อเก็บผลลัพธ์ไว้ล่วงหน้าใน usage_score_monthly
// หมายเหตุ: MySQL ที่ใช้งานจริงเป็น MariaDB 10.0.17 (ไม่รองรับ window function / CTE) จึงคำนวณรวมที่ฝั่ง Node แทนการเขียน SQL view

const BUSINESS_HOURS_START = 8   // ก่อน 08:00 = นอกเวลา
const BUSINESS_HOURS_END = 17    // ตั้งแต่ 17:00 = นอกเวลา

const pad2 = (n) => String(n).padStart(2, '0')
const ymOf = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}`
const toDate = (s) => (s instanceof Date ? s : new Date(`${String(s).slice(0, 10)}T00:00:00`))

// รายชื่อ YYYYMM ที่งวดนี้ครอบคลุม (รวมเดือนต้น-ปลายงวด)
function monthsInPeriod(periodStart, periodEnd) {
  const out = []
  const d = new Date(toDate(periodStart).getFullYear(), toDate(periodStart).getMonth(), 1)
  const end = toDate(periodEnd)
  while (d <= end) {
    out.push(ymOf(d))
    d.setMonth(d.getMonth() + 1)
  }
  return out
}

// นับวันทำการ (ไม่รวมเสาร์-อาทิตย์ และวันหยุดราชการที่ active) ในช่วงวันที่
async function countBusinessDays(pool, periodStart, periodEnd) {
  const [holidays] = await pool.query(
    `SELECT holiday_date, holiday_end_date FROM holiday WHERE is_active='Y' AND holiday_date <= ? AND COALESCE(holiday_end_date, holiday_date) >= ?`,
    [periodEnd, periodStart]
  )
  const holidaySet = new Set()
  holidays.forEach(h => {
    const start = toDate(h.holiday_date)
    const end = h.holiday_end_date ? toDate(h.holiday_end_date) : start
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) holidaySet.add(d.toISOString().slice(0, 10))
  })
  let count = 0
  for (let d = new Date(toDate(periodStart)); d <= toDate(periodEnd); d.setDate(d.getDate() + 1)) {
    const dow = d.getDay() // 0=Sun..6=Sat
    const key = d.toISOString().slice(0, 10)
    if (dow !== 0 && dow !== 6 && !holidaySet.has(key)) count++
  }
  return count
}

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 10000) / 100 : 0)

async function computeUsageScore(pool, { hospitalId, periodStart, periodEnd, importBatchId }) {
  const months = monthsInPeriod(periodStart, periodEnd)

  // ── mapping tables ──────────────────────────────────────────────────────────
  const [menuCatRows] = await pool.query('SELECT menu_group, category FROM usage_dim_menu_category')
  const menuCat = {}
  menuCatRows.forEach(r => { menuCat[r.menu_group] = r.category })
  const categoryOf = (mg) => menuCat[mg] || 'other'

  const [posRoleRows] = await pool.query('SELECT position, role FROM usage_dim_position_role')
  const posRole = {}
  posRoleRows.forEach(r => { posRole[r.position] = r.role })

  const [overrideRows] = await pool.query('SELECT username, role FROM usage_user_role_override WHERE hospital_id=?', [hospitalId])
  const roleOverride = {}
  overrideRows.forEach(r => { roleOverride[r.username] = r.role })

  const [postedFlagRows] = await pool.query('SELECT raw_value, is_posted FROM usage_dim_posted_flag')
  const postedMap = {}
  postedFlagRows.forEach(r => { postedMap[r.raw_value] = !!r.is_posted })

  // ── snapshot_user (บัญชีผู้ใช้ ณ งวดนี้) ───────────────────────────────────────
  const [snapUsers] = await pool.query('SELECT * FROM usage_snapshot_user WHERE import_batch_id=?', [importBatchId])
  const positionByUser = {}
  const roleFromFile = {}
  snapUsers.forEach(u => { positionByUser[u.username] = u.position; if (u.role) roleFromFile[u.username] = u.role })
  // ลำดับความสำคัญ: 1) override รายคนที่ตั้งไว้เอง 2) role ที่ไฟล์ USERS ส่งมาตรงๆ
  // 3) เดาจากตำแหน่ง (fallback กรณีไฟล์เก่าไม่มีคอลัมน์ role) 4) ดีฟอลต์ vendor_it (ระมัดระวังไว้ก่อน)
  const resolveRole = (username) => roleOverride[username] || roleFromFile[username] || posRole[positionByUser[username]] || 'vendor_it'

  const nUsersTotal = snapUsers.filter(u => (u.status || '').toLowerCase().includes('active') || (u.status || '').includes('ใช้งาน')).length
  const importDate = new Date()
  const inactiveAccountCount = snapUsers.filter(u => {
    const isActiveStatus = (u.status || '').toLowerCase().includes('active') || (u.status || '').includes('ใช้งาน')
    if (!isActiveStatus) return false
    if (!u.last_login) return true
    return (importDate - new Date(u.last_login)) / 86400000 > 30
  }).length
  const adminAccountRate = pct(snapUsers.filter(u => (u.user_groups || '').includes('Admin')).length, snapUsers.length)

  // ── login ────────────────────────────────────────────────────────────────────
  const [loginRows] = await pool.query('SELECT event, outcome, username FROM usage_fact_login WHERE import_batch_id=?', [importBatchId])
  const nUsersLogin = new Set(loginRows.filter(r => r.event === 'login' && r.outcome === 'success').map(r => r.username)).size
  const loginFailedCount = loginRows.filter(r => r.event === 'login_failed').length

  // ── user_activity ───────────────────────────────────────────────────────────
  const [userActRows] = await pool.query('SELECT * FROM usage_fact_user_activity WHERE import_batch_id=?', [importBatchId])
  const nUsersActive = userActRows.filter(r => r.n_actions > 0).length
  const sumUA = (k) => userActRows.reduce((s, r) => s + Number(r[k] || 0), 0)
  const nActionsTotal = sumUA('n_actions')
  const nFailedTotal = sumUA('n_failed')
  const nOffhoursTotal = sumUA('n_offhours')
  const successRate = pct(nActionsTotal - nFailedTotal, nActionsTotal)
  const offhoursRate = pct(nOffhoursTotal, nActionsTotal)
  const hospitalStaffActions = userActRows.reduce((s, r) => s + (resolveRole(r.username) === 'hospital_staff' ? Number(r.n_actions || 0) : 0), 0)
  const hospitalStaffRate = pct(hospitalStaffActions, nActionsTotal)

  // ── daily_activity (หมวดงาน + วันทำการที่ใช้งาน) ───────────────────────────────
  const [dailyRows] = await pool.query('SELECT activity_date, menu_group, n_actions FROM usage_fact_daily_activity WHERE import_batch_id=?', [importBatchId])
  let nOperational = 0, nSetup = 0, nReporting = 0
  const activeDateSet = new Set()
  dailyRows.forEach(r => {
    const cat = categoryOf(r.menu_group)
    if (cat === 'operational') nOperational += Number(r.n_actions || 0)
    else if (cat === 'setup') nSetup += Number(r.n_actions || 0)
    else if (cat === 'reporting') nReporting += Number(r.n_actions || 0)
    if (Number(r.n_actions || 0) > 0) activeDateSet.add(String(r.activity_date).slice(0, 10))
  })
  // นับวันทำการจากวันเริ่มโครงการจริง (แผนการปฏิบัติงาน) ถ้าโครงการเริ่มหลังวันเริ่มงวด — กันไม่ให้
  // วันก่อนโครงการเริ่มถูกนับเป็น "ไม่ได้ใช้งาน" ทำให้ % ต่ำเกินจริงสำหรับ รพ. ที่เพิ่งเริ่มกลางงวด
  const [planRows] = await pool.query('SELECT MIN(start_date) as start_date FROM project_plans WHERE hospital_id=? AND start_date IS NOT NULL', [hospitalId])
  const projectStartDate = planRows[0]?.start_date || null
  const businessDaysFrom = (projectStartDate && toDate(projectStartDate) > toDate(periodStart) && toDate(projectStartDate) <= toDate(periodEnd))
    ? String(projectStartDate).slice(0, 10)
    : periodStart
  const businessDays = await countBusinessDays(pool, businessDaysFrom, periodEnd)
  const activeBusinessDays = [...activeDateSet].filter(ds => {
    const d = new Date(`${ds}T00:00:00`); const dow = d.getDay()
    return dow !== 0 && dow !== 6
  }).length
  const businessDayRate = pct(activeBusinessDays, businessDays)
  const operationalTotal = nOperational + nSetup + nReporting
  const operationalRate = pct(nOperational, operationalTotal)

  // ── menu_usage (ความครอบคลุมระบบงาน operational ≥10 ครั้ง) ──────────────────────
  const [menuUsageRows] = await pool.query('SELECT menu_group, SUM(n_actions) as total FROM usage_fact_menu_usage WHERE import_batch_id=? GROUP BY menu_group', [importBatchId])
  const OPERATIONAL_SYSTEMS = ['ระบบลูกหนี้', 'ระบบเจ้าหนี้', 'ระบบบัญชี', 'เมนูรายได้', 'ครุภัณฑ์']
  const coveredSystems = OPERATIONAL_SYSTEMS.filter(sys => menuUsageRows.some(r => r.menu_group === sys && Number(r.total) >= 10))
  const systemCoverage = coveredSystems.length

  // ── journal_monthly (เดือนในงวด) ────────────────────────────────────────────
  const [journalRows] = await pool.query(
    `SELECT ym, posted_flag, n_entries FROM usage_fact_journal_monthly WHERE hospital_id=? AND ym IN (${months.map(() => '?').join(',') || 'NULL'})`,
    [hospitalId, ...months]
  )
  const journalEntries = journalRows.reduce((s, r) => s + Number(r.n_entries || 0), 0)
  const journalPosted = journalRows.reduce((s, r) => s + (postedMap[r.posted_flag] ? Number(r.n_entries || 0) : 0), 0)
  const journalPostedRate = pct(journalPosted, journalEntries)

  // ── Usage Score ──────────────────────────────────────────────────────────────
  const [cfgRows] = await pool.query('SELECT setting_value FROM usage_kpi_settings WHERE setting_key=?', ['kpi_config'])
  const cfg = cfgRows.length ? JSON.parse(cfgRows[0].setting_value) : null
  // active_user_rate (15%) ตัดออกจากสูตรแล้ว — ไม่เก็บข้อมูล LOGINS อีกต่อไป จึงจะเป็น 0 เสมอถ้ายังรวมอยู่
  // กระจายน้ำหนักที่เหลือให้ 4 องค์ประกอบตามสัดส่วนเดิม (25/25/20/15 -> 29/29/24/18)
  const w = cfg?.weights || { business_day_rate: 29, hospital_staff_rate: 29, system_coverage: 24, has_journal: 18 }
  const activeUserRate = pct(nUsersLogin, nUsersTotal) // เก็บไว้เป็นข้อมูลอ้างอิงเฉยๆ ไม่ใช้คำนวณคะแนนแล้ว
  const systemCoveragePct = pct(systemCoverage, 5)
  const hasJournalPct = journalEntries > 0 ? 100 : 0
  const usageScore = Math.round((
    businessDayRate * w.business_day_rate +
    hospitalStaffRate * w.hospital_staff_rate +
    systemCoveragePct * w.system_coverage +
    hasJournalPct * w.has_journal
  ) / 100 * 100) / 100

  const levels = cfg?.levels || [
    { min: 80, label: 'ใช้งานจริงเต็มรูปแบบ' }, { min: 50, label: 'ใช้งานบางส่วน' },
    { min: 20, label: 'เริ่มต้น/ตั้งค่า' }, { min: 0, label: 'ไม่มีการใช้งาน' },
  ]
  const usageLevel = (levels.find(l => usageScore >= l.min) || levels[levels.length - 1]).label

  const row = {
    hospitalId, importBatchId, periodStart, periodEnd, ym: ymOf(toDate(periodEnd)),
    nUsersTotal, nUsersLogin, nUsersActive, activeUserRate,
    businessDays, activeBusinessDays, businessDayRate, businessDaysFrom,
    nActionsTotal, nActionsOperational: nOperational, nActionsSetup: nSetup, nActionsReporting: nReporting,
    operationalRate, hospitalStaffRate, systemCoverage,
    journalEntries, journalPostedRate, successRate, offhoursRate,
    loginFailedCount, inactiveAccountCount, adminAccountRate,
    usageScore, usageLevel,
  }

  await pool.query(
    `INSERT INTO usage_score_monthly
      (hospital_id, import_batch_id, period_start, period_end, ym,
       n_users_total, n_users_login, n_users_active, active_user_rate,
       business_days, active_business_days, business_day_rate, business_days_from,
       n_actions_total, n_actions_operational, n_actions_setup, n_actions_reporting,
       operational_rate, hospital_staff_rate, system_coverage,
       journal_entries, journal_posted_rate, success_rate, offhours_rate,
       login_failed_count, inactive_account_count, admin_account_rate,
       usage_score, usage_level)
     VALUES (?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?, ?,?,?, ?,?)
     ON DUPLICATE KEY UPDATE
       import_batch_id=VALUES(import_batch_id), period_start=VALUES(period_start), period_end=VALUES(period_end),
       n_users_total=VALUES(n_users_total), n_users_login=VALUES(n_users_login), n_users_active=VALUES(n_users_active), active_user_rate=VALUES(active_user_rate),
       business_days=VALUES(business_days), active_business_days=VALUES(active_business_days), business_day_rate=VALUES(business_day_rate), business_days_from=VALUES(business_days_from),
       n_actions_total=VALUES(n_actions_total), n_actions_operational=VALUES(n_actions_operational), n_actions_setup=VALUES(n_actions_setup), n_actions_reporting=VALUES(n_actions_reporting),
       operational_rate=VALUES(operational_rate), hospital_staff_rate=VALUES(hospital_staff_rate), system_coverage=VALUES(system_coverage),
       journal_entries=VALUES(journal_entries), journal_posted_rate=VALUES(journal_posted_rate), success_rate=VALUES(success_rate), offhours_rate=VALUES(offhours_rate),
       login_failed_count=VALUES(login_failed_count), inactive_account_count=VALUES(inactive_account_count), admin_account_rate=VALUES(admin_account_rate),
       usage_score=VALUES(usage_score), usage_level=VALUES(usage_level)`,
    [hospitalId, importBatchId, periodStart, periodEnd, row.ym,
      nUsersTotal, nUsersLogin, nUsersActive, activeUserRate,
      businessDays, activeBusinessDays, businessDayRate, businessDaysFrom,
      nActionsTotal, nOperational, nSetup, nReporting,
      operationalRate, hospitalStaffRate, systemCoverage,
      journalEntries, journalPostedRate, successRate, offhoursRate,
      loginFailedCount, inactiveAccountCount, adminAccountRate,
      usageScore, usageLevel]
  )

  return row
}

module.exports = { computeUsageScore, countBusinessDays, monthsInPeriod }
