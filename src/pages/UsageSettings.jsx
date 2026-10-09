import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || ''

const CATEGORY_LABEL = { operational: 'งานบัญชีประจำวัน (operational)', setup: 'ตั้งค่า/ข้อมูลพื้นฐาน (setup)', reporting: 'รายงานและ AI (reporting)', other: 'อื่นๆ (other)' }

function Section({ icon, title, hint, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20 }}>
      <h3 style={{ color: '#1e3a5f', fontSize: 15, marginBottom: 4 }}>{icon} {title}</h3>
      {hint && <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>{hint}</p>}
      {children}
    </div>
  )
}

const row = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: '1px solid #f1f5f9', marginBottom: 6 }
const smallInput = { padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 12.5 }
const smallBtn = (bg, color) => ({ padding: '6px 12px', background: bg, border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', color })

// ── หมวดหมู่เมนู ──────────────────────────────────────────────────────────────
function MenuCategorySection() {
  const [rows, setRows] = useState([])
  const [newGroup, setNewGroup] = useState('')
  const [newCat, setNewCat] = useState('operational')

  const load = useCallback(() => { fetch(`${API}/api/usage-settings/menu-category`).then(r => r.json()).then(setRows) }, [])
  useEffect(() => { load() }, [load])

  const save = async (menuGroup, category) => {
    await fetch(`${API}/api/usage-settings/menu-category`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ menuGroup, category }) })
    load()
  }
  const remove = async (menuGroup) => { await fetch(`${API}/api/usage-settings/menu-category/${encodeURIComponent(menuGroup)}`, { method: 'DELETE' }); load() }

  return (
    <Section icon="🗂️" title="หมวดหมู่เมนู (menu_group → category)" hint="ใช้คำนวณ 'งานบัญชีประจำวัน' vs 'ตั้งค่า' vs 'รายงาน' ในคะแนนการใช้งาน">
      {rows.map(r => (
        <div key={r.menu_group} style={row}>
          <span style={{ flex: 1, fontSize: 13 }}>{r.menu_group}</span>
          <select value={r.category} onChange={e => save(r.menu_group, e.target.value)} style={smallInput}>
            {Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button onClick={() => remove(r.menu_group)} style={smallBtn('#fef2f2', '#dc2626')}>ลบ</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input value={newGroup} onChange={e => setNewGroup(e.target.value)} placeholder="ชื่อ menu_group ใหม่" style={{ ...smallInput, flex: 1 }} />
        <select value={newCat} onChange={e => setNewCat(e.target.value)} style={smallInput}>
          {Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button onClick={() => { if (newGroup.trim()) { save(newGroup.trim(), newCat); setNewGroup('') } }} style={smallBtn('#0891b2', '#fff')}>+ เพิ่ม</button>
      </div>
    </Section>
  )
}

// ── posted_flag ───────────────────────────────────────────────────────────────
function PostedFlagSection() {
  const [rows, setRows] = useState([])
  const [newVal, setNewVal] = useState('')
  const [newPosted, setNewPosted] = useState(true)

  const load = useCallback(() => { fetch(`${API}/api/usage-settings/posted-flag`).then(r => r.json()).then(setRows) }, [])
  useEffect(() => { load() }, [load])

  const save = async (rawValue, isPosted) => {
    await fetch(`${API}/api/usage-settings/posted-flag`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawValue, isPosted }) })
    load()
  }
  const remove = async (rawValue) => { await fetch(`${API}/api/usage-settings/posted-flag/${encodeURIComponent(rawValue)}`, { method: 'DELETE' }); load() }

  return (
    <Section icon="✅" title="ค่า posted_flag ที่ถือว่า 'ผ่านรายการ'" hint="ค่าดิบจากไฟล์ JOURNAL_MONTHLY — ติ๊กว่าค่าไหนนับเป็นผ่านรายการแล้ว">
      {rows.map(r => (
        <div key={r.raw_value} style={row}>
          <span style={{ flex: 1, fontSize: 13, fontFamily: 'monospace' }}>{r.raw_value}</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={!!r.is_posted} onChange={e => save(r.raw_value, e.target.checked)} /> ผ่านรายการ
          </label>
          <button onClick={() => remove(r.raw_value)} style={smallBtn('#fef2f2', '#dc2626')}>ลบ</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="ค่าดิบใหม่ เช่น Y, posted" style={{ ...smallInput, flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={newPosted} onChange={e => setNewPosted(e.target.checked)} /> ผ่านรายการ
        </label>
        <button onClick={() => { if (newVal.trim()) { save(newVal.trim(), newPosted); setNewVal('') } }} style={smallBtn('#0891b2', '#fff')}>+ เพิ่ม</button>
      </div>
    </Section>
  )
}

// ── น้ำหนักคะแนน ──────────────────────────────────────────────────────────────
function KpiWeightSection() {
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetch(`${API}/api/usage-settings/kpi-config`).then(r => r.json()).then(setCfg) }, [])

  if (!cfg) return <Section icon="⚖️" title="น้ำหนักคะแนน Usage Score"><div style={{ color: '#94a3b8', fontSize: 13 }}>กำลังโหลด...</div></Section>

  const weightSum = Object.values(cfg.weights).reduce((a, b) => a + Number(b), 0)
  const setWeight = (k, v) => setCfg(p => ({ ...p, weights: { ...p.weights, [k]: Number(v) } }))
  const save = async () => {
    setSaving(true)
    await fetch(`${API}/api/usage-settings/kpi-config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
    setSaving(false)
  }

  const WEIGHT_LABELS = { business_day_rate: 'วันทำการที่ใช้งาน', hospital_staff_rate: 'สัดส่วนเจ้าหน้าที่ รพ.', system_coverage: 'ความครอบคลุมระบบงาน', has_journal: 'มีรายการบัญชีในเดือน', active_user_rate: 'อัตราผู้ใช้ active' }

  return (
    <Section icon="⚖️" title="น้ำหนักคะแนน Usage Score" hint={`รวมน้ำหนักต้องเท่ากับ 100 — ตอนนี้รวม ${weightSum}`}>
      {Object.entries(cfg.weights).map(([k, v]) => (
        <div key={k} style={row}>
          <span style={{ flex: 1, fontSize: 13 }}>{WEIGHT_LABELS[k] || k}</span>
          <input type="number" min="0" max="100" value={v} onChange={e => setWeight(k, e.target.value)} style={{ ...smallInput, width: 70, textAlign: 'right' }} />
          <span style={{ fontSize: 12, color: '#94a3b8' }}>%</span>
        </div>
      ))}
      {weightSum !== 100 && <div style={{ fontSize: 11.5, color: '#dc2626', marginTop: 4 }}>⚠️ รวมน้ำหนักไม่เท่ากับ 100 — คะแนนที่คำนวณจะคลาดเคลื่อน</div>}
      <button onClick={save} disabled={saving} style={{ ...smallBtn('#0891b2', '#fff'), marginTop: 12, padding: '8px 18px' }}>{saving ? 'กำลังบันทึก...' : 'บันทึกน้ำหนักคะแนน'}</button>
    </Section>
  )
}

// ── ผู้ใช้งานระบบ (role admin/viewer) ───────────────────────────────────────────
function UserRoleSection() {
  const [users, setUsers] = useState([])
  const load = useCallback(() => { fetch(`${API}/api/users`).then(r => r.json()).then(setUsers) }, [])
  useEffect(() => { load() }, [load])

  const setRole = async (id, role) => {
    await fetch(`${API}/api/users/${id}/role`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
    load()
  }

  return (
    <Section icon="🔐" title="สิทธิ์ผู้ใช้งานระบบ" hint="admin = ทำได้ทุกอย่าง (นำเข้า/ลบ/ตั้งค่า) · viewer = ดูอย่างเดียว">
      {users.map(u => (
        <div key={u.id} style={row}>
          <span style={{ flex: 1, fontSize: 13 }}>{u.name} <span style={{ color: '#94a3b8', fontSize: 11 }}>({u.username})</span></span>
          <select value={u.role} onChange={e => setRole(u.id, e.target.value)} style={smallInput}>
            <option value="admin">admin</option>
            <option value="viewer">viewer</option>
          </select>
        </div>
      ))}
      {users.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>ไม่มีผู้ใช้งาน</div>}
    </Section>
  )
}

export default function UsageSettings() {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, color: '#1e3a5f', marginBottom: 4 }}>⚙️ ตั้งค่า Usage Monitoring</h2>
        <p style={{ color: '#64748b', fontSize: 13 }}>ปรับ mapping และเกณฑ์การคำนวณคะแนนการใช้งาน</p>
      </div>
      <MenuCategorySection />
      <PostedFlagSection />
      <KpiWeightSection />
      <UserRoleSection />
    </div>
  )
}
