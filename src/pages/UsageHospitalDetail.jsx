import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import SearchableSelect from '../components/SearchableSelect'

const API = import.meta.env.VITE_API_URL || ''

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const ymLabel = (ym) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(4, 6)); return `${THAI_MONTHS[m - 1]} ${y + 543}` }
const DOW_LABELS = ['', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์']
const ACTION_LABELS = { add: 'เพิ่ม', edit: 'แก้ไข', delete: 'ลบ', import: 'นำเข้า', export: 'ส่งออก', post: 'ผ่านรายการ' }

const OPERATIONAL_GROUPS = new Set(['ระบบลูกหนี้', 'ระบบเจ้าหนี้', 'ระบบบัญชี', 'เมนูรายได้', 'ครุภัณฑ์'])
const SETUP_GROUPS = new Set(['ข้อมูลพื้นฐานระบบบัญชี', 'ข้อมูลพื้นฐานระบบเจ้าหนี้', 'ข้อมูลพื้นฐานระบบลูกหนี้', 'ความปลอดภัย'])
const categoryOf = (mg) => (OPERATIONAL_GROUPS.has(mg) ? 'operational' : SETUP_GROUPS.has(mg) ? 'setup' : 'reporting')
const CAT_COLOR = { operational: '#0891b2', setup: '#d97706', reporting: '#7c3aed' }
const CAT_LABEL = { operational: 'งานบัญชีประจำวัน', setup: 'ตั้งค่า/ข้อมูลพื้นฐาน', reporting: 'รายงานและ AI' }

const fmtDate = (d) => { if (!d) return '-'; const s = String(d).slice(0, 10); if (!s.includes('-')) return '-'; const [y, m, day] = s.split('-'); return `${day}/${m}/${Number(y) + 543}` }
const fmtDateTime = (d) => { if (!d) return '-'; const s = String(d).replace('T', ' ').slice(0, 16); const [date, time] = s.split(' '); return `${fmtDate(date)} ${time || ''}` }

function Section({ icon, title, hint, children, right }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: hint ? 4 : 14 }}>
        <h3 style={{ color: '#1e3a5f', fontSize: 15, margin: 0, flex: 1 }}>{icon} {title}</h3>
        {right}
      </div>
      {hint && <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>{hint}</p>}
      {children}
    </div>
  )
}

const th = { padding: '8px 12px', background: '#f1f5f9', color: '#374151', fontWeight: 700, textAlign: 'left', fontSize: 12, whiteSpace: 'nowrap' }
const td = { padding: '8px 12px', fontSize: 12.5, color: '#1e293b', borderTop: '1px solid #f1f5f9', whiteSpace: 'nowrap' }
const emptyBox = { color: '#94a3b8', textAlign: 'center', padding: 28, fontSize: 13 }

// ── กราฟแท่งซ้อนรายวัน 3 หมวด + เส้น login ──────────────────────────────────────
function DailyStackedChart({ daily, logins }) {
  const byDate = {}
  daily.forEach(d => {
    if (!byDate[d.activity_date]) byDate[d.activity_date] = { operational: 0, setup: 0, reporting: 0 }
    byDate[d.activity_date][categoryOf(d.menu_group)] += Number(d.n_actions || 0)
  })
  const loginByDate = {}
  logins.filter(l => l.event === 'login' && l.outcome === 'success').forEach(l => {
    const date = String(l.occurred_at).slice(0, 10)
    loginByDate[date] = (loginByDate[date] || 0) + 1
  })
  const dates = [...new Set([...Object.keys(byDate), ...Object.keys(loginByDate)])].sort()
  if (dates.length === 0) return <div style={emptyBox}>ไม่มีข้อมูล</div>

  const maxTotal = Math.max(1, ...dates.map(d => Object.values(byDate[d] || {}).reduce((a, b) => a + b, 0)))
  const maxLogin = Math.max(1, ...dates.map(d => loginByDate[d] || 0))
  const W = Math.max(600, dates.length * 22), H = 200, padBottom = 30, padTop = 10
  const barW = (W / dates.length) * 0.6

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H + padBottom} style={{ minWidth: '100%' }}>
        {dates.map((date, i) => {
          const x = (i + 0.2) * (W / dates.length)
          const d = byDate[date] || { operational: 0, setup: 0, reporting: 0 }
          let yCursor = H - padTop
          const bars = ['operational', 'setup', 'reporting'].map(cat => {
            const val = d[cat]
            const bh = (val / maxTotal) * (H - padTop)
            yCursor -= bh
            return <rect key={cat} x={x} y={yCursor} width={barW} height={bh} fill={CAT_COLOR[cat]} />
          })
          return <g key={date}>{bars}</g>
        })}
        {/* login line */}
        <polyline
          fill="none" stroke="#1e3a5f" strokeWidth="2"
          points={dates.map((date, i) => {
            const x = (i + 0.2) * (W / dates.length) + barW / 2
            const y = (H - padTop) - ((loginByDate[date] || 0) / maxLogin) * (H - padTop)
            return `${x},${y}`
          }).join(' ')}
        />
        {dates.map((date, i) => {
          if (i % Math.ceil(dates.length / 12) !== 0) return null
          const x = (i + 0.2) * (W / dates.length) + barW / 2
          return <text key={date} x={x} y={H + 18} fontSize="9" fill="#94a3b8" textAnchor="middle">{date.slice(8, 10)}/{date.slice(5, 7)}</text>
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11.5, color: '#64748b', flexWrap: 'wrap' }}>
        {Object.entries(CAT_LABEL).map(([k, l]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: CAT_COLOR[k] }} />{l}</span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 2, background: '#1e3a5f' }} />จำนวนเข้าสู่ระบบ</span>
      </div>
    </div>
  )
}

function HourHeatmap({ hourly }) {
  const grid = {}
  let max = 1
  hourly.forEach(h => { grid[`${h.iso_dow}_${h.hour}`] = h.n_actions; max = Math.max(max, h.n_actions) })
  const hours = Array.from({ length: 24 }, (_, i) => i)
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}></th>
            {hours.map(h => <th key={h} style={{ ...th, textAlign: 'center', padding: '4px 6px', background: (h >= 8 && h < 17) ? '#eff6ff' : '#f1f5f9' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7].map(dow => (
            <tr key={dow}>
              <td style={{ ...td, fontWeight: 600 }}>{DOW_LABELS[dow]}</td>
              {hours.map(h => {
                const v = grid[`${dow}_${h}`] || 0
                const alpha = v ? 0.15 + (v / max) * 0.75 : 0
                return <td key={h} style={{ padding: 4, textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ width: 22, height: 18, borderRadius: 3, background: v ? `rgba(8,145,178,${alpha})` : '#f8fafc', fontSize: 9, color: alpha > 0.5 ? '#fff' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {v > 0 ? v : ''}
                  </div>
                </td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>พื้นหลังฟ้าอ่อน = ช่วงเวลาราชการ (08:00–16:59)</div>
    </div>
  )
}

function buildObservations(score) {
  const obs = []
  if (score.hospital_staff_rate < 40) obs.push({ level: 'danger', text: `สัดส่วนงานโดยเจ้าหน้าที่ รพ. ต่ำมาก (${Number(score.hospital_staff_rate).toFixed(1)}%) — งานส่วนใหญ่ยังเป็นทีมผู้ติดตั้ง/IT ทำแทน ควรเร่งถ่ายโอนให้เจ้าหน้าที่ รพ. ดำเนินการเอง` })
  else if (score.hospital_staff_rate < 70) obs.push({ level: 'warn', text: `สัดส่วนงานโดยเจ้าหน้าที่ รพ. ยังไม่ถึงเกณฑ์ (${Number(score.hospital_staff_rate).toFixed(1)}%) ควรติดตามต่อเนื่อง` })
  if (score.business_day_rate < 50) obs.push({ level: 'danger', text: `ใช้งานเพียง ${Number(score.business_day_rate).toFixed(0)}% ของวันทำการ — มีความเสี่ยงว่ายังไม่ได้ใช้งานต่อเนื่อง` })
  else if (score.business_day_rate < 80) obs.push({ level: 'warn', text: `ใช้งาน ${Number(score.business_day_rate).toFixed(0)}% ของวันทำการ ควรติดตามความต่อเนื่อง` })
  if (Number(score.success_rate) < 90) obs.push({ level: 'danger', text: `อัตราทำรายการสำเร็จต่ำ (${Number(score.success_rate).toFixed(1)}%) ควรตรวจสาเหตุความล้มเหลว` })
  else if (Number(score.success_rate) < 97) obs.push({ level: 'warn', text: `อัตราทำรายการสำเร็จ ${Number(score.success_rate).toFixed(1)}% ต่ำกว่าเกณฑ์ที่ดี` })
  if (Number(score.journal_posted_rate) < 95 && score.journal_entries > 0) obs.push({ level: 'review', text: `อัตราผ่านรายการบัญชี ${Number(score.journal_posted_rate).toFixed(1)}% ควรทบทวนรายการที่ค้าง` })
  if (Number(score.offhours_rate) > 20) obs.push({ level: 'warn', text: `ใช้งานนอกเวลาราชการสูง (${Number(score.offhours_rate).toFixed(1)}%) ควรติดตามเหตุผล` })
  if (score.login_failed_count >= 5) obs.push({ level: 'review', text: `พบความพยายามเข้าสู่ระบบไม่สำเร็จ ${score.login_failed_count} ครั้ง ควรตรวจสอบ` })
  if (score.inactive_account_count > 0) obs.push({ level: 'review', text: `มีบัญชีผู้ใช้ไม่เคลื่อนไหวเกิน 30 วัน จำนวน ${score.inactive_account_count} บัญชี` })
  if (Number(score.admin_account_rate) > 30) obs.push({ level: 'warn', text: `สัดส่วนบัญชี Admin สูง (${Number(score.admin_account_rate).toFixed(1)}%) ควรทบทวนสิทธิ์การเข้าถึง` })
  if (obs.length === 0) obs.push({ level: 'ok', text: 'ผ่านเกณฑ์ตัวชี้วัดหลักทุกข้อในงวดนี้' })
  return obs
}
const handlePrint = (printRef, hospName, periodLabel) => {
  const content = printRef.current.innerHTML
  const win = window.open('', '_blank')
  win.document.write(`
    <html><head>
      <meta charset="utf-8">
      <title>รายงาน Usage — ${hospName}</title>
      <style>
        body { font-family: 'Sarabun', 'Tahoma', sans-serif; font-size: 13px; color: #1e293b; margin: 0; padding: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th, td { border: 1px solid #e2e8f0; padding: 6px 10px; font-size: 11px; }
        th { background: #f1f5f9; font-weight: 700; }
        h3 { font-size: 14px; color: #1e3a5f; margin: 14px 0 8px; }
        @media print { body { padding: 0; } button { display: none; } }
      </style>
    </head><body>
      <div style="text-align:center;border-bottom:2px solid #1e3a5f;padding-bottom:16px;margin-bottom:20px;">
        <div style="font-size:11px;color:#94a3b8;">รายงานติดตามการใช้งานระบบบัญชี (Usage)</div>
        <h1 style="font-size:20px;color:#1e3a5f;margin:4px 0;">${hospName}</h1>
        <div style="font-size:13px;color:#374151;">รอบข้อมูล: ${periodLabel}</div>
      </div>
      ${content}
    </body></html>
  `)
  win.document.close()
  win.print()
}

const OBS_STYLE = {
  danger: { icon: '🔴', bg: '#fef2f2', border: '#fecaca', color: '#991b1b', label: 'ต้องแก้ไข' },
  warn: { icon: '🟡', bg: '#fffbeb', border: '#fde68a', color: '#92400e', label: 'ติดตาม' },
  review: { icon: '🔵', bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af', label: 'ทบทวน' },
  ok: { icon: '🟢', bg: '#f0fdf4', border: '#86efac', color: '#166534', label: 'ผ่านเกณฑ์' },
}

export default function UsageHospitalDetail() {
  const { hospitals } = useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const hospitalId = params.get('hospitalId') || ''
  const ym = params.get('ym') || ''

  const [periods, setPeriods] = useState([])
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [evidenceTab, setEvidenceTab] = useState('failures')
  const [showTab, setShowTab] = useState('overview')
  const printRef = useRef()

  const setHospitalId = (id) => setParams(id ? { hospitalId: id } : {})
  const setYm = (y) => setParams({ hospitalId, ym: y })

  useEffect(() => {
    if (!hospitalId) { setPeriods([]); return }
    fetch(`${API}/api/usage/periods/${hospitalId}`).then(r => r.json()).then(list => {
      const arr = Array.isArray(list) ? list : []
      setPeriods(arr)
      if (!ym && arr.length) setYm(arr[0].ym)
    }).catch(() => setPeriods([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalId])

  const loadDetail = useCallback(() => {
    if (!hospitalId || !ym) { setDetail(null); return }
    setLoading(true)
    fetch(`${API}/api/usage/hospital/${hospitalId}?ym=${ym}`).then(r => r.json()).then(d => { setDetail(d); setLoading(false) }).catch(() => setLoading(false))
  }, [hospitalId, ym])
  useEffect(() => { loadDetail() }, [loadDetail])

  const getHospName = (id) => hospitals.find(h => String(h.id) === String(id))?.name || `รพ. ${id}`

  const categoryTotals = useMemo(() => {
    if (!detail) return { operational: 0, setup: 0, reporting: 0 }
    const out = { operational: 0, setup: 0, reporting: 0 }
    detail.daily.forEach(d => { out[categoryOf(d.menu_group)] += Number(d.n_actions || 0) })
    return out
  }, [detail])

  const actionTotals = useMemo(() => {
    if (!detail) return {}
    const out = {}
    detail.daily.forEach(d => { out[d.action] = (out[d.action] || 0) + Number(d.n_actions || 0) })
    return out
  }, [detail])

  const inactiveUsers = useMemo(() => (detail?.users || []).filter(u => {
    if (!u.lastLogin) return true
    return (new Date() - new Date(u.lastLogin)) / 86400000 > 30
  }), [detail])

  const journalByYm = useMemo(() => {
    if (!detail) return []
    const map = {}
    detail.journal.forEach(j => { map[j.ym] = (map[j.ym] || 0) + Number(j.n_entries || 0) })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [detail])

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, color: '#1e3a5f', marginBottom: 4 }}>🏥 แดชบอร์ด Usage — รายโรงพยาบาล</h2>
        <p style={{ color: '#64748b', fontSize: 13 }}>รายละเอียดการใช้งานจริงของโรงพยาบาลแต่ละแห่ง</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchableSelect value={hospitalId} onChange={setHospitalId}
          options={hospitals.map(h => ({ value: String(h.id), label: h.name }))}
          allLabel="-- เลือกโรงพยาบาล --" style={{ minWidth: 240 }} />
        {periods.length > 0 && (
          <select value={ym} onChange={e => setYm(e.target.value)} style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
            {periods.map(p => <option key={p.ym} value={p.ym}>รอบ {ymLabel(p.ym)}</option>)}
          </select>
        )}
        <button onClick={() => navigate('/usage-overview')} style={{ marginLeft: 'auto', padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#64748b' }}>← กลับภาพรวม</button>
      </div>

      {!hospitalId ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 60, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏥</div><div style={{ fontSize: 16, fontWeight: 600 }}>เลือกโรงพยาบาลเพื่อดูรายละเอียด</div>
        </div>
      ) : periods.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 60, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div><div style={{ fontSize: 16, fontWeight: 600 }}>{getHospName(hospitalId)} ยังไม่มีข้อมูล Usage</div>
        </div>
      ) : loading || !detail ? (
        <div style={emptyBox}>กำลังโหลดข้อมูล...</div>
      ) : (() => {
        const s = detail.score
        const obs = buildObservations(s)
        return (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button onClick={() => handlePrint(printRef, getHospName(hospitalId), ymLabel(ym))} style={{
                padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>🖨️ พิมพ์ / PDF</button>
            </div>
            <div ref={printRef}>
            {/* สรุปประโยคเดียว */}
            <div style={{ background: '#1e3a5f', color: '#fff', borderRadius: 12, padding: '16px 22px', marginBottom: 20, fontSize: 14.5, fontWeight: 600 }}>
              💬 {getHospName(hospitalId)} มีการใช้งานจริง {s.active_business_days}/{s.business_days} วันทำการ ({Number(s.business_day_rate).toFixed(0)}%)
              · คะแนนการใช้งาน {Number(s.usage_score).toFixed(1)} ({s.usage_level})
              · สัดส่วนเจ้าหน้าที่ รพ. {Number(s.hospital_staff_rate).toFixed(1)}%
              {s.business_days_from && s.business_days_from !== s.period_start && (
                <div style={{ fontSize: 12, fontWeight: 400, color: '#bfdbfe', marginTop: 4 }}>
                  📌 นับวันทำการจากวันเริ่มโครงการ {fmtDate(s.business_days_from)} (ไม่นับวันก่อนเริ่มโครงการ) ถึง {fmtDate(s.period_end)}
                </div>
              )}
            </div>

            {/* KPI 6 ช่อง */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 14, marginBottom: 20 }}>
              {[
                { icon: '🔑', label: 'เข้าสู่ระบบ / บัญชีทั้งหมด', value: `${s.n_users_login}/${s.n_users_total}`, color: '#1e3a5f', bg: '#eff6ff' },
                { icon: '✍️', label: 'ผู้ใช้ที่บันทึกข้อมูล', value: s.n_users_active, color: '#0891b2', bg: '#ecfeff' },
                { icon: '⚡', label: 'การกระทำ', value: Number(s.n_actions_total).toLocaleString('th-TH'), color: '#7c3aed', bg: '#f5f3ff' },
                { icon: '✅', label: 'อัตราทำรายการสำเร็จ', value: `${Number(s.success_rate).toFixed(1)}%`, color: Number(s.success_rate) >= 97 ? '#16a34a' : '#d97706', bg: '#f0fdf4' },
                { icon: '📅', label: 'วันทำการที่ใช้งาน', value: `${Number(s.business_day_rate).toFixed(0)}%`, color: '#d97706', bg: '#fffbeb' },
                { icon: '🏢', label: 'สัดส่วนเจ้าหน้าที่ รพ.', value: `${Number(s.hospital_staff_rate).toFixed(1)}%`, color: Number(s.hospital_staff_rate) >= 70 ? '#16a34a' : Number(s.hospital_staff_rate) >= 40 ? '#d97706' : '#dc2626', bg: '#fef2f2' },
              ].map(k => (
                <div key={k.label} style={{ background: k.bg, borderRadius: 12, padding: '14px 18px', border: `1px solid ${k.color}22` }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
                  <div style={{ fontSize: 19, fontWeight: 700, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Sub-tabs: ภาพรวม / หลักฐาน */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
              {[['overview', '📋 ภาพรวม'], ['evidence', '🔍 หลักฐาน']].map(([key, label]) => (
                <button key={key} onClick={() => setShowTab(key)} style={{
                  padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: 'none', color: showTab === key ? '#0891b2' : '#64748b',
                  borderBottom: `3px solid ${showTab === key ? '#0891b2' : 'transparent'}`, marginBottom: -2,
                }}>{label}</button>
              ))}
            </div>

            {showTab === 'overview' && (
              <>
                <Section icon="📈" title="กราฟแท่งซ้อนรายวัน (3 หมวด + จำนวนเข้าสู่ระบบ)">
                  <DailyStackedChart daily={detail.daily} logins={detail.logins} />
                </Section>

                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, marginBottom: 0 }}>
                  <Section icon="🏆" title="เมนูที่ใช้มากสุด 12 อันดับ">
                    {detail.menuUsage.length === 0 ? <div style={emptyBox}>ไม่มีข้อมูล</div> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {detail.menuUsage.map((m, i) => {
                          const max = detail.menuUsage[0].n_actions
                          return (
                            <div key={i}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                                <span>{i + 1}. {m.menu_label}</span><span style={{ fontWeight: 700 }}>{m.n_actions}</span>
                              </div>
                              <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6 }}>
                                <div style={{ width: `${(m.n_actions / max) * 100}%`, background: CAT_COLOR[categoryOf(m.menu_group)], height: '100%', borderRadius: 4 }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </Section>

                  <Section icon="🧩" title="สัดส่วนตามระบบงาน / ประเภทการกระทำ">
                    <div style={{ marginBottom: 16 }}>
                      {Object.entries(CAT_LABEL).map(([k, l]) => {
                        const total = categoryTotals.operational + categoryTotals.setup + categoryTotals.reporting
                        const pct = total ? Math.round((categoryTotals[k] / total) * 100) : 0
                        return (
                          <div key={k} style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{l}</span><span>{pct}%</span></div>
                            <div style={{ background: '#f1f5f9', borderRadius: 4, height: 6 }}><div style={{ width: `${pct}%`, background: CAT_COLOR[k], height: '100%', borderRadius: 4 }} /></div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {Object.entries(actionTotals).map(([a, n]) => (
                        <span key={a} style={{ padding: '4px 10px', borderRadius: 20, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 11.5 }}>{ACTION_LABELS[a] || a}: <b>{n}</b></span>
                      ))}
                    </div>
                  </Section>
                </div>

                <Section icon="👥" title={`ตารางรายผู้ใช้ (${detail.users.length} คน)`}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>{['ชื่อ', 'ตำแหน่ง', 'เข้าระบบ', 'การกระทำ', 'วันที่ใช้งาน', 'งานหลัก', 'ใช้งานล่าสุด'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {detail.users.map(u => {
                          const mainAction = Object.entries({ add: u.nAdd, edit: u.nEdit, delete: u.nDelete, import: u.nImport, export: u.nExport, post: u.nPost }).sort((a, b) => b[1] - a[1])[0]
                          return (
                            <tr key={u.username}>
                              <td style={{ ...td, fontWeight: 600 }}>{u.fullName || u.username}</td>
                              <td style={td}>
                                {u.position}
                                <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: u.role === 'hospital_staff' ? '#f0fdf4' : '#eff6ff', color: u.role === 'hospital_staff' ? '#16a34a' : '#0891b2' }}>
                                  {u.role === 'hospital_staff' ? 'เจ้าหน้าที่ รพ.' : 'ผู้ติดตั้ง/IT'}
                                </span>
                              </td>
                              <td style={{ ...td, textAlign: 'right' }}>{u.activeDays} วัน</td>
                              <td style={{ ...td, textAlign: 'right' }}>{u.nActions}{u.nFailed > 0 && <span style={{ color: '#dc2626' }}> ({u.nFailed} ล้มเหลว)</span>}</td>
                              <td style={{ ...td, textAlign: 'right' }}>{u.activeDays}</td>
                              <td style={td}>{mainAction && mainAction[1] > 0 ? ACTION_LABELS[mainAction[0]] : '-'}</td>
                              <td style={td}>{fmtDateTime(u.lastAt)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {inactiveUsers.length > 0 && (
                    <div style={{ marginTop: 14, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12.5 }}>
                      ⚠️ บัญชีไม่เคลื่อนไหวเกิน 30 วัน ({inactiveUsers.length}): {inactiveUsers.map(u => u.fullName || u.username).join(', ')}
                    </div>
                  )}
                </Section>

                <Section icon="🕐" title="Heatmap วัน × ชั่วโมง">
                  <HourHeatmap hourly={detail.hourly} />
                </Section>

                <Section icon="📒" title="รายการบัญชีรายเดือน (Journal)">
                  {journalByYm.length === 0 ? <div style={emptyBox}>ไม่มีข้อมูล</div> : (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 120 }}>
                      {journalByYm.map(([jym, n]) => {
                        const max = Math.max(...journalByYm.map(x => x[1]), 1)
                        return (
                          <div key={jym} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{n}</span>
                            <div style={{ width: '70%', height: `${(n / max) * 80}px`, background: '#0891b2', borderRadius: '4px 4px 0 0' }} />
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>{ymLabel(jym)}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Section>

                <Section icon="🧭" title="การ์ดข้อสังเกต">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {obs.map((o, i) => {
                      const st = OBS_STYLE[o.level]
                      return (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderRadius: 9, background: st.bg, border: `1px solid ${st.border}` }}>
                          <span>{st.icon}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: '#fff', padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>{st.label}</span>
                          <span style={{ fontSize: 12.5, color: '#1e293b' }}>{o.text}</span>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              </>
            )}

            {showTab === 'evidence' && (
              <Section icon="🔍" title="หลักฐาน — FAILURES และ LOGINS" right={
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['failures', `FAILURES (${detail.failures.length})`], ['logins', `LOGINS (${detail.logins.length})`]].map(([k, l]) => (
                    <button key={k} onClick={() => setEvidenceTab(k)} style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      background: evidenceTab === k ? '#0891b2' : '#f1f5f9', color: evidenceTab === k ? '#fff' : '#64748b', border: 'none',
                    }}>{l}</button>
                  ))}
                </div>
              }>
                {evidenceTab === 'failures' ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>{['วันที่', 'ผู้ใช้', 'เมนู', 'การกระทำ', 'รหัสผิดพลาด', 'ข้อความ'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {detail.failures.map((f, i) => (
                          <tr key={i}>
                            <td style={td}>{fmtDate(f.activity_date)}</td>
                            <td style={td}>{f.username}</td>
                            <td style={td}>{f.menu_label}</td>
                            <td style={td}>{ACTION_LABELS[f.action] || f.action}</td>
                            <td style={td}>{f.status_code}</td>
                            <td style={{ ...td, whiteSpace: 'normal', minWidth: 200 }}>{f.error_message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {detail.failures.length === 0 && <div style={emptyBox}>✅ ไม่พบข้อผิดพลาด</div>}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>{['เวลา', 'เหตุการณ์', 'ผู้ใช้', 'ผล', 'เหตุผล', 'IP'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {detail.logins.map((l, i) => (
                          <tr key={i}>
                            <td style={td}>{fmtDateTime(l.occurred_at)}</td>
                            <td style={td}>{l.event}</td>
                            <td style={td}>{l.username}</td>
                            <td style={td}>
                              <span style={{ color: l.outcome === 'success' ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{l.outcome === 'success' ? 'สำเร็จ' : 'ล้มเหลว'}</span>
                            </td>
                            <td style={td}>{l.failure_reason || '-'}</td>
                            <td style={td}>{l.ip_address}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {detail.batch && (
                  <div style={{ marginTop: 14, fontSize: 11.5, color: '#94a3b8' }}>
                    📎 ไฟล์ต้นฉบับ: {detail.batch.file_name || '-'} · นำเข้าโดย {detail.batch.imported_by} เมื่อ {fmtDateTime(detail.batch.imported_at)}
                  </div>
                )}
              </Section>
            )}
            </div>
          </>
        )
      })()}
    </div>
  )
}
