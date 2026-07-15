const express = require('express')
const mysql = require('mysql2/promise')
const cors = require('cors')
const path = require('path')
const fs = require('fs')

const app = express()
app.use(cors())
app.use(express.json())

// Serve React frontend (production build)
app.use(express.static(path.join(__dirname, '../dist')))

const pool = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
  port: Number(process.env.MYSQLPORT || process.env.DB_PORT) || 3307,
  user: process.env.MYSQLUSER || process.env.DB_USER || 'vespazeza',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASS || '64120482',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'acc_system_setup',
  charset: 'utf8mb4',
  waitForConnections: true, connectionLimit: 10,
  dateStrings: true,   // คืนค่า DATE/DATETIME เป็น string 'YYYY-MM-DD' แทน Date object
})

// ตั้งค่า charset utf8mb4 ทุก connection เพื่อให้ภาษาไทยแสดงผลถูกต้อง
pool.on('connection', (conn) => {
  conn.query("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'")
})

const nd = (d) => (d && d !== '' ? d : null)   // nullDate
const nn = (n) => (n !== '' && n != null ? Number(n) : null)  // nullNum

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', message: '✅ AP/AR API Server กำลังทำงาน' }))

app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT VERSION() as ver, NOW() as now')
    res.json({ db: 'connected', version: rows[0].ver, time: rows[0].now })
  } catch (e) {
    res.status(500).json({ db: 'error', message: e.message })
  }
})

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const [r] = await pool.query(
      'SELECT id, username, name FROM users WHERE username=? AND password=?',
      [req.body.username, req.body.password])
    if (!r.length) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' })
    res.json(r[0])
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name } = req.body
    const [r] = await pool.query(
      'INSERT INTO users (username,password,name) VALUES (?,?,?)', [username, password, name])
    res.json({ id: r.insertId, username, name })
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' })
    res.status(500).json({ error: e.message })
  }
})

// ─── Hospitals ────────────────────────────────────────────────────────────────
app.get('/api/hospitals', async (req, res) => {
  try {
    const [r] = await pool.query('SELECT * FROM hospitals ORDER BY name')
    res.json(r.map(h => ({
      id: h.id, name: h.name, code: h.code || '', type: h.type || '',
      province: h.province || '', region: h.region || '', affiliation: h.affiliation || '',
      address: h.address || '', bedCount: h.bed_count || 0, userCount: h.user_count || 0, userCountAr: h.user_count_ar || 0,
      coordinator: h.coordinator || '', coordinatorPhone: h.coordinator_phone || '',
      coordinatorEmail: h.coordinator_email || '',
      itContact: h.it_contact || '', itPhone: h.it_phone || '', note: h.note || '',
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/hospitals', async (req, res) => {
  try {
    const d = req.body
    const [r] = await pool.query(
      `INSERT INTO hospitals (name,code,type,province,region,affiliation,address,
        bed_count,user_count,user_count_ar,coordinator,coordinator_phone,coordinator_email,it_contact,it_phone,note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.name,d.code,d.type,d.province,d.region,d.affiliation,d.address,
       nn(d.bedCount),nn(d.userCount),nn(d.userCountAr),d.coordinator,d.coordinatorPhone,d.coordinatorEmail,
       d.itContact,d.itPhone,d.note])
    res.json({ id: r.insertId, ...d })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/hospitals/:id', async (req, res) => {
  try {
    const d = req.body
    await pool.query(
      `UPDATE hospitals SET name=?,code=?,type=?,province=?,region=?,affiliation=?,address=?,
        bed_count=?,user_count=?,user_count_ar=?,coordinator=?,coordinator_phone=?,coordinator_email=?,
        it_contact=?,it_phone=?,note=? WHERE id=?`,
      [d.name,d.code,d.type,d.province,d.region,d.affiliation,d.address,
       nn(d.bedCount),nn(d.userCount),nn(d.userCountAr),d.coordinator,d.coordinatorPhone,d.coordinatorEmail,
       d.itContact,d.itPhone,d.note, req.params.id])
    res.json({ id: Number(req.params.id), ...d })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/hospitals/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM hospitals WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Team Members ─────────────────────────────────────────────────────────────
app.get('/api/team', async (req, res) => {
  try {
    const [r] = await pool.query('SELECT * FROM team_members ORDER BY name')
    res.json(r)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/team', async (req, res) => {
  try {
    const { name, position, nickname } = req.body
    const [r] = await pool.query('INSERT INTO team_members (name,position,nickname) VALUES (?,?,?)', [name, position, nickname || null])
    res.json({ id: r.insertId, name, position, nickname: nickname || '' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/team/:id', async (req, res) => {
  try {
    const { name, position, nickname } = req.body
    console.log(`[PUT /api/team/${req.params.id}]`, { name, position, nickname })
    await pool.query('UPDATE team_members SET name=?,position=?,nickname=? WHERE id=?',
      [name, position, nickname || null, req.params.id])
    console.log(`[PUT /api/team] บันทึกสำเร็จ id=${req.params.id} nickname="${nickname}"`)
    res.json({ id: Number(req.params.id), name, position, nickname: nickname || '' })
  } catch (e) {
    console.error('[PUT /api/team] ERROR:', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/team/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM team_members WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Project Plans ────────────────────────────────────────────────────────────
app.get('/api/plans', async (req, res) => {
  try {
    const [plans] = await pool.query('SELECT * FROM project_plans ORDER BY online_start, created_at')
    const [teams] = await pool.query('SELECT * FROM project_plan_team')
    res.json(plans.map(p => ({
      id: p.id, projectName: p.project_name,
      hospitalId: p.hospital_id ? String(p.hospital_id) : '',
      siteOwner: p.site_owner || '', teamLeader: p.team_leader || '',
      installType: p.install_type || '',
      budget: p.budget || '', onlineStart: p.online_start || '',
      onlineEnd: p.online_end || '', startDate: p.start_date || '',
      endDate: p.end_date || '', revisit1: p.revisit1 || '',
      revisit2: p.revisit2 || '', status: p.status || 'waiting',
      note: p.note || '',
      team: teams.filter(t => t.plan_id === p.id).map(t => ({
        id: t.id, memberId: String(t.member_id || ''), name: t.member_name, role: t.role || '',
      })),
      createdAt: p.created_at,
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/plans', async (req, res) => {
  try {
    const d = req.body
    const [r] = await pool.query(
      `INSERT INTO project_plans (project_name,hospital_id,site_owner,team_leader,install_type,budget,
        online_start,online_end,start_date,end_date,revisit1,revisit2,status,note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.projectName, nn(d.hospitalId), d.siteOwner, d.teamLeader || '', d.installType, nn(d.budget),
       nd(d.onlineStart), nd(d.onlineEnd), nd(d.startDate), nd(d.endDate),
       nd(d.revisit1), nd(d.revisit2), d.status, d.note])
    const planId = r.insertId
    for (const m of (d.team || [])) {
      await pool.query(
        'INSERT INTO project_plan_team (plan_id,member_id,member_name,role) VALUES (?,?,?,?)',
        [planId, nn(m.memberId), m.name, m.role])
    }
    res.json({ id: planId, ...d })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/plans/:id', async (req, res) => {
  try {
    const d = req.body
    await pool.query(
      `UPDATE project_plans SET project_name=?,hospital_id=?,site_owner=?,team_leader=?,install_type=?,budget=?,
        online_start=?,online_end=?,start_date=?,end_date=?,revisit1=?,revisit2=?,status=?,note=?
       WHERE id=?`,
      [d.projectName, nn(d.hospitalId), d.siteOwner, d.teamLeader || '', d.installType, nn(d.budget),
       nd(d.onlineStart), nd(d.onlineEnd), nd(d.startDate), nd(d.endDate),
       nd(d.revisit1), nd(d.revisit2), d.status, d.note, req.params.id])
    await pool.query('DELETE FROM project_plan_team WHERE plan_id=?', [req.params.id])
    for (const m of (d.team || [])) {
      await pool.query(
        'INSERT INTO project_plan_team (plan_id,member_id,member_name,role) VALUES (?,?,?,?)',
        [req.params.id, nn(m.memberId), m.name, m.role])
    }
    res.json({ id: Number(req.params.id), ...d })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/plans/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM project_plans WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Checklist ────────────────────────────────────────────────────────────────
app.get('/api/checklist', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM checklist_items')
    const result = { basic: {}, form: {}, report: {}, advance: {} }
    rows.forEach(r => {
      if (!result[r.type][r.hospital_id]) result[r.type][r.hospital_id] = {}
      result[r.type][r.hospital_id][r.item_id] = {
        checked: !!r.checked, note: r.note || '', date: r.item_date || '',
      }
    })
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/checklist/:type/:hospitalId/:itemId', async (req, res) => {
  try {
    const { checked, note, date } = req.body
    await pool.query(
      `INSERT INTO checklist_items (type,hospital_id,item_id,checked,note,item_date)
       VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE checked=VALUES(checked),note=VALUES(note),item_date=VALUES(item_date)`,
      [req.params.type, req.params.hospitalId, req.params.itemId, checked ? 1 : 0, note || '', nd(date)])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Training Issues ──────────────────────────────────────────────────────────
app.get('/api/training-issues', async (req, res) => {
  try {
    const [r] = await pool.query('SELECT * FROM training_issues ORDER BY date DESC, created_at DESC')
    res.json(r.map(x => ({
      id: x.id, hospitalId: x.hospital_id ? String(x.hospital_id) : '',
      date: x.date || '', resolvedDate: x.resolved_date || '',
      category: x.category || '', description: x.description || '',
      severity: x.severity, status: x.status,
      resolution: x.resolution || '', reportedBy: x.reported_by || '',
      receivedBy: x.received_by || '', resolvedBy: x.resolved_by || '',
      systemName: x.system_name || '',
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/training-issues', async (req, res) => {
  try {
    const d = req.body
    const [r] = await pool.query(
      'INSERT INTO training_issues (hospital_id,date,resolved_date,category,description,severity,status,resolution,reported_by,received_by,resolved_by,system_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [nn(d.hospitalId), nd(d.date), nd(d.resolvedDate), d.category, d.description, d.severity, d.status, d.resolution, d.reportedBy, d.receivedBy||'', d.resolvedBy||'', d.systemName||''])
    res.json({ id: r.insertId, ...d })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/training-issues/:id', async (req, res) => {
  try {
    const d = req.body
    await pool.query(
      'UPDATE training_issues SET hospital_id=?,date=?,resolved_date=?,category=?,description=?,severity=?,status=?,resolution=?,reported_by=?,received_by=?,resolved_by=?,system_name=? WHERE id=?',
      [nn(d.hospitalId), nd(d.date), nd(d.resolvedDate), d.category, d.description, d.severity, d.status, d.resolution, d.reportedBy, d.receivedBy||'', d.resolvedBy||'', d.systemName||'', req.params.id])
    res.json({ id: Number(req.params.id), ...d })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/training-issues/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM training_issues WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── System Issues ────────────────────────────────────────────────────────────
app.get('/api/system-issues', async (req, res) => {
  try {
    const [r] = await pool.query('SELECT * FROM system_issues ORDER BY report_date DESC, created_at DESC')
    res.json(r.map(x => ({
      id: x.id, hospitalId: x.hospital_id ? String(x.hospital_id) : '',
      reportDate: x.report_date || '', resolvedDate: x.resolved_date || '',
      category: x.category || '', description: x.description || '',
      priority: x.priority, status: x.status,
      resolution: x.resolution || '', reportedBy: x.reported_by || '',
      receivedBy: x.received_by || '', resolvedBy: x.resolved_by || '',
      systemName: x.system_name || '',
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/system-issues', async (req, res) => {
  try {
    const d = req.body
    const [r] = await pool.query(
      'INSERT INTO system_issues (hospital_id,report_date,resolved_date,category,description,priority,status,resolution,reported_by,received_by,resolved_by,system_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [nn(d.hospitalId), nd(d.reportDate), nd(d.resolvedDate), d.category, d.description, d.priority, d.status, d.resolution, d.reportedBy, d.receivedBy||'', d.resolvedBy||'', d.systemName||''])
    res.json({ id: r.insertId, ...d })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/system-issues/:id', async (req, res) => {
  try {
    const d = req.body
    await pool.query(
      'UPDATE system_issues SET hospital_id=?,report_date=?,resolved_date=?,category=?,description=?,priority=?,status=?,resolution=?,reported_by=?,received_by=?,resolved_by=?,system_name=? WHERE id=?',
      [nn(d.hospitalId), nd(d.reportDate), nd(d.resolvedDate), d.category, d.description, d.priority, d.status, d.resolution, d.reportedBy, d.receivedBy||'', d.resolvedBy||'', d.systemName||'', req.params.id])
    res.json({ id: Number(req.params.id), ...d })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/system-issues/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM system_issues WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Advance Records ─────────────────────────────────────────────────────────
app.get('/api/advance-records', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM advance_records ORDER BY created_at DESC')
    res.json(rows.map(r => ({
      id: r.id, planId: r.plan_id ? String(r.plan_id) : '',
      objective: r.objective || '',
      documents: r.documents ? JSON.parse(r.documents) : [],
      amount: r.amount || '', advDate: r.adv_date || '',
      clearDate: r.clear_date || '', actualAmount: r.actual_amount || '',
      status: r.status || 'pending', note: r.note || '',
      createdAt: r.created_at,
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/advance-records', async (req, res) => {
  try {
    const d = req.body
    const [r] = await pool.query(
      `INSERT INTO advance_records (plan_id,objective,documents,amount,adv_date,clear_date,actual_amount,status,note)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [nn(d.planId), d.objective, JSON.stringify(d.documents || []),
       nn(d.amount), nd(d.advDate), nd(d.clearDate), nn(d.actualAmount), d.status, d.note])
    res.json({ id: r.insertId, ...d })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/advance-records/:id', async (req, res) => {
  try {
    const d = req.body
    await pool.query(
      `UPDATE advance_records SET plan_id=?,objective=?,documents=?,amount=?,adv_date=?,clear_date=?,actual_amount=?,status=?,note=? WHERE id=?`,
      [nn(d.planId), d.objective, JSON.stringify(d.documents || []),
       nn(d.amount), nd(d.advDate), nd(d.clearDate), nn(d.actualAmount), d.status, d.note, req.params.id])
    res.json({ id: Number(req.params.id), ...d })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/advance-records/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM advance_records WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Basic Checklist Entries ──────────────────────────────────────────────────
app.get('/api/basic-entries', async (req, res) => {
  try {
    const { hospitalId } = req.query
    if (!hospitalId) return res.json([])
    const [r] = await pool.query(
      `SELECT e.id, e.hospital_id, e.master_id, e.status, e.note,
              m.system_name, m.item_name, m.detail, m.sort_order
       FROM basic_checklist_entries e
       JOIN basic_checklist_master m ON e.master_id = m.id
       WHERE e.hospital_id = ?
       ORDER BY m.sort_order, m.id`,
      [hospitalId])
    res.json(r.map(x => ({
      id: x.id, hospitalId: x.hospital_id, masterId: x.master_id,
      status: x.status || 'waiting', note: x.note || '',
      systemName: x.system_name || '', itemName: x.item_name || '',
      detail: x.detail || '', sortOrder: x.sort_order || 0,
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// สรุปความคืบหน้าต่อ รพ. (ใช้ใน ProjectSummary)
app.get('/api/basic-entries/summary', async (req, res) => {
  try {
    const [r] = await pool.query(
      `SELECT hospital_id, COUNT(*) AS total,
              SUM(status='done')       AS done,
              SUM(status='inprogress') AS inprogress,
              SUM(status='waiting')    AS waiting
       FROM basic_checklist_entries
       GROUP BY hospital_id`)
    res.json(r.map(x => ({
      hospitalId:  String(x.hospital_id),
      total:       Number(x.total),
      done:        Number(x.done),
      inprogress:  Number(x.inprogress),
      waiting:     Number(x.waiting),
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// นำเข้ารายการ bulk upsert
app.post('/api/basic-entries/import', async (req, res) => {
  try {
    const { hospitalId, items } = req.body  // items: [{masterId, status, note}]
    if (!hospitalId || !items?.length) return res.json({ ok: true, count: 0 })
    for (const item of items) {
      await pool.query(
        `INSERT INTO basic_checklist_entries (hospital_id, master_id, status, note)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE status=VALUES(status), note=VALUES(note)`,
        [hospitalId, item.masterId, item.status || 'waiting', item.note || ''])
    }
    res.json({ ok: true, count: items.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/basic-entries/:id', async (req, res) => {
  try {
    const { status, note } = req.body
    await pool.query('UPDATE basic_checklist_entries SET status=?,note=? WHERE id=?',
      [status, note || '', req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/basic-entries/hospital/:hospitalId', async (req, res) => {
  try {
    await pool.query('DELETE FROM basic_checklist_entries WHERE hospital_id=?', [req.params.hospitalId])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/basic-entries/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM basic_checklist_entries WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Form Checklist Master ────────────────────────────────────────────────────
app.get('/api/form-master', async (req, res) => {
  try {
    const [r] = await pool.query('SELECT * FROM form_checklist_master ORDER BY sort_order, id')
    res.json(r.map(x => ({
      id: x.id, systemName: x.system_name || '', formName: x.form_name || '',
      printName: x.print_name || '', paperSize: x.paper_size || 'A4',
      parameter: x.parameter || '', condition: x.condition_text || '',
      sortOrder: x.sort_order || 0,
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/form-master', async (req, res) => {
  try {
    const { systemName, formName, printName, paperSize, parameter, condition, sortOrder } = req.body
    const [r] = await pool.query(
      'INSERT INTO form_checklist_master (system_name,form_name,print_name,paper_size,parameter,condition_text,sort_order) VALUES (?,?,?,?,?,?,?)',
      [systemName, formName, printName || '', paperSize || 'A4', parameter || '', condition || '', nn(sortOrder) ?? 0])
    res.json({ id: r.insertId, systemName, formName, printName: printName || '', paperSize: paperSize || 'A4', parameter: parameter || '', condition: condition || '', sortOrder: sortOrder || 0 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/form-master/:id', async (req, res) => {
  try {
    const { systemName, formName, printName, paperSize, parameter, condition, sortOrder } = req.body
    await pool.query(
      'UPDATE form_checklist_master SET system_name=?,form_name=?,print_name=?,paper_size=?,parameter=?,condition_text=?,sort_order=? WHERE id=?',
      [systemName, formName, printName || '', paperSize || 'A4', parameter || '', condition || '', nn(sortOrder) ?? 0, req.params.id])
    res.json({ id: Number(req.params.id), systemName, formName, printName: printName || '', paperSize: paperSize || 'A4', parameter: parameter || '', condition: condition || '', sortOrder: sortOrder || 0 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/form-master/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM form_checklist_master WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Form Checklist Entries ───────────────────────────────────────────────────
app.get('/api/form-entries', async (req, res) => {
  try {
    const { hospitalId } = req.query
    if (!hospitalId) return res.json([])
    const [r] = await pool.query(
      `SELECT e.id, e.hospital_id, e.master_id, e.status, e.assigned_to, e.note,
              m.system_name, m.form_name, m.print_name, m.paper_size, m.sort_order
       FROM form_checklist_entries e
       JOIN form_checklist_master m ON e.master_id = m.id
       WHERE e.hospital_id = ?
       ORDER BY m.sort_order, m.id`,
      [hospitalId])
    res.json(r.map(x => ({
      id: x.id, hospitalId: x.hospital_id, masterId: x.master_id,
      status: x.status || 'waiting_form', assignedTo: x.assigned_to || '', note: x.note || '',
      systemName: x.system_name || '', formName: x.form_name || '',
      printName: x.print_name || '', paperSize: x.paper_size || 'A4', sortOrder: x.sort_order || 0,
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/form-entries/import', async (req, res) => {
  try {
    const { hospitalId, items } = req.body  // items: [{masterId, status, assignedTo, note}]
    if (!hospitalId || !items?.length) return res.json({ ok: true, count: 0 })
    for (const item of items) {
      await pool.query(
        `INSERT INTO form_checklist_entries (hospital_id, master_id, status, assigned_to, note)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE status=VALUES(status), assigned_to=VALUES(assigned_to), note=VALUES(note)`,
        [hospitalId, item.masterId, item.status || 'waiting_form', item.assignedTo || '', item.note || ''])
    }
    res.json({ ok: true, count: items.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// สรุปความคืบหน้าต่อ รพ. (ใช้ใน ProjectSummary)
app.get('/api/form-entries/summary', async (req, res) => {
  try {
    const [r] = await pool.query(
      `SELECT hospital_id, COUNT(*) AS total,
              SUM(status = 'waiting_form') AS waiting,
              SUM(status IN ('drawn','waiting_code','waiting_review','revision')) AS inprogress,
              SUM(status = 'done') AS done
       FROM form_checklist_entries
       GROUP BY hospital_id`)
    res.json(r.map(x => ({
      hospitalId: String(x.hospital_id),
      total: Number(x.total),
      waiting: Number(x.waiting),
      inprogress: Number(x.inprogress),
      done: Number(x.done),
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/form-entries/:id', async (req, res) => {
  try {
    const { status, assignedTo, note } = req.body
    await pool.query(
      'UPDATE form_checklist_entries SET status=?,assigned_to=?,note=? WHERE id=?',
      [status, assignedTo || '', note || '', req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/form-entries/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM form_checklist_entries WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Report Checklist Master ──────────────────────────────────────────────────
app.get('/api/report-master', async (req, res) => {
  try {
    const [r] = await pool.query('SELECT * FROM report_checklist_master ORDER BY sort_order, id')
    res.json(r.map(x => ({
      id: x.id, systemName: x.system_name || '', reportName: x.report_name || '',
      printName: x.print_name || '', paperSize: x.paper_size || 'A4',
      parameter: x.parameter || '', condition: x.condition_text || '',
      sortOrder: x.sort_order || 0,
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/report-master', async (req, res) => {
  try {
    const { systemName, reportName, printName, paperSize, parameter, condition, sortOrder } = req.body
    const [r] = await pool.query(
      'INSERT INTO report_checklist_master (system_name,report_name,print_name,paper_size,parameter,condition_text,sort_order) VALUES (?,?,?,?,?,?,?)',
      [systemName, reportName, printName || '', paperSize || 'A4', parameter || '', condition || '', nn(sortOrder) ?? 0])
    res.json({ id: r.insertId, systemName, reportName, printName: printName || '', paperSize: paperSize || 'A4', parameter: parameter || '', condition: condition || '', sortOrder: sortOrder || 0 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/report-master/:id', async (req, res) => {
  try {
    const { systemName, reportName, printName, paperSize, parameter, condition, sortOrder } = req.body
    await pool.query(
      'UPDATE report_checklist_master SET system_name=?,report_name=?,print_name=?,paper_size=?,parameter=?,condition_text=?,sort_order=? WHERE id=?',
      [systemName, reportName, printName || '', paperSize || 'A4', parameter || '', condition || '', nn(sortOrder) ?? 0, req.params.id])
    res.json({ id: Number(req.params.id), systemName, reportName, printName: printName || '', paperSize: paperSize || 'A4', parameter: parameter || '', condition: condition || '', sortOrder: sortOrder || 0 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/report-master/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM report_checklist_master WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Report Checklist Entries ─────────────────────────────────────────────────
app.get('/api/report-entries', async (req, res) => {
  try {
    const { hospitalId } = req.query
    if (!hospitalId) return res.json([])
    const [r] = await pool.query(
      `SELECT e.id, e.hospital_id, e.master_id, e.status, e.assigned_to, e.note,
              m.system_name, m.report_name, m.print_name, m.paper_size, m.sort_order
       FROM report_checklist_entries e
       JOIN report_checklist_master m ON e.master_id = m.id
       WHERE e.hospital_id = ?
       ORDER BY m.sort_order, m.id`,
      [hospitalId])
    res.json(r.map(x => ({
      id: x.id, hospitalId: x.hospital_id, masterId: x.master_id,
      status: x.status || 'waiting_form', assignedTo: x.assigned_to || '', note: x.note || '',
      systemName: x.system_name || '', reportName: x.report_name || '',
      printName: x.print_name || '', paperSize: x.paper_size || 'A4', sortOrder: x.sort_order || 0,
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/report-entries/import', async (req, res) => {
  try {
    const { hospitalId, items } = req.body
    if (!hospitalId || !items?.length) return res.json({ ok: true, count: 0 })
    for (const item of items) {
      await pool.query(
        `INSERT INTO report_checklist_entries (hospital_id, master_id, status, assigned_to, note)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE status=VALUES(status), assigned_to=VALUES(assigned_to), note=VALUES(note)`,
        [hospitalId, item.masterId, item.status || 'waiting_form', item.assignedTo || '', item.note || ''])
    }
    res.json({ ok: true, count: items.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// สรุปความคืบหน้าต่อ รพ. (ใช้ใน ProjectSummary)
app.get('/api/report-entries/summary', async (req, res) => {
  try {
    const [r] = await pool.query(
      `SELECT e.hospital_id, COUNT(*) AS total,
              SUM(e.status = 'waiting_form') AS waiting,
              SUM(e.status IN ('drawn','waiting_code','waiting_review','revision')) AS inprogress,
              SUM(e.status = 'done') AS done
       FROM report_checklist_entries e
       JOIN report_checklist_master m ON e.master_id = m.id
       GROUP BY e.hospital_id`)
    res.json(r.map(x => ({
      hospitalId: String(x.hospital_id),
      total: Number(x.total),
      waiting: Number(x.waiting),
      inprogress: Number(x.inprogress),
      done: Number(x.done),
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/report-entries/:id', async (req, res) => {
  try {
    const { status, assignedTo, note } = req.body
    await pool.query(
      'UPDATE report_checklist_entries SET status=?,assigned_to=?,note=? WHERE id=?',
      [status, assignedTo || '', note || '', req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/report-entries/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM report_checklist_entries WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── MasterPlan Topics ────────────────────────────────────────────────────────
app.get('/api/masterplan-topics', async (req, res) => {
  try {
    const [r] = await pool.query('SELECT * FROM masterplan_topics ORDER BY sort_order, id')
    res.json(r.map(x => ({ id: x.id, title: x.title, sortOrder: x.sort_order })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/masterplan-topics', async (req, res) => {
  try {
    const { title, sortOrder } = req.body
    const [r] = await pool.query('INSERT INTO masterplan_topics (title, sort_order) VALUES (?,?)', [title, nn(sortOrder) ?? 0])
    res.json({ id: r.insertId, title, sortOrder: sortOrder || 0 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/masterplan-topics/:id', async (req, res) => {
  try {
    const { title, sortOrder } = req.body
    await pool.query('UPDATE masterplan_topics SET title=?, sort_order=? WHERE id=?', [title, nn(sortOrder) ?? 0, req.params.id])
    res.json({ id: Number(req.params.id), title, sortOrder: sortOrder || 0 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/masterplan-topics/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM masterplan_topics WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── MasterPlan Items ─────────────────────────────────────────────────────────
app.get('/api/masterplan-items', async (req, res) => {
  try {
    const { planId } = req.query
    if (!planId) return res.json([])
    const [r] = await pool.query(
      'SELECT * FROM masterplan_items WHERE plan_id=? ORDER BY COALESCE(start_date,"9999-99-99"), start_time, sort_order',
      [planId])
    res.json(r.map(x => ({
      id: x.id, planId: x.plan_id, topicTitle: x.topic_title || '',
      startDate: x.start_date ? String(x.start_date).slice(0, 10) : '',
      endDate: x.end_date ? String(x.end_date).slice(0, 10) : '',
      startTime: x.start_time || '', endTime: x.end_time || '',
      taskDetail: x.task_detail || '', responsible: x.responsible || '',
      hospitalResponsible: x.hospital_responsible || '',
      preparation: x.preparation || '', sortOrder: x.sort_order || 0,
      status: x.status || 'pending',
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/masterplan-items', async (req, res) => {
  try {
    const { planId, topicTitle, startDate, endDate, startTime, endTime, taskDetail, responsible, hospitalResponsible, preparation, sortOrder, status } = req.body
    const [r] = await pool.query(
      'INSERT INTO masterplan_items (plan_id,topic_title,start_date,end_date,start_time,end_time,task_detail,responsible,hospital_responsible,preparation,sort_order,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [planId, topicTitle || '', startDate || null, endDate || null, startTime || '', endTime || '', taskDetail || '', responsible || '', hospitalResponsible || '', preparation || '', nn(sortOrder) ?? 0, status || 'pending'])
    res.json({ id: r.insertId })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/masterplan-items/:id', async (req, res) => {
  try {
    const { topicTitle, startDate, endDate, startTime, endTime, taskDetail, responsible, hospitalResponsible, preparation, status, sortOrder } = req.body
    await pool.query(
      'UPDATE masterplan_items SET topic_title=?,start_date=?,end_date=?,start_time=?,end_time=?,task_detail=?,responsible=?,hospital_responsible=?,preparation=?,status=?,sort_order=? WHERE id=?',
      [topicTitle || '', startDate || null, endDate || null, startTime || '', endTime || '', taskDetail || '', responsible || '', hospitalResponsible || '', preparation || '', status || 'pending', nn(sortOrder) ?? 0, req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/masterplan-items/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM masterplan_items WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── MasterPlan Summary (per hospital) ───────────────────────────────────────
app.get('/api/masterplan-items/summary', async (req, res) => {
  try {
    const [r] = await pool.query(`
      SELECT p.hospital_id AS hospitalId,
             COUNT(mi.id) AS total,
             SUM(CASE WHEN mi.status = 'done' THEN 1 ELSE 0 END) AS done
      FROM masterplan_items mi
      JOIN project_plans p ON p.id = mi.plan_id
      GROUP BY p.hospital_id
    `)
    res.json(r.map(x => ({ hospitalId: String(x.hospitalId), total: Number(x.total), done: Number(x.done) })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Debug schema ─────────────────────────────────────────────────────────────
app.get('/api/schema', async (req, res) => {
  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM team_members')
    res.json(cols.map(c => ({ field: c.Field, type: c.Type })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── System Names (distinct from basic_checklist_master) ──────────────────────
app.get('/api/system-names', async (req, res) => {
  try {
    const [r] = await pool.query("SELECT DISTINCT system_name FROM basic_checklist_master WHERE system_name IS NOT NULL AND system_name <> '' ORDER BY system_name")
    res.json(r.map(x => x.system_name))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Basic Checklist Master ────────────────────────────────────────────────────
app.get('/api/basic-master', async (req, res) => {
  try {
    const [r] = await pool.query('SELECT * FROM basic_checklist_master ORDER BY sort_order, id')
    res.json(r.map(x => ({
      id: x.id, systemName: x.system_name || '', itemName: x.item_name || '',
      detail: x.detail || '', sortOrder: x.sort_order || 0,
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/basic-master', async (req, res) => {
  try {
    const { systemName, itemName, detail, sortOrder } = req.body
    const [r] = await pool.query(
      'INSERT INTO basic_checklist_master (system_name,item_name,detail,sort_order) VALUES (?,?,?,?)',
      [systemName, itemName, detail || '', nn(sortOrder) ?? 0])
    res.json({ id: r.insertId, systemName, itemName, detail: detail || '', sortOrder: sortOrder || 0 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/basic-master/:id', async (req, res) => {
  try {
    const { systemName, itemName, detail, sortOrder } = req.body
    await pool.query(
      'UPDATE basic_checklist_master SET system_name=?,item_name=?,detail=?,sort_order=? WHERE id=?',
      [systemName, itemName, detail || '', nn(sortOrder) ?? 0, req.params.id])
    res.json({ id: Number(req.params.id), systemName, itemName, detail: detail || '', sortOrder: sortOrder || 0 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/basic-master/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM basic_checklist_master WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Migrations ───────────────────────────────────────────────────────────────
const DEFAULT_BASIC_ITEMS = [
  { system_name: 'ระบบเจ้าหนี้ (AP)', item_name: 'ข้อมูลผู้ขาย (Vendor Master)', detail: 'ข้อมูลผู้ขายทั้งหมดที่ใช้ในระบบ' },
  { system_name: 'ระบบลูกหนี้ (AR)', item_name: 'ข้อมูลลูกค้า (Customer Master)', detail: 'ข้อมูลลูกค้าทั้งหมดที่ใช้ในระบบ' },
  { system_name: 'ระบบบัญชี', item_name: 'ผังบัญชี (Chart of Accounts)', detail: 'ผังบัญชีที่ใช้ในองค์กร' },
  { system_name: 'ระบบบัญชี', item_name: 'หน่วยงาน / ศูนย์ต้นทุน (Cost Center)', detail: 'โครงสร้างหน่วยงานและศูนย์ต้นทุน' },
  { system_name: 'ระบบเจ้าหนี้ (AP)', item_name: 'เงื่อนไขการชำระเงิน (Payment Terms)', detail: 'เงื่อนไขการชำระเงินที่ใช้กับผู้ขาย' },
  { system_name: 'ระบบเจ้าหนี้ (AP)', item_name: 'ข้อมูลธนาคาร (Bank Master)', detail: 'ข้อมูลบัญชีธนาคารที่ใช้จ่ายชำระ' },
  { system_name: 'ระบบภาษี', item_name: 'ข้อมูลภาษีมูลค่าเพิ่ม (VAT Setting)', detail: 'การตั้งค่า VAT ในระบบ' },
  { system_name: 'ระบบภาษี', item_name: 'ข้อมูลหัก ณ ที่จ่าย (WHT Setting)', detail: 'อัตราและประเภทภาษีหัก ณ ที่จ่าย' },
  { system_name: 'ระบบสินค้า', item_name: 'รหัสสินค้า / บริการ (Item/Service Code)', detail: 'รหัสสินค้าและบริการที่ใช้ในการซื้อขาย' },
  { system_name: 'ระบบงบประมาณ', item_name: 'ข้อมูลงบประมาณ (Budget Data)', detail: 'ข้อมูลงบประมาณประจำปี' },
]

async function runMigrations() {
  const columnMigrations = [
    {
      table: 'team_members', column: 'nickname',
      sql: `ALTER TABLE team_members ADD COLUMN nickname VARCHAR(100) NULL AFTER name`,
    },
    {
      table: 'training_issues', column: 'resolved_date',
      sql: `ALTER TABLE training_issues ADD COLUMN resolved_date DATE NULL`,
    },
    {
      table: 'training_issues', column: 'reported_by',
      sql: `ALTER TABLE training_issues ADD COLUMN reported_by VARCHAR(200) NULL`,
    },
    {
      table: 'training_issues', column: 'system_name',
      sql: `ALTER TABLE training_issues ADD COLUMN system_name VARCHAR(200) NULL`,
    },
    {
      table: 'training_issues', column: 'received_by',
      sql: `ALTER TABLE training_issues ADD COLUMN received_by VARCHAR(200) NULL`,
    },
    {
      table: 'training_issues', column: 'resolved_by',
      sql: `ALTER TABLE training_issues ADD COLUMN resolved_by VARCHAR(200) NULL`,
    },
    {
      table: 'system_issues', column: 'system_name',
      sql: `ALTER TABLE system_issues ADD COLUMN system_name VARCHAR(200) NULL`,
    },
    {
      table: 'system_issues', column: 'received_by',
      sql: `ALTER TABLE system_issues ADD COLUMN received_by VARCHAR(200) NULL`,
    },
    {
      table: 'system_issues', column: 'resolved_by',
      sql: `ALTER TABLE system_issues ADD COLUMN resolved_by VARCHAR(200) NULL`,
    },
    {
      table: 'form_checklist_master', column: 'condition_text',
      sql: `ALTER TABLE form_checklist_master ADD COLUMN condition_text TEXT NULL`,
    },
    {
      table: 'masterplan_items', column: 'status',
      sql: `ALTER TABLE masterplan_items ADD COLUMN status VARCHAR(20) DEFAULT 'pending' AFTER preparation`,
    },
    {
      table: 'project_plans', column: 'team_leader',
      sql: `ALTER TABLE project_plans ADD COLUMN team_leader VARCHAR(200) NULL AFTER site_owner`,
    },
    {
      table: 'hospitals', column: 'user_count',
      sql: `ALTER TABLE hospitals ADD COLUMN user_count INT NULL AFTER bed_count`,
    },
    {
      table: 'hospitals', column: 'user_count_ar',
      sql: `ALTER TABLE hospitals ADD COLUMN user_count_ar INT NULL AFTER user_count`,
    },
  ]

  for (const m of columnMigrations) {
    try {
      const [cols] = await pool.query(`SHOW COLUMNS FROM ${m.table} LIKE '${m.column}'`)
      if (cols.length === 0) {
        await pool.query(m.sql)
        console.log(`✅ Migration: เพิ่ม ${m.column} ใน ${m.table} สำเร็จ`)
      }
    } catch (e) {
      console.error(`❌ Migration error (${m.table}.${m.column}):`, e.message)
    }
  }

  // สร้างตาราง document_tracking ถ้ายังไม่มี
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_tracking (
        id INT AUTO_INCREMENT PRIMARY KEY,
        plan_id INT NOT NULL,
        member_id VARCHAR(50) DEFAULT '',
        member_name VARCHAR(255) NOT NULL,
        track_date DATE NOT NULL,
        status VARCHAR(50) DEFAULT 'not_sent',
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_plan_member_date (plan_id, member_name, track_date)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('✅ Migration: ตาราง document_tracking พร้อมใช้งาน')
  } catch (e) {
    console.error('❌ Migration error (document_tracking):', e.message)
  }

  // สร้างตาราง basic_checklist_entries ถ้ายังไม่มี
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS basic_checklist_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hospital_id INT NOT NULL,
        master_id INT NOT NULL,
        status VARCHAR(50) DEFAULT 'waiting',
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_hosp_master (hospital_id, master_id)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('✅ Migration: ตาราง basic_checklist_entries พร้อมใช้งาน')
  } catch (e) {
    console.error('❌ Migration error (basic_checklist_entries):', e.message)
  }

  // สร้างตาราง basic_checklist_master ถ้ายังไม่มี
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS basic_checklist_master (
        id INT AUTO_INCREMENT PRIMARY KEY,
        system_name VARCHAR(200) NOT NULL DEFAULT '',
        item_name VARCHAR(200) NOT NULL,
        detail TEXT,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('✅ Migration: ตาราง basic_checklist_master พร้อมใช้งาน')

    // seed ข้อมูล default ถ้าตารางว่าง
    const [existing] = await pool.query('SELECT COUNT(*) as cnt FROM basic_checklist_master')
    if (existing[0].cnt === 0) {
      for (let i = 0; i < DEFAULT_BASIC_ITEMS.length; i++) {
        const item = DEFAULT_BASIC_ITEMS[i]
        await pool.query(
          'INSERT INTO basic_checklist_master (system_name,item_name,detail,sort_order) VALUES (?,?,?,?)',
          [item.system_name, item.item_name, item.detail, i + 1])
      }
      console.log(`✅ Migration: seed ข้อมูล default ${DEFAULT_BASIC_ITEMS.length} รายการใน basic_checklist_master`)
    }
  } catch (e) {
    console.error('❌ Migration error (basic_checklist_master):', e.message)
  }

  // สร้างตาราง form_checklist_entries ถ้ายังไม่มี
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS form_checklist_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hospital_id INT NOT NULL,
        master_id INT NOT NULL,
        status VARCHAR(50) DEFAULT 'waiting_form',
        assigned_to VARCHAR(200) DEFAULT '',
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_form_hosp_master (hospital_id, master_id)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('✅ Migration: ตาราง form_checklist_entries พร้อมใช้งาน')
  } catch (e) {
    console.error('❌ Migration error (form_checklist_entries):', e.message)
  }

  // สร้างตาราง form_checklist_master ถ้ายังไม่มี
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS form_checklist_master (
        id INT AUTO_INCREMENT PRIMARY KEY,
        system_name VARCHAR(200) NOT NULL DEFAULT '',
        form_name VARCHAR(200) NOT NULL DEFAULT '',
        print_name VARCHAR(200) NOT NULL DEFAULT '',
        paper_size VARCHAR(10) NOT NULL DEFAULT 'A4',
        parameter TEXT,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('✅ Migration: ตาราง form_checklist_master พร้อมใช้งาน')
  } catch (e) {
    console.error('❌ Migration error (form_checklist_master):', e.message)
  }

  // สร้างตาราง report_checklist_master ถ้ายังไม่มี
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_checklist_master (
        id INT AUTO_INCREMENT PRIMARY KEY,
        system_name VARCHAR(200) NOT NULL DEFAULT '',
        report_name VARCHAR(200) NOT NULL DEFAULT '',
        print_name VARCHAR(200) NOT NULL DEFAULT '',
        paper_size VARCHAR(10) NOT NULL DEFAULT 'A4',
        parameter TEXT,
        condition_text TEXT,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('✅ Migration: ตาราง report_checklist_master พร้อมใช้งาน')
  } catch (e) {
    console.error('❌ Migration error (report_checklist_master):', e.message)
  }

  // สร้างตาราง report_checklist_entries ถ้ายังไม่มี
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_checklist_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hospital_id INT NOT NULL,
        master_id INT NOT NULL,
        status VARCHAR(50) DEFAULT 'waiting_form',
        assigned_to VARCHAR(200) DEFAULT '',
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_report_hosp_master (hospital_id, master_id)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('✅ Migration: ตาราง report_checklist_entries พร้อมใช้งาน')
  } catch (e) {
    console.error('❌ Migration error (report_checklist_entries):', e.message)
  }

  // สร้างตาราง masterplan_topics ถ้ายังไม่มี
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS masterplan_topics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('✅ Migration: ตาราง masterplan_topics พร้อมใช้งาน')
  } catch (e) {
    console.error('❌ Migration error (masterplan_topics):', e.message)
  }

  // สร้างตาราง masterplan_items ถ้ายังไม่มี
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS masterplan_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        plan_id INT NOT NULL,
        topic_title VARCHAR(500) DEFAULT '',
        start_date DATE NULL,
        end_date DATE NULL,
        start_time VARCHAR(10) DEFAULT '',
        end_time VARCHAR(10) DEFAULT '',
        task_detail TEXT,
        responsible VARCHAR(300) DEFAULT '',
        hospital_responsible VARCHAR(300) DEFAULT '',
        preparation TEXT,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('✅ Migration: ตาราง masterplan_items พร้อมใช้งาน')
  } catch (e) {
    console.error('❌ Migration error (masterplan_items):', e.message)
  }

  // ── Holiday Management ─────────────────────────────────────────────────────
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS holiday_type (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(20) NOT NULL UNIQUE,
        type_name VARCHAR(100) NOT NULL,
        color_code VARCHAR(20) DEFAULT '#6b7280',
        is_active CHAR(1) DEFAULT 'Y',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    // Seed default types
    const defaults = [
      ['GOV',  'วันหยุดราชการ',         '#dc2626'],
      ['ORG',  'วันหยุดองค์กร',          '#2563eb'],
      ['SPEC', 'วันหยุดพิเศษ',           '#7c3aed'],
      ['COMP', 'วันหยุดชดเชย',           '#d97706'],
      ['DEPT', 'วันหยุดเฉพาะหน่วยงาน',  '#16a34a'],
    ]
    for (const [code, name, color] of defaults) {
      await pool.query(
        'INSERT IGNORE INTO holiday_type (code, type_name, color_code) VALUES (?,?,?)',
        [code, name, color]
      )
    }
    console.log('✅ Migration: ตาราง holiday_type พร้อมใช้งาน')
  } catch (e) {
    console.error('❌ Migration error (holiday_type):', e.message)
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS holiday (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        holiday_date DATE NOT NULL,
        holiday_end_date DATE NULL,
        holiday_name_th VARCHAR(300) NOT NULL,
        holiday_name_en VARCHAR(300) DEFAULT '',
        holiday_type_id INT NULL,
        is_compensate CHAR(1) DEFAULT 'N',
        is_all_org CHAR(1) DEFAULT 'Y',
        color_code VARCHAR(20) DEFAULT '',
        is_active CHAR(1) DEFAULT 'Y',
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('✅ Migration: ตาราง holiday พร้อมใช้งาน')
  } catch (e) {
    console.error('❌ Migration error (holiday):', e.message)
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS holiday_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rule_name VARCHAR(200) NOT NULL,
        rule_name_en VARCHAR(200) DEFAULT '',
        rule_type ENUM('weekend','weekday','fixed_date','nth_weekday','fixed_date_range') NOT NULL DEFAULT 'fixed_date',
        day_of_week TINYINT NULL COMMENT '0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat',
        fix_month TINYINT NULL COMMENT '1-12',
        fix_day TINYINT NULL COMMENT '1-31',
        fix_end_month TINYINT NULL COMMENT '1-12 (end of date range)',
        fix_end_day TINYINT NULL COMMENT '1-31 (end of date range)',
        nth_week TINYINT NULL COMMENT '1-5',
        nth_month TINYINT NULL COMMENT '1-12 or NULL=every month',
        holiday_type_id INT NULL,
        color_code VARCHAR(20) DEFAULT '',
        is_active CHAR(1) DEFAULT 'Y',
        note TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('✅ Migration: ตาราง holiday_rules พร้อมใช้งาน')
  } catch (e) {
    console.error('❌ Migration error (holiday_rules):', e.message)
  }

  // Alter existing holiday_rules table — use INFORMATION_SCHEMA (compatible with MySQL 8 + MariaDB)
  try {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='holiday_rules'`
    )
    const colNames = cols.map(c => c.COLUMN_NAME)
    if (!colNames.includes('fix_end_month'))
      await pool.query(`ALTER TABLE holiday_rules ADD COLUMN fix_end_month TINYINT NULL COMMENT '1-12 (end of date range)' AFTER fix_day`)
    if (!colNames.includes('fix_end_day'))
      await pool.query(`ALTER TABLE holiday_rules ADD COLUMN fix_end_day TINYINT NULL COMMENT '1-31 (end of date range)' AFTER fix_end_month`)
    const [[enumRow]] = await pool.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='holiday_rules' AND COLUMN_NAME='rule_type'`
    )
    if (enumRow && !enumRow.COLUMN_TYPE.includes('fixed_date_range'))
      await pool.query(`ALTER TABLE holiday_rules MODIFY COLUMN rule_type ENUM('weekend','weekday','fixed_date','nth_weekday','fixed_date_range') NOT NULL DEFAULT 'fixed_date'`)
  } catch (e) {
    console.error('❌ Migration alter holiday_rules:', e.message)
  }

  // hospcode reference table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS hospcode (
        amppart char(2) NULL,
        chwpart char(2) NULL,
        hospcode varchar(9) NOT NULL DEFAULT '',
        hosptype varchar(50) NULL,
        name varchar(100) NULL,
        tmbpart char(2) NULL,
        moopart char(2) NULL,
        sss_code varchar(12) NULL,
        sss_code_sub varchar(12) NULL,
        hospcode506 varchar(15) NULL,
        hospital_type_id int NULL,
        bed_count int NULL,
        po_code varchar(5) NULL,
        hospital_level_id int NULL,
        hospital_phone varchar(50) NULL,
        hospital_fax varchar(50) NULL,
        hos_guid varchar(38) NULL,
        hos_guid_ext varchar(64) NULL,
        addrpart varchar(150) NULL,
        area_code varchar(2) NULL,
        province_name varchar(60) NULL,
        region_id int NULL,
        hospcode_5_digit varchar(9) NULL,
        hospcode_9_digit varchar(9) NULL,
        active_status char(1) NULL,
        PRIMARY KEY (hospcode),
        INDEX idx_name (name(30)),
        INDEX idx_province (province_name(20))
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('✅ Migration: ตาราง hospcode พร้อมใช้งาน')
  } catch (e) { console.error('❌ Migration hospcode:', e.message) }

  // standby_schedules
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS standby_schedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        plan_id INT NOT NULL,
        member_id VARCHAR(20) DEFAULT '',
        member_name VARCHAR(200) NOT NULL,
        schedule_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'standby' COMMENT 'onsite|standby|wfh|off|holiday',
        note TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_schedule (plan_id, member_name, schedule_date)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
    console.log('✅ Migration: ตาราง standby_schedules พร้อมใช้งาน')
  } catch (e) {
    console.error('❌ Migration error (standby_schedules):', e.message)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOLIDAY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// GET holiday types
app.get('/api/holiday-types', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM holiday_type ORDER BY id')
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST holiday type
app.post('/api/holiday-types', async (req, res) => {
  const { code, typeName, colorCode, isActive } = req.body
  try {
    const [r] = await pool.query(
      'INSERT INTO holiday_type (code, type_name, color_code, is_active) VALUES (?,?,?,?)',
      [code, typeName, colorCode || '#6b7280', isActive ?? 'Y']
    )
    const [[row]] = await pool.query('SELECT * FROM holiday_type WHERE id=?', [r.insertId])
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT holiday type
app.put('/api/holiday-types/:id', async (req, res) => {
  const { code, typeName, colorCode, isActive } = req.body
  try {
    await pool.query(
      'UPDATE holiday_type SET code=?, type_name=?, color_code=?, is_active=? WHERE id=?',
      [code, typeName, colorCode || '#6b7280', isActive ?? 'Y', req.params.id]
    )
    const [[row]] = await pool.query('SELECT * FROM holiday_type WHERE id=?', [req.params.id])
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE holiday type
app.delete('/api/holiday-types/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM holiday_type WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET holidays (with filters)
app.get('/api/holidays', async (req, res) => {
  const { year, typeId, isActive } = req.query
  try {
    let sql = `SELECT h.*, ht.type_name, ht.code as type_code, ht.color_code as type_color
               FROM holiday h LEFT JOIN holiday_type ht ON h.holiday_type_id = ht.id WHERE 1=1`
    const params = []
    if (year) { sql += ' AND YEAR(h.holiday_date) = ?'; params.push(year) }
    if (typeId) { sql += ' AND h.holiday_type_id = ?'; params.push(typeId) }
    if (isActive) { sql += ' AND h.is_active = ?'; params.push(isActive) }
    sql += ' ORDER BY h.holiday_date'
    const [rows] = await pool.query(sql, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST holiday
app.post('/api/holidays', async (req, res) => {
  const { holidayDate, holidayEndDate, holidayNameTh, holidayNameEn, holidayTypeId, isCompensate, isAllOrg, colorCode, isActive, note } = req.body
  try {
    // ตรวจสอบวันซ้ำ
    const [[dup]] = await pool.query(
      'SELECT id FROM holiday WHERE holiday_date=? AND id != 0', [holidayDate]
    )
    if (dup) return res.status(409).json({ error: `วันที่ ${holidayDate} มีวันหยุดอยู่แล้ว: id ${dup.id}` })
    const [r] = await pool.query(
      `INSERT INTO holiday (holiday_date, holiday_end_date, holiday_name_th, holiday_name_en, holiday_type_id, is_compensate, is_all_org, color_code, is_active, note)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [nd(holidayDate), nd(holidayEndDate), holidayNameTh, holidayNameEn || '', nn(holidayTypeId), isCompensate || 'N', isAllOrg || 'Y', colorCode || '', isActive || 'Y', note || '']
    )
    const [[row]] = await pool.query(
      `SELECT h.*, ht.type_name, ht.code as type_code, ht.color_code as type_color
       FROM holiday h LEFT JOIN holiday_type ht ON h.holiday_type_id = ht.id WHERE h.id=?`, [r.insertId]
    )
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT holiday
app.put('/api/holidays/:id', async (req, res) => {
  const { holidayDate, holidayEndDate, holidayNameTh, holidayNameEn, holidayTypeId, isCompensate, isAllOrg, colorCode, isActive, note } = req.body
  try {
    await pool.query(
      `UPDATE holiday SET holiday_date=?, holiday_end_date=?, holiday_name_th=?, holiday_name_en=?,
       holiday_type_id=?, is_compensate=?, is_all_org=?, color_code=?, is_active=?, note=? WHERE id=?`,
      [nd(holidayDate), nd(holidayEndDate), holidayNameTh, holidayNameEn || '', nn(holidayTypeId), isCompensate || 'N', isAllOrg || 'Y', colorCode || '', isActive || 'Y', note || '', req.params.id]
    )
    const [[row]] = await pool.query(
      `SELECT h.*, ht.type_name, ht.code as type_code, ht.color_code as type_color
       FROM holiday h LEFT JOIN holiday_type ht ON h.holiday_type_id = ht.id WHERE h.id=?`, [req.params.id]
    )
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE holiday
app.delete('/api/holidays/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM holiday WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/holidays/generate — auto-generate Thai public holidays for a CE year
app.post('/api/holidays/generate', async (req, res) => {
  const { year } = req.body   // CE year e.g. 2026
  if (!year) return res.status(400).json({ error: 'year required' })
  try {
    const [[govType]] = await pool.query("SELECT id FROM holiday_type WHERE code='GOV' LIMIT 1")
    const [[compType]] = await pool.query("SELECT id FROM holiday_type WHERE code='COMP' LIMIT 1")
    const govId  = govType?.id  || 1
    const compId = compType?.id || 4

    const fixed = [
      { d: `${year}-01-01`, th: 'วันขึ้นปีใหม่',                         en: "New Year's Day",                tid: govId  },
      { d: `${year}-04-06`, th: 'วันจักรี',                               en: 'Chakri Memorial Day',            tid: govId  },
      { d: `${year}-04-13`, th: 'วันสงกรานต์',                            en: 'Songkran Festival',              tid: govId  },
      { d: `${year}-04-14`, th: 'วันสงกรานต์',                            en: 'Songkran Festival',              tid: govId  },
      { d: `${year}-04-15`, th: 'วันสงกรานต์',                            en: 'Songkran Festival',              tid: govId  },
      { d: `${year}-05-01`, th: 'วันแรงงานแห่งชาติ',                      en: 'National Labour Day',            tid: govId  },
      { d: `${year}-05-04`, th: 'วันฉัตรมงคล',                            en: 'Coronation Day',                 tid: govId  },
      { d: `${year}-07-28`, th: 'วันเฉลิมพระชนมพรรษา รัชกาลที่ 10',      en: "HM King's Birthday",             tid: govId  },
      { d: `${year}-08-12`, th: 'วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าฯ', en: "HM Queen's Birthday",            tid: govId  },
      { d: `${year}-10-13`, th: 'วันนวมินทรมหาราช',                       en: 'King Bhumibol Memorial Day',     tid: govId  },
      { d: `${year}-10-23`, th: 'วันปิยมหาราช',                           en: 'Chulalongkorn Day',              tid: govId  },
      { d: `${year}-12-05`, th: 'วันเฉลิมพระชนมพรรษา รัชกาลที่ 9',       en: "Father's Day",                   tid: govId  },
      { d: `${year}-12-10`, th: 'วันรัฐธรรมนูญ',                          en: 'Constitution Day',               tid: govId  },
      { d: `${year}-12-31`, th: 'วันสิ้นปี',                              en: "New Year's Eve",                 tid: govId  },
    ]

    const inserted = [], skipped = []
    for (const h of fixed) {
      const [[dup]] = await pool.query('SELECT id FROM holiday WHERE holiday_date=?', [h.d])
      if (dup) { skipped.push(h.d); continue }
      await pool.query(
        'INSERT INTO holiday (holiday_date, holiday_name_th, holiday_name_en, holiday_type_id, is_compensate, is_all_org, is_active) VALUES (?,?,?,?,?,?,?)',
        [h.d, h.th, h.en, h.tid, 'N', 'Y', 'Y']
      )
      inserted.push(h.d)
    }
    res.json({ inserted: inserted.length, skipped: skipped.length, insertedDates: inserted, skippedDates: skipped })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/holidays/import — bulk import
app.post('/api/holidays/import', async (req, res) => {
  const { rows } = req.body  // [{ holidayDate, holidayNameTh, holidayTypeId, ... }]
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows array required' })
  try {
    let inserted = 0, skipped = 0
    for (const h of rows) {
      if (!h.holidayDate || !h.holidayNameTh) { skipped++; continue }
      const [[dup]] = await pool.query('SELECT id FROM holiday WHERE holiday_date=?', [h.holidayDate])
      if (dup) { skipped++; continue }
      await pool.query(
        'INSERT INTO holiday (holiday_date, holiday_end_date, holiday_name_th, holiday_name_en, holiday_type_id, is_compensate, is_all_org, is_active, note) VALUES (?,?,?,?,?,?,?,?,?)',
        [nd(h.holidayDate), nd(h.holidayEndDate), h.holidayNameTh, h.holidayNameEn || '', nn(h.holidayTypeId), h.isCompensate || 'N', h.isAllOrg || 'Y', h.isActive || 'Y', h.note || '']
      )
      inserted++
    }
    res.json({ inserted, skipped })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// HOLIDAY RULES
// ═══════════════════════════════════════════════════════════════════════════════

const DOW_TH = ['วันอาทิตย์','วันจันทร์','วันอังคาร','วันพุธ','วันพฤหัสบดี','วันศุกร์','วันเสาร์']
const DOW_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

app.get('/api/holiday-rules', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, ht.type_name, ht.color_code as type_color
       FROM holiday_rules r LEFT JOIN holiday_type ht ON r.holiday_type_id = ht.id
       ORDER BY r.id`
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/holiday-rules', async (req, res) => {
  const { ruleName, ruleNameEn, ruleType, dayOfWeek, fixMonth, fixDay, fixEndMonth, fixEndDay, nthWeek, nthMonth, holidayTypeId, colorCode, isActive, note } = req.body
  try {
    const [r] = await pool.query(
      `INSERT INTO holiday_rules (rule_name,rule_name_en,rule_type,day_of_week,fix_month,fix_day,fix_end_month,fix_end_day,nth_week,nth_month,holiday_type_id,color_code,is_active,note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [ruleName, ruleNameEn||'', ruleType,
       dayOfWeek!=null ? Number(dayOfWeek) : null,
       fixMonth||null, fixDay||null, fixEndMonth||null, fixEndDay||null,
       nthWeek||null, nthMonth||null,
       nn(holidayTypeId), colorCode||'', isActive||'Y', note||'']
    )
    const [[row]] = await pool.query(
      'SELECT r.*, ht.type_name, ht.color_code as type_color FROM holiday_rules r LEFT JOIN holiday_type ht ON r.holiday_type_id=ht.id WHERE r.id=?',
      [r.insertId]
    )
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/holiday-rules/:id', async (req, res) => {
  const { ruleName, ruleNameEn, ruleType, dayOfWeek, fixMonth, fixDay, fixEndMonth, fixEndDay, nthWeek, nthMonth, holidayTypeId, colorCode, isActive, note } = req.body
  try {
    await pool.query(
      `UPDATE holiday_rules SET rule_name=?,rule_name_en=?,rule_type=?,day_of_week=?,fix_month=?,fix_day=?,fix_end_month=?,fix_end_day=?,nth_week=?,nth_month=?,holiday_type_id=?,color_code=?,is_active=?,note=? WHERE id=?`,
      [ruleName, ruleNameEn||'', ruleType,
       dayOfWeek!=null ? Number(dayOfWeek) : null,
       fixMonth||null, fixDay||null, fixEndMonth||null, fixEndDay||null,
       nthWeek||null, nthMonth||null,
       nn(holidayTypeId), colorCode||'', isActive||'Y', note||'', req.params.id]
    )
    const [[row]] = await pool.query(
      'SELECT r.*, ht.type_name, ht.color_code as type_color FROM holiday_rules r LEFT JOIN holiday_type ht ON r.holiday_type_id=ht.id WHERE r.id=?',
      [req.params.id]
    )
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/holiday-rules/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM holiday_rules WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/holiday-rules/apply — apply all active rules for a given year
app.post('/api/holiday-rules/apply', async (req, res) => {
  const { year } = req.body
  if (!year) return res.status(400).json({ error: 'year required' })
  const ceYear = parseInt(year, 10) >= 2400 ? parseInt(year, 10) - 543 : parseInt(year, 10)
  try {
    const [rules] = await pool.query('SELECT * FROM holiday_rules WHERE is_active=?', ['Y'])
    let inserted = 0, skipped = 0

    const toLocalISO = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

    const tryInsert = async (date, rule) => {
      const iso = toLocalISO(date)
      const [[dup]] = await pool.query('SELECT id FROM holiday WHERE holiday_date=?', [iso])
      if (dup) { skipped++; return }
      await pool.query(
        'INSERT INTO holiday (holiday_date,holiday_name_th,holiday_name_en,holiday_type_id,color_code,is_all_org,is_active) VALUES (?,?,?,?,?,?,?)',
        [iso, rule.rule_name, rule.rule_name_en||'', rule.holiday_type_id||null, rule.color_code||'', 'Y', 'Y']
      )
      inserted++
    }

    for (const rule of rules) {
      if (rule.rule_type === 'weekend') {
        for (let d = new Date(ceYear, 0, 1); d.getFullYear() === ceYear; d.setDate(d.getDate() + 1)) {
          const dow = d.getDay()
          if (dow === 0 || dow === 6) {
            const r2 = { ...rule, rule_name: rule.rule_name || DOW_TH[dow], rule_name_en: rule.rule_name_en || DOW_EN[dow] }
            await tryInsert(new Date(d), r2)
          }
        }
      } else if (rule.rule_type === 'weekday') {
        const dow = rule.day_of_week
        for (let d = new Date(ceYear, 0, 1); d.getFullYear() === ceYear; d.setDate(d.getDate() + 1)) {
          if (d.getDay() === dow) await tryInsert(new Date(d), rule)
        }
      } else if (rule.rule_type === 'fixed_date') {
        const d = new Date(ceYear, rule.fix_month - 1, rule.fix_day)
        if (d.getMonth() === rule.fix_month - 1) await tryInsert(d, rule)
      } else if (rule.rule_type === 'fixed_date_range') {
        const start = new Date(ceYear, rule.fix_month - 1, rule.fix_day)
        const end = new Date(ceYear, rule.fix_end_month - 1, rule.fix_end_day)
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          await tryInsert(new Date(d), rule)
        }
      } else if (rule.rule_type === 'nth_weekday') {
        const months = rule.nth_month ? [rule.nth_month] : [1,2,3,4,5,6,7,8,9,10,11,12]
        for (const m of months) {
          let count = 0
          for (let day = 1; day <= 31; day++) {
            const d = new Date(ceYear, m - 1, day)
            if (d.getMonth() !== m - 1) break
            if (d.getDay() === rule.day_of_week) {
              count++
              if (count === rule.nth_week) { await tryInsert(d, rule); break }
            }
          }
        }
      }
    }
    res.json({ inserted, skipped, total: inserted + skipped, year: ceYear })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// STAND BY SCHEDULE
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/standby', async (req, res) => {
  try {
    const { planId, startDate, endDate } = req.query
    let q = 'SELECT * FROM standby_schedules WHERE 1=1'
    const params = []
    if (planId) { q += ' AND plan_id=?'; params.push(planId) }
    if (startDate) { q += ' AND schedule_date>=?'; params.push(startDate) }
    if (endDate)   { q += ' AND schedule_date<=?'; params.push(endDate) }
    q += ' ORDER BY schedule_date, member_name'
    const [rows] = await pool.query(q, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Upsert single cell
app.post('/api/standby', async (req, res) => {
  const { planId, memberId, memberName, scheduleDate, status, note } = req.body
  try {
    await pool.query(
      `INSERT INTO standby_schedules (plan_id,member_id,member_name,schedule_date,status,note)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE status=VALUES(status), note=VALUES(note), updated_at=NOW()`,
      [planId, memberId||'', memberName, scheduleDate, status||'standby', note||'']
    )
    const [[row]] = await pool.query(
      'SELECT * FROM standby_schedules WHERE plan_id=? AND member_name=? AND schedule_date=?',
      [planId, memberName, scheduleDate]
    )
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Delete single cell (clear status)
app.delete('/api/standby', async (req, res) => {
  const { planId, memberName, scheduleDate } = req.body
  try {
    await pool.query(
      'DELETE FROM standby_schedules WHERE plan_id=? AND member_name=? AND schedule_date=?',
      [planId, memberName, scheduleDate]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Delete all schedules for a plan
app.delete('/api/standby/plan/:planId', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM standby_schedules WHERE plan_id=?', [req.params.planId])
    res.json({ ok: true, deleted: result.affectedRows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Batch upsert — auto-fill standby for all members × all dates
app.post('/api/standby/batch', async (req, res) => {
  try {
    const { records } = req.body
    if (!records?.length) return res.json({ ok: true, count: 0 })
    const values = records.map(r => [r.planId, r.memberId || '', r.memberName, r.scheduleDate, r.status || 'standby', ''])
    await pool.query(
      `INSERT INTO standby_schedules (plan_id,member_id,member_name,schedule_date,status,note)
       VALUES ? ON DUPLICATE KEY UPDATE status=VALUES(status), updated_at=NOW()`,
      [values]
    )
    res.json({ ok: true, count: records.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Summary per plan — count distinct dates per status (excluding holidays), not member×date
app.get('/api/standby/summary', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT plan_id,
        COUNT(DISTINCT CASE WHEN status IN ('office','onsite') THEN schedule_date END) AS office_count,
        COUNT(DISTINCT CASE WHEN status='standby'             THEN schedule_date END) AS standby_count,
        COUNT(DISTINCT CASE WHEN status='wfh'                 THEN schedule_date END) AS wfh_count,
        COUNT(DISTINCT CASE WHEN status='off'                 THEN schedule_date END) AS off_count,
        COUNT(DISTINCT schedule_date)                                                  AS total_count,
        COUNT(DISTINCT member_name)                                                    AS member_count
      FROM standby_schedules
      WHERE status != 'holiday'
      GROUP BY plan_id
    `)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Conflict check — members assigned onsite/standby/wfh in multiple plans on same day
app.get('/api/standby/conflicts', async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    let q = `SELECT member_name, schedule_date, COUNT(DISTINCT plan_id) as plan_count,
               GROUP_CONCAT(DISTINCT plan_id) as plan_ids
             FROM standby_schedules
             WHERE status NOT IN ('off','holiday')`
    const params = []
    if (startDate) { q += ' AND schedule_date>=?'; params.push(startDate) }
    if (endDate)   { q += ' AND schedule_date<=?'; params.push(endDate) }
    q += ' GROUP BY member_name, schedule_date HAVING plan_count > 1'
    const [rows] = await pool.query(q, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Get distinct working dates for a plan — used by DocTracking to sync with StandBy calendar
app.get('/api/standby/dates', async (req, res) => {
  try {
    const { planId } = req.query
    if (!planId) return res.status(400).json({ error: 'planId required' })
    const [rows] = await pool.query(
      'SELECT DISTINCT schedule_date FROM standby_schedules WHERE plan_id=? ORDER BY schedule_date',
      [planId]
    )
    res.json(rows.map(r => String(r.schedule_date).slice(0, 10)))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/doc-tracking', async (req, res) => {
  try {
    const { planId, startDate, endDate } = req.query
    let q = 'SELECT * FROM document_tracking WHERE 1=1'
    const params = []
    if (planId)    { q += ' AND plan_id=?';     params.push(planId) }
    if (startDate) { q += ' AND track_date>=?'; params.push(startDate) }
    if (endDate)   { q += ' AND track_date<=?'; params.push(endDate) }
    q += ' ORDER BY track_date, member_name'
    const [rows] = await pool.query(q, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/doc-tracking', async (req, res) => {
  const { planId, memberId, memberName, trackDate, status, note } = req.body
  try {
    await pool.query(
      `INSERT INTO document_tracking (plan_id,member_id,member_name,track_date,status,note)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE status=VALUES(status), note=VALUES(note), updated_at=NOW()`,
      [planId, memberId || '', memberName, trackDate, status || 'not_sent', note || '']
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/doc-tracking', async (req, res) => {
  const { planId, memberName, trackDate } = req.body
  try {
    await pool.query(
      `UPDATE document_tracking SET status='not_sent', updated_at=NOW()
       WHERE plan_id=? AND member_name=? AND track_date=?`,
      [planId, memberName, trackDate]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/doc-tracking/plan/:planId', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM document_tracking WHERE plan_id=?', [req.params.planId])
    res.json({ ok: true, deleted: result.affectedRows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/doc-tracking/batch', async (req, res) => {
  try {
    const { records } = req.body
    if (!records?.length) return res.json({ ok: true, count: 0 })
    for (const r of records) {
      await pool.query(
        `INSERT IGNORE INTO document_tracking (plan_id,member_id,member_name,track_date,status,note)
         VALUES (?,?,?,?,?,?)`,
        [r.planId, r.memberId || '', r.memberName, r.trackDate, r.status || 'not_sent', '']
      )
    }
    res.json({ ok: true, count: records.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/doc-tracking/summary', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT plan_id,
        SUM(status = 'sent')                       AS sent,
        SUM(status IN ('not_sent', 'pending'))      AS pending_count,
        SUM(status = 'holiday')                    AS holiday_count,
        COUNT(*)                                   AS total
      FROM document_tracking
      GROUP BY plan_id
    `)
    res.json(rows.map(r => ({
      planId:       String(r.plan_id),
      sent:         Number(r.sent         || 0),
      pendingCount: Number(r.pending_count || 0),
      holidayCount: Number(r.holiday_count || 0),
      total:        Number(r.total         || 0),
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── Hospcode search ──────────────────────────────────────────────────────────
app.get('/api/hospcode/search', async (req, res) => {
  const { q = '' } = req.query
  if (!q.trim()) return res.json([])
  try {
    const like = `%${q.trim()}%`
    const codeLike = `${q.trim()}%`
    const [rows] = await pool.query(
      `SELECT hospcode, name, province_name, bed_count, hosptype, addrpart
       FROM hospcode
       WHERE (hospcode LIKE ? OR name LIKE ?)
       ORDER BY CASE WHEN hospcode LIKE ? THEN 0 ELSE 1 END, hospcode
       LIMIT 15`,
      [codeLike, like, codeLike]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ─── SPA fallback (ต้องอยู่หลัง API routes ทั้งหมด) ──────────────────────────
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

// ─── Import hospcode data from SQL file (runs once in background) ─────────────
async function importHospcodeIfEmpty() {
  try {
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM hospcode')
    if (Number(cnt) > 0) return
    const sqlPath = path.join(__dirname, '../hospcode.sql')
    if (!fs.existsSync(sqlPath)) { console.log('⚠️ hospcode.sql not found, skip import'); return }
    console.log('📥 กำลัง import hospcode data (ครั้งแรก)...')
    const lines = fs.readFileSync(sqlPath, 'utf8').split('\n')
    const tuples = []
    for (const line of lines) {
      const t = line.trimStart()
      if (!t.startsWith('INSERT INTO `hospcode` VALUES')) continue
      const idx = t.indexOf(' VALUES ')
      if (idx === -1) continue
      let s = t.slice(idx + 8).trim()
      if (s.endsWith(';')) s = s.slice(0, -1)
      tuples.push(s.trim())
    }
    const BATCH = 1000
    for (let i = 0; i < tuples.length; i += BATCH) {
      const sql = `INSERT IGNORE INTO hospcode VALUES ${tuples.slice(i, i + BATCH).join(',')}`
      await pool.query(sql)
    }
    console.log(`✅ Import hospcode สำเร็จ: ${tuples.length} รายการ`)
  } catch (e) { console.error('❌ hospcode import error:', e.message) }
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001
runMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ API Server รันที่ port ${PORT}`)
    setImmediate(() => importHospcodeIfEmpty())
  })
})