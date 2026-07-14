import { useState, useEffect, useCallback, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import * as XLSX from 'xlsx'
import DateInput from '../components/DateInput'

const API = '/api'

const STATUS = {
  sent:     { label: 'ส่งแล้ว',         color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  not_sent: { label: 'ยังไม่ส่ง',       color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
  resigned: { label: 'ถอนทีม',          color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' },
  not_live: { label: 'ยังไม่ขึ้นระบบ',  color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
  leave:    { label: 'ลา',              color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
  holiday:  { label: 'วันหยุด',         color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
  // ── backward compat (ไม่แสดงใน dropdown แต่ยังแสดงผลได้) ──
  review:   { label: 'รอตรวจ',          color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  pending:  { label: 'ค้างส่ง',         color: '#ea580c', bg: '#fff7ed', border: '#fdba74' },
  secret:   { label: 'ติดลับ',          color: '#db2777', bg: '#fdf2f8', border: '#f9a8d4' },
}
const SELECTABLE = ['sent', 'not_sent', 'resigned', 'not_live', 'leave', 'holiday']

const THAI_DAYS   = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

const toISO    = (d) => d ? String(d).slice(0, 10) : ''
const fmtBE    = (iso) => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return `${parseInt(d)} ${THAI_MONTHS[parseInt(m)-1]} ${parseInt(y)+543}` }
const fmtShort = (iso) => { if (!iso) return ''; const [,m,d] = iso.split('-'); return `${parseInt(d)} ${THAI_MONTHS[parseInt(m)-1]}` }

const ROLE_RANK = [
  ['ผู้จัดการ','manager','pm','director'],
  ['หัวหน้า','lead','leader','supervisor','chief'],
  ['อาวุโส','senior','sr.'],
  ['ที่ปรึกษา','consultant','advisor'],
  ['วิศวกร','engineer'],
  ['นักวิชาการ','analyst','specialist'],
  ['ผู้ดูแล','admin','support','technician'],
]
const roleRank = (role) => {
  const r = (role || '').toLowerCase()
  const idx = ROLE_RANK.findIndex(kws => kws.some(kw => r.includes(kw)))
  return idx >= 0 ? idx : ROLE_RANK.length
}
const sortMembers = (team, teamLeader, siteOwner) =>
  [...team]
    .map(t => ({ memberId: String(t.memberId ?? ''), name: t.name ?? '', role: t.role ?? '' }))
    .sort((a, b) => {
      const ra = a.name === teamLeader ? -2 : a.name === siteOwner ? -1 : roleRank(a.role)
      const rb = b.name === teamLeader ? -2 : b.name === siteOwner ? -1 : roleRank(b.role)
      return ra - rb || (a.name || '').localeCompare(b.name || '', 'th')
    })

// ── Add Modal ─────────────────────────────────────────────────────────────────
function AddModal({ plans, hospitals, onSave, onClose }) {
  const [selPlanId, setSelPlanId]             = useState('')
  const [saving, setSaving]                   = useState(false)
  const [error, setError]                     = useState('')
  const [holidays, setHolidays]               = useState(new Set())
  const [standbyDates, setStandbyDates]       = useState([])
  const [standbyLoading, setStandbyLoading]   = useState(false)

  const activePlan = plans?.find(p => String(p.id) === selPlanId) ?? null
  const hosp       = activePlan ? hospitals.find(h => String(h.id) === String(activePlan.hospitalId)) : null
  const planStart  = activePlan ? toISO(activePlan.startDate || activePlan.onlineStart) : ''
  const planEnd    = activePlan ? toISO(activePlan.endDate   || activePlan.onlineEnd)   : ''
  const members    = useMemo(() => activePlan?.team ? sortMembers(activePlan.team, activePlan.teamLeader, activePlan.siteOwner) : [], [activePlan])

  // ── Fetch StandBy dates for selected plan ───────────────────────────────────
  useEffect(() => {
    if (!selPlanId) { setStandbyDates([]); return }
    let cancelled = false
    setStandbyLoading(true)
    fetch(`${API}/standby/dates?planId=${selPlanId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setStandbyDates(Array.isArray(d) ? d : []) })
      .catch(() => { if (!cancelled) setStandbyDates([]) })
      .finally(() => { if (!cancelled) setStandbyLoading(false) })
    return () => { cancelled = true }
  }, [selPlanId])

  // ── Fetch holidays for year range ────────────────────────────────────────────
  useEffect(() => {
    if (!planStart || !planEnd) { setHolidays(new Set()); return }
    const y1 = parseInt(planStart.slice(0,4)), y2 = parseInt(planEnd.slice(0,4))
    const ce1 = y1 >= 2400 ? y1-543 : y1, ce2 = y2 >= 2400 ? y2-543 : y2
    Promise.all([...new Set([ce1,ce2])].map(yr =>
      fetch(`${API}/holidays?year=${yr}&isActive=Y`).then(r => r.json()).catch(() => [])
    )).then(res => setHolidays(new Set(res.flat().map(h => toISO(h.holiday_date)))))
  }, [planStart, planEnd])

  const handleCreate = async () => {
    if (!activePlan)            return setError('กรุณาเลือกโครงการ')
    if (!standbyDates.length)   return setError('โครงการนี้ยังไม่มีตาราง Stand By กรุณาสร้างตาราง Stand By ก่อน')
    if (!members.length)        return setError('โครงการนี้ยังไม่มีทีมงาน')
    setError(''); setSaving(true)
    try {
      const records = members.flatMap(m =>
        standbyDates.map(d => ({
          planId: Number(activePlan.id), memberId: m.memberId, memberName: m.name,
          trackDate: d, status: holidays.has(d) ? 'holiday' : 'not_sent',
        }))
      )
      const res = await fetch(`${API}/doc-tracking/batch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'บันทึกไม่สำเร็จ') }
      onSave(activePlan.id)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const dateStart = standbyDates.length > 0 ? standbyDates[0] : ''
  const dateEnd   = standbyDates.length > 0 ? standbyDates[standbyDates.length - 1] : ''

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:520, boxShadow:'0 20px 60px rgba(0,0,0,0.3)', overflow:'hidden' }}>
        <div style={{ background:'linear-gradient(135deg,#1e3a5f,#16a34a)', padding:'18px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ color:'#fff', fontWeight:700, fontSize:16 }}>📋 เพิ่มการติดตามเอกสาร</div>
            <div style={{ color:'rgba(255,255,255,0.75)', fontSize:12, marginTop:2 }}>
              {activePlan ? `${hosp?.name ? `[${hosp.name}] ` : ''}${activePlan.projectName}` : 'เลือกโครงการเพื่อดำเนินการ'}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, color:'#fff', fontSize:18, cursor:'pointer', width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:8 }}>🏥 เลือกโครงการ *</div>
            {plans.length === 0 ? (
              <div style={{ padding:'14px 16px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, fontSize:13, color:'#16a34a', textAlign:'center' }}>
                ✅ ทุกโครงการมีการติดตามเอกสารแล้ว
              </div>
            ) : (
              <select value={selPlanId} onChange={e => setSelPlanId(e.target.value)}
                style={{ width:'100%', padding:'9px 12px', border:`1.5px solid ${selPlanId?'#0891b2':'#e2e8f0'}`, borderRadius:8, fontSize:13, background:'#fff', boxSizing:'border-box' }}>
                <option value="">-- เลือกโครงการ --</option>
                {plans.map(p => {
                  const h = hospitals.find(hh => String(hh.id) === String(p.hospitalId))
                  const s = toISO(p.startDate || p.onlineStart), e = toISO(p.endDate || p.onlineEnd)
                  const range = s ? ` (${fmtShort(s)}–${fmtShort(e)})` : ''
                  return <option key={p.id} value={p.id}>{h ? `[${h.name}] ` : ''}{p.projectName}{range}</option>
                })}
              </select>
            )}
          </div>

          {activePlan && (
            <div style={{ background:'#f8fafc', borderRadius:10, padding:14, border:'1px solid #e2e8f0' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                {[
                  { label:'ช่วงเวลา (Stand By)',
                    val: standbyLoading ? '...' : dateStart ? `${fmtShort(dateStart)} – ${fmtShort(dateEnd)}` : planStart ? `${fmtShort(planStart)} – ${fmtShort(planEnd)}` : '—',
                    color:'#1e293b', size:13 },
                  { label:'วันจาก Stand By',
                    val: standbyLoading ? '⏳' : standbyDates.length,
                    color: standbyDates.length > 0 ? '#0891b2' : '#dc2626', size:20 },
                  { label:'ทีมงาน',
                    val: `${members.length} คน`, color:'#7c3aed', size:18 },
                ].map(item => (
                  <div key={item.label} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:11, color:'#94a3b8', marginBottom:2 }}>{item.label}</div>
                    <div style={{ fontWeight:700, color:item.color, fontSize:item.size }}>{item.val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activePlan && !standbyLoading && standbyDates.length === 0 && (
            <div style={{ padding:'12px 14px', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8, fontSize:13, color:'#92400e' }}>
              ⚠️ โครงการนี้ยังไม่มีตาราง Stand By<br/>
              <span style={{ fontSize:12 }}>กรุณาสร้างตาราง Stand By ก่อน เพื่อให้วันทำงานในการติดตามเอกสารตรงกัน</span>
            </div>
          )}

          {error && <div style={{ padding:'10px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, fontSize:13, color:'#dc2626' }}>⚠️ {error}</div>}

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={onClose} style={{ flex:1, padding:11, background:'#f1f5f9', color:'#374151', border:'none', borderRadius:8, fontSize:14, cursor:'pointer' }}>ยกเลิก</button>
            <button onClick={handleCreate} disabled={saving || !selPlanId || standbyDates.length === 0}
              style={{ flex:2, padding:11, background: (saving||!selPlanId||standbyDates.length===0) ? '#94a3b8' : 'linear-gradient(135deg,#1e3a5f,#16a34a)', color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:700, cursor: (saving||!selPlanId||standbyDates.length===0) ? 'default':'pointer' }}>
              {saving ? '⏳ กำลังสร้าง...' : '✅ สร้างการติดตาม'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DocTracking() {
  const today = new Date()
  const todayISO = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const { projectPlans, hospitals } = useApp()

  const [view, setView]             = useState('list')
  const [selPlanId, setSelPlanId]   = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [filterYear, setFilterYear] = useState(String(today.getFullYear() + 543))
  const [filterSearch, setFilterSearch] = useState('')
  const [planSummaries, setPlanSummaries] = useState({})

  const [records, setRecords]       = useState({})
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [holidays, setHolidays]     = useState(new Set())
  const [standbyDates, setStandbyDates]     = useState([])
  const [standbyLoading, setStandbyLoading] = useState(false)
  const [filterDateStart, setFilterDateStart] = useState(todayISO)
  const [filterDateEnd, setFilterDateEnd]     = useState(todayISO)
  const [filterMember, setFilterMember]       = useState('')
  const [page, setPage]             = useState(1)
  const PAGE_SIZE = 20

  // ── Summaries ───────────────────────────────────────────────────────────────
  const loadSummaries = useCallback(async () => {
    try {
      const data = await fetch(`${API}/doc-tracking/summary`).then(r => r.json())
      const map = {}
      ;(Array.isArray(data) ? data : []).forEach(r => { map[r.planId] = r })
      setPlanSummaries(map)
    } catch { setPlanSummaries({}) }
  }, [])

  useEffect(() => { loadSummaries() }, [loadSummaries])

  // ── Available years ─────────────────────────────────────────────────────────
  const availYears = useMemo(() => {
    const ys = new Set()
    projectPlans.forEach(p => {
      const s = toISO(p.startDate || p.onlineStart), e = toISO(p.endDate || p.onlineEnd)
      if (s) ys.add(parseInt(s.slice(0,4)) + 543)
      if (e) ys.add(parseInt(e.slice(0,4)) + 543)
    })
    const cy = today.getFullYear() + 543
    ;[cy-1, cy, cy+1].forEach(y => ys.add(y))
    return [...ys].sort()
  }, [projectPlans])

  // ── Filtered list ───────────────────────────────────────────────────────────
  const overviewPlans = useMemo(() => {
    let plans = projectPlans.filter(p => planSummaries[String(p.id)])
    if (filterYear) {
      const fy = Number(filterYear)
      plans = plans.filter(p => {
        const s = toISO(p.startDate || p.onlineStart), e = toISO(p.endDate || p.onlineEnd)
        const sy = s ? parseInt(s.slice(0,4))+543 : null, ey = e ? parseInt(e.slice(0,4))+543 : null
        if (!sy && !ey) return false
        if (sy && ey) return sy <= fy && fy <= ey
        return sy === fy || ey === fy
      })
    }
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase()
      plans = plans.filter(p => {
        const h = hospitals.find(h => String(h.id) === String(p.hospitalId))
        return (p.projectName||'').toLowerCase().includes(q) || (h?.name||'').toLowerCase().includes(q)
      })
    }
    return plans
  }, [projectPlans, filterYear, filterSearch, hospitals, planSummaries])

  const addablePlans = useMemo(() =>
    projectPlans.filter(p => !planSummaries[String(p.id)]),
    [projectPlans, planSummaries])

  // ── Selected plan data ──────────────────────────────────────────────────────
  const selPlan     = useMemo(() => projectPlans.find(p => String(p.id) === String(selPlanId)), [projectPlans, selPlanId])
  const planStart   = selPlan ? toISO(selPlan.startDate || selPlan.onlineStart) : ''
  const planEnd     = selPlan ? toISO(selPlan.endDate   || selPlan.onlineEnd)   : ''
  const planMembers = useMemo(() => selPlan?.team ? sortMembers(selPlan.team, selPlan.teamLeader, selPlan.siteOwner) : [], [selPlan])

  // ── Load StandBy dates for selected plan ────────────────────────────────────
  useEffect(() => {
    if (!selPlanId) { setStandbyDates([]); return }
    let cancelled = false
    setStandbyLoading(true)
    fetch(`${API}/standby/dates?planId=${selPlanId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setStandbyDates(Array.isArray(d) ? d : []) })
      .catch(() => { if (!cancelled) setStandbyDates([]) })
      .finally(() => { if (!cancelled) setStandbyLoading(false) })
    return () => { cancelled = true }
  }, [selPlanId])

  // ── Load holidays ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!planStart || !planEnd) { setHolidays(new Set()); return }
    const y1 = parseInt(planStart.slice(0,4)), y2 = parseInt(planEnd.slice(0,4))
    const ce1 = y1>=2400?y1-543:y1, ce2 = y2>=2400?y2-543:y2
    Promise.all([...new Set([ce1,ce2])].map(yr =>
      fetch(`${API}/holidays?year=${yr}&isActive=Y`).then(r=>r.json()).catch(()=>[])
    )).then(res => setHolidays(new Set(res.flat().map(h => toISO(h.holiday_date)))))
  }, [planStart, planEnd])

  // ── Load tracking records ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selPlanId) { setRecords({}); return }
    let cancelled = false
    setLoading(true)
    fetch(`${API}/doc-tracking?planId=${selPlanId}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const map = {}
        data.forEach(row => { map[`${toISO(row.track_date)}_${row.member_name}`] = row.status })
        setRecords(map)
      })
      .catch(() => { if (!cancelled) setRecords({}) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selPlanId])

  // ── Date/member filters ─────────────────────────────────────────────────────
  const visibleDates = useMemo(() => {
    let dates = standbyDates
    if (filterDateStart) dates = dates.filter(d => d >= filterDateStart)
    if (filterDateEnd)   dates = dates.filter(d => d <= filterDateEnd)
    return dates
  }, [standbyDates, filterDateStart, filterDateEnd])

  const visibleMembers = useMemo(() => {
    if (!filterMember) return planMembers
    const q = filterMember.toLowerCase()
    return planMembers.filter(m => m.name.toLowerCase().includes(q))
  }, [planMembers, filterMember])

  const totalPages = Math.ceil(visibleDates.length / PAGE_SIZE)
  const pagedDates = visibleDates.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)

  // ── Status helpers ──────────────────────────────────────────────────────────
  const getStatus = (date, memberName) => {
    const st = records[`${date}_${memberName}`]
    if (holidays.has(date) && (!st || st === 'holiday' || st === 'not_sent')) return 'holiday'
    return st || 'not_sent'
  }

  const saveCell = async (date, member, status) => {
    if (holidays.has(date)) return
    const key = `${date}_${member.name}`, prev = records[key]
    setRecords(p => ({ ...p, [key]: status }))
    setSaving(true)
    try {
      await fetch(`${API}/doc-tracking`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: Number(selPlanId), memberId: member.memberId, memberName: member.name, trackDate: date, status }),
      })
      loadSummaries()
    } catch { setRecords(p => ({ ...p, [key]: prev })) }
    finally { setSaving(false) }
  }

  // ── Detail summary ──────────────────────────────────────────────────────────
  const detailSummary = useMemo(() => {
    if (!planMembers.length || !standbyDates.length) return null
    const nonHolidays = standbyDates.filter(d => !holidays.has(d))
    const sentCnt = planMembers.reduce((acc, m) => acc + nonHolidays.filter(d => records[`${d}_${m.name}`] === 'sent').length, 0)
    const memberPending = planMembers.map(m => ({
      name: m.name,
      pending: nonHolidays.filter(d => {
        const st = records[`${d}_${m.name}`]
        return !st || st === 'not_sent' || st === 'pending'
      }).length,
    })).filter(x => x.pending > 0).sort((a, b) => b.pending - a.pending)
    return { sentCnt, memberPending }
  }, [planMembers, standbyDates, records, holidays])

  // ── Delete plan tracking ────────────────────────────────────────────────────
  const deletePlanTracking = async (p) => {
    const h = hospitals.find(h => String(h.id) === String(p.hospitalId))
    if (!window.confirm(`ลบการติดตามเอกสารทั้งหมดของ\n"${h?.name ? `[${h.name}] ` : ''}${p.projectName}"\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return
    await fetch(`${API}/doc-tracking/plan/${p.id}`, { method: 'DELETE' })
    loadSummaries()
    if (String(selPlanId) === String(p.id)) { setView('list'); setSelPlanId('') }
  }

  const openDetail = (planId) => {
    setSelPlanId(String(planId)); setPage(1)
    setFilterMember(''); setFilterDateStart(''); setFilterDateEnd('')
    setView('detail'); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportToExcel = () => {
    if (!selPlan || !visibleMembers.length) return
    const hospName = hospitals.find(h => String(h.id) === String(selPlan.hospitalId))?.name || ''
    const wsData = [
      [`โรงพยาบาล: ${hospName}`, `โครงการ: ${selPlan.projectName}`, `Export: ${new Date().toLocaleDateString('th-TH')}`],
      [],
      ['วันที่', 'วัน', ...visibleMembers.map(m => m.name)],
    ]
    visibleDates.forEach(date => {
      wsData.push([fmtBE(date), THAI_DAYS[new Date(date).getDay()], ...visibleMembers.map(m => STATUS[getStatus(date, m.name)]?.label || '')])
    })
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'DocTracking')
    XLSX.writeFile(wb, `doc_tracking_${selPlan.projectName}_${Date.now()}.xlsx`)
  }

  // ── Pagination buttons ──────────────────────────────────────────────────────
  const paginationPages = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages = new Set([1, totalPages])
    for (let p = page - 2; p <= page + 2; p++) { if (p >= 1 && p <= totalPages) pages.add(p) }
    return [...pages].sort((a, b) => a - b).reduce((acc, pg, i, arr) => {
      if (i > 0 && pg - arr[i-1] > 1) acc.push('...')
      acc.push(pg); return acc
    }, [])
  }, [page, totalPages])

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ margin:0, color:'#1e3a5f', fontSize:22, fontWeight:700 }}>📋 ติดตามการส่งเอกสาร</h2>
        <p style={{ margin:'4px 0 0', color:'#64748b', fontSize:13 }}>ติดตามสถานะการส่งเอกสารของทีมงานตามโครงการ</p>
      </div>

      {showModal && <AddModal plans={addablePlans} hospitals={hospitals} onSave={id => { setShowModal(false); loadSummaries(); openDetail(id) }} onClose={() => setShowModal(false)} />}

      {/* ══ LIST VIEW ══════════════════════════════════════════════════════════ */}
      {view === 'list' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center', flexWrap:'wrap', background:'#fff', borderRadius:12, padding:'12px 16px', border:'1px solid #e2e8f0' }}>
            <button onClick={() => setShowModal(true)}
              style={{ padding:'9px 20px', background:'#16a34a', color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
              ➕ เพิ่ม
            </button>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:12, color:'#374151', fontWeight:600, whiteSpace:'nowrap' }}>ปี พ.ศ.</span>
              <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
                style={{ padding:'8px 10px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:13, background:'#fff', minWidth:100 }}>
                <option value="">ทุกปี</option>
                {availYears.map(y => <option key={y} value={y}>พ.ศ. {y}</option>)}
              </select>
            </div>
            <div style={{ flex:1, minWidth:200 }}>
              <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                placeholder="ค้นหาโครงการ / ชื่อโรงพยาบาล..."
                style={{ width:'100%', padding:'8px 12px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:13, boxSizing:'border-box' }} />
            </div>
            {filterSearch && <button onClick={() => setFilterSearch('')}
              style={{ padding:'8px 12px', background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, fontSize:12, cursor:'pointer', color:'#64748b' }}>✕</button>}
            <span style={{ fontSize:12, color:'#94a3b8', whiteSpace:'nowrap' }}>{overviewPlans.length} โครงการ</span>
          </div>

          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'#1e3a5f' }}>
                    <th style={{ padding:'11px 12px', color:'#94a3b8', fontSize:12, fontWeight:700, width:44 }}>#</th>
                    <th style={{ padding:'11px 12px', color:'#e2e8f0', fontSize:12, fontWeight:700, textAlign:'left' }}>โรงพยาบาล</th>
                    <th style={{ padding:'11px 12px', color:'#e2e8f0', fontSize:12, fontWeight:700, textAlign:'left' }}>โครงการ</th>
                    <th style={{ padding:'11px 12px', color:'#e2e8f0', fontSize:12, fontWeight:700, textAlign:'center', whiteSpace:'nowrap' }}>ช่วงเวลา</th>
                    <th style={{ padding:'11px 12px', color:'#e2e8f0', fontSize:12, fontWeight:700, textAlign:'center' }}>ทีม</th>
                    <th style={{ padding:'11px 10px', color:STATUS.sent.color, background:STATUS.sent.bg, fontSize:12, fontWeight:700, textAlign:'center', minWidth:70, whiteSpace:'nowrap' }}>ส่งแล้ว</th>
                    <th style={{ padding:'11px 10px', color:STATUS.not_sent.color, background:STATUS.not_sent.bg, fontSize:12, fontWeight:700, textAlign:'center', minWidth:70, whiteSpace:'nowrap' }}>ยังไม่ส่ง</th>
                    <th style={{ padding:'11px 10px', color:'#60a5fa', fontSize:12, fontWeight:700, textAlign:'center', minWidth:70 }}>คืบหน้า</th>
                    <th style={{ padding:'11px 14px', color:'#e2e8f0', fontSize:12, fontWeight:700, textAlign:'center', width:150 }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {overviewPlans.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding:'50px 20px', textAlign:'center', color:'#94a3b8' }}>
                      <div style={{ fontSize:36, marginBottom:10 }}>📋</div>
                      <div style={{ fontSize:15, fontWeight:600 }}>ยังไม่มีการติดตามเอกสาร</div>
                      <div style={{ fontSize:13, marginTop:4 }}>กด <strong>➕ เพิ่ม</strong> เพื่อเริ่มติดตาม</div>
                    </td></tr>
                  ) : overviewPlans.map((p, idx) => {
                    const sum = planSummaries[String(p.id)]
                    const hosp = hospitals.find(h => String(h.id) === String(p.hospitalId))
                    const s = toISO(p.startDate || p.onlineStart), e = toISO(p.endDate || p.onlineEnd)
                    const sentCnt = sum?.sent ?? 0
                    const pendCnt = sum?.pendingCount ?? 0
                    const holCnt  = sum?.holidayCount ?? 0
                    const total   = sum?.total ?? 0
                    const pct = total > 0 ? Math.round(((total - pendCnt) / total) * 100) : 0
                    return (
                      <tr key={p.id}
                        style={{ borderBottom:'1px solid #f1f5f9', background: idx%2===0?'#fff':'#fafafa', transition:'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                        onMouseLeave={e => e.currentTarget.style.background = idx%2===0?'#fff':'#fafafa'}>
                        <td style={{ padding:'11px 12px', color:'#94a3b8', fontSize:12 }}>{idx+1}</td>
                        <td style={{ padding:'11px 12px', fontWeight:600, color:'#1e293b', whiteSpace:'nowrap' }}>{hosp?.name || <span style={{ color:'#94a3b8' }}>—</span>}</td>
                        <td style={{ padding:'11px 12px', color:'#374151', maxWidth:240 }}>
                          <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.projectName}</div>
                        </td>
                        <td style={{ padding:'11px 12px', textAlign:'center', color:'#64748b', fontSize:12, whiteSpace:'nowrap' }}>
                          {s ? `${fmtShort(s)} – ${fmtShort(e)}` : <span style={{ color:'#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding:'11px 12px', textAlign:'center', color:'#374151', fontWeight:600 }}>{p.team?.length||0} คน</td>
                        <td style={{ padding:'11px 8px', textAlign:'center', fontWeight: sentCnt>0?700:400, color: sentCnt>0?STATUS.sent.color:'#d1d5db', background: sentCnt>0?STATUS.sent.bg:'transparent', borderLeft:'1px solid #f1f5f9' }}>
                          {sentCnt > 0 ? sentCnt : '—'}
                        </td>
                        <td style={{ padding:'11px 8px', textAlign:'center', fontWeight: pendCnt>0?700:400, color: pendCnt>0?STATUS.not_sent.color:'#d1d5db', background: pendCnt>0?STATUS.not_sent.bg:'transparent', borderLeft:'1px solid #f1f5f9' }}>
                          {pendCnt > 0 ? pendCnt : '—'}
                        </td>
                        <td style={{ padding:'11px 8px', textAlign:'center', borderLeft:'1px solid #f1f5f9' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
                            <div style={{ width:50, background:'#e2e8f0', borderRadius:4, height:6, overflow:'hidden' }}>
                              <div style={{ width:`${pct}%`, background: pct===100?'#16a34a':'#0891b2', height:'100%', borderRadius:4 }} />
                            </div>
                            <span style={{ fontSize:12, fontWeight:700, color: pct===100?'#16a34a':'#0891b2', minWidth:34 }}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding:'8px 10px', textAlign:'center' }}>
                          <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                            <button onClick={() => openDetail(p.id)}
                              style={{ padding:'6px 12px', border:'none', borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer', background:'#1e3a5f', color:'#fff', whiteSpace:'nowrap' }}>
                              📋 ดูรายละเอียด
                            </button>
                            <button onClick={() => deletePlanTracking(p)}
                              style={{ padding:'6px 10px', border:'1px solid #fecaca', borderRadius:7, fontSize:12, cursor:'pointer', background:'#fef2f2', color:'#dc2626' }}>
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding:'10px 20px', background:'#f8fafc', borderTop:'1px solid #f1f5f9', display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
              <span style={{ fontSize:12, color:'#64748b' }}>ติดตามแล้ว <strong style={{ color:'#16a34a' }}>{Object.keys(planSummaries).length}</strong> โครงการ</span>
              <div style={{ marginLeft:'auto', display:'flex', gap:10, flexWrap:'wrap' }}>
                {Object.entries(STATUS).filter(([k]) => SELECTABLE.includes(k)).map(([k, s]) => (
                  <span key={k} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11 }}>
                    <span style={{ width:14, height:14, background:s.bg, border:`1px solid ${s.border}`, borderRadius:3, display:'inline-block' }} />
                    <span style={{ color:'#374151' }}>{s.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ DETAIL VIEW ════════════════════════════════════════════════════════ */}
      {view === 'detail' && (() => {
        const selPlanHosp = selPlan ? hospitals.find(h => String(h.id) === String(selPlan.hospitalId)) : null
        const sum = planSummaries[String(selPlanId)]
        const sentCnt = sum?.sent ?? 0
        const pendCnt = sum?.pendingCount ?? 0
        const holCnt  = sum?.holidayCount ?? 0
        const total   = sum?.total ?? 0
        const pct = total > 0 ? Math.round(((total - pendCnt) / total) * 100) : 0

        return (
          <div>
            {/* Header bar */}
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', marginBottom:16, display:'flex', alignItems:'stretch', flexWrap:'wrap', overflow:'hidden' }}>
              <div style={{ padding:'14px 16px', borderRight:'1px solid #f1f5f9', display:'flex', alignItems:'center' }}>
                <button onClick={() => { setView('list'); loadSummaries() }}
                  style={{ padding:'7px 16px', background:'#f8fafc', color:'#374151', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  ← กลับ
                </button>
              </div>
              <div style={{ flex:2, padding:'0 16px', borderRight:'1px solid #f1f5f9', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                <div style={{ fontSize:11, color:'#94a3b8', marginBottom:2 }}>โรงพยาบาล / โครงการ</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#1e3a5f' }}>
                  {selPlanHosp?.name && <span style={{ color:'#64748b', marginRight:6 }}>[{selPlanHosp.name}]</span>}
                  {selPlan?.projectName}
                </div>
              </div>
              {[
                { label:'Stand By',  val: standbyLoading ? '⏳' : `${standbyDates.length} วัน`, color:'#0891b2' },
                { label:'ส่งแล้ว',  val: sentCnt, color: STATUS.sent.color },
                { label:'ยังไม่ส่ง', val: pendCnt, color: STATUS.not_sent.color },
                { label:'วันหยุด',  val: holCnt,  color: STATUS.holiday.color },
                { label:'คืบหน้า',  val: `${pct}%`, color: pct===100?'#16a34a':'#0891b2' },
              ].map(item => (
                <div key={item.label} style={{ flex:1, padding:'0 14px', borderRight:'1px solid #f1f5f9', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center' }}>
                  <div style={{ fontSize:11, color:item.color, marginBottom:2 }}>{item.label}</div>
                  <div style={{ fontSize:18, fontWeight:800, color:item.color }}>{item.val}</div>
                </div>
              ))}
              <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:8 }}>
                <button onClick={exportToExcel}
                  style={{ padding:'7px 14px', background:'#16a34a', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                  📤 Export
                </button>
                {saving && <span style={{ fontSize:11, color:'#94a3b8' }}>⏳</span>}
              </div>
            </div>

            {/* No StandBy warning */}
            {!standbyLoading && standbyDates.length === 0 && (
              <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:12, padding:'24px 20px', marginBottom:16, textAlign:'center', color:'#92400e' }}>
                <div style={{ fontSize:28, marginBottom:8 }}>⚠️</div>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>ยังไม่มีตาราง Stand By สำหรับโครงการนี้</div>
                <div style={{ fontSize:12 }}>กรุณาสร้างตาราง Stand By ก่อน เพื่อให้วันทำงานในการติดตามเอกสารตรงกัน</div>
              </div>
            )}

            {/* Pending members summary */}
            {detailSummary?.memberPending?.length > 0 && (
              <div style={{ background:'#fff', borderRadius:12, border:'1px solid #fed7aa', padding:'14px 20px', marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#ea580c', marginBottom:10 }}>
                  ⚠️ สมาชิกที่ค้างส่ง / ยังไม่ส่ง ({detailSummary.memberPending.length} คน)
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {detailSummary.memberPending.map(mp => (
                    <span key={mp.name} style={{ padding:'4px 12px', background:'#fff7ed', border:'1px solid #fdba74', borderRadius:20, fontSize:12, fontWeight:600, color:'#ea580c' }}>
                      {mp.name} — {mp.pending} วัน
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Filters */}
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'12px 16px', marginBottom:16, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <span style={{ fontSize:12, color:'#64748b', fontWeight:600 }}>ช่วงวันที่</span>
                <DateInput value={filterDateStart} onChange={v => { setFilterDateStart(v); setPage(1) }}
                  style={{ padding:'7px 10px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:12, width:130 }} />
                <span style={{ color:'#94a3b8' }}>—</span>
                <DateInput value={filterDateEnd} onChange={v => { setFilterDateEnd(v); setPage(1) }}
                  style={{ padding:'7px 10px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:12, width:130 }} />
                {(filterDateStart||filterDateEnd) && (
                  <button onClick={() => { setFilterDateStart(''); setFilterDateEnd(''); setPage(1) }}
                    style={{ padding:'7px 10px', background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, fontSize:12, cursor:'pointer', color:'#64748b' }}>✕</button>
                )}
              </div>
              <div style={{ flex:1, minWidth:180 }}>
                <input value={filterMember} onChange={e => setFilterMember(e.target.value)}
                  placeholder="🔍 ค้นหาชื่อพนักงาน..."
                  style={{ width:'100%', padding:'7px 12px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:13, boxSizing:'border-box' }} />
              </div>
              <span style={{ fontSize:12, color:'#94a3b8', whiteSpace:'nowrap' }}>
                {visibleDates.length} วัน (Stand By) / {visibleMembers.length} คน
              </span>
            </div>

            {/* Grid */}
            {loading || standbyLoading ? (
              <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', padding:'60px 20px', textAlign:'center', color:'#94a3b8' }}>⏳ กำลังโหลด...</div>
            ) : standbyDates.length === 0 ? null : (
              <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e2e8f0', overflow:'hidden' }}>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'#1e3a5f' }}>
                        <th style={{ padding:'11px 14px', color:'#94a3b8', fontSize:12, fontWeight:700, whiteSpace:'nowrap', minWidth:130, textAlign:'left' }}>วันที่</th>
                        <th style={{ padding:'11px 10px', color:'#94a3b8', fontSize:12, fontWeight:700, textAlign:'center', width:44 }}>วัน</th>
                        {visibleMembers.map(m => (
                          <th key={m.name} style={{ padding:'11px 10px', color:'#e2e8f0', fontSize:12, fontWeight:700, textAlign:'center', minWidth:130, whiteSpace:'nowrap' }}>
                            {m.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedDates.map((date, di) => {
                        const dow = new Date(date).getDay()
                        const isHoliday = holidays.has(date)
                        const isSun = dow === 0, isSat = dow === 6
                        return (
                          <tr key={date} style={{ background: isHoliday?'#fff1f2': di%2===0?'#fff':'#fafafa', borderBottom:'1px solid #f1f5f9' }}>
                            <td style={{ padding:'9px 14px', fontWeight:600, color: isHoliday?'#dc2626': isSun?'#dc2626': isSat?'#2563eb':'#1e293b', whiteSpace:'nowrap' }}>
                              {fmtBE(date)}
                            </td>
                            <td style={{ padding:'9px 10px', textAlign:'center', fontWeight:700, color: isHoliday?'#dc2626': isSun?'#dc2626': isSat?'#2563eb':'#64748b' }}>
                              {THAI_DAYS[dow]}
                            </td>
                            {visibleMembers.map(m => {
                              const st = getStatus(date, m.name)
                              const info = STATUS[st] || STATUS.not_sent
                              return (
                                <td key={m.name} style={{ padding:'6px 8px', textAlign:'center' }}>
                                  {isHoliday ? (
                                    <div style={{ padding:'5px 8px', borderRadius:6, fontSize:12, fontWeight:700, background:info.bg, color:info.color, border:`1px solid ${info.border}`, display:'inline-block', minWidth:80 }}>
                                      {info.label}
                                    </div>
                                  ) : (
                                    <select value={st} onChange={e => saveCell(date, m, e.target.value)}
                                      style={{ padding:'5px 8px', borderRadius:6, fontSize:12, fontWeight:600, border:`1px solid ${info.border}`, background:info.bg, color:info.color, cursor:'pointer', outline:'none', minWidth:100 }}>
                                      {SELECTABLE.map(k => <option key={k} value={k}>{STATUS[k].label}</option>)}
                                    </select>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                      {pagedDates.length === 0 && (
                        <tr><td colSpan={2 + visibleMembers.length} style={{ padding:'40px 20px', textAlign:'center', color:'#94a3b8' }}>ไม่มีข้อมูลในช่วงที่เลือก</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ padding:'12px 20px', borderTop:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:8, justifyContent:'space-between', background:'#f8fafc', flexWrap:'wrap' }}>
                    <span style={{ fontSize:12, color:'#64748b' }}>
                      แสดง 20 รายการ / หน้า
                    </span>
                    <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                      <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1}
                        style={{ padding:'6px 12px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, cursor:page===1?'default':'pointer', color:page===1?'#d1d5db':'#374151' }}>‹</button>
                      {paginationPages.map((pg, i) =>
                        pg === '...' ? (
                          <span key={`e${i}`} style={{ padding:'0 4px', color:'#94a3b8' }}>…</span>
                        ) : (
                          <button key={pg} onClick={() => setPage(pg)}
                            style={{ padding:'6px 10px', background:page===pg?'#16a34a':'#fff', border:`1px solid ${page===pg?'#16a34a':'#e2e8f0'}`, borderRadius:6, fontSize:13, cursor:'pointer', color:page===pg?'#fff':'#374151', minWidth:36 }}>
                            {pg}
                          </button>
                        )
                      )}
                      <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages}
                        style={{ padding:'6px 12px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, cursor:page===totalPages?'default':'pointer', color:page===totalPages?'#d1d5db':'#374151' }}>›</button>
                    </div>
                    <span style={{ fontSize:12, color:'#64748b' }}>หน้า {page}/{totalPages} (รวม {visibleDates.length} วัน)</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
