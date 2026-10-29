import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import SearchableSelect from '../components/SearchableSelect'
import DateInput from '../components/DateInput'
import * as XLSX from 'xlsx'

const API = import.meta.env.VITE_API_URL || ''

export const DEFAULT_ISSUE_TYPES = ['ข้อมูลพื้นฐาน', 'แบบฟอร์ม', 'รายงาน', 'กระบวนการ', 'โปรแกรม', 'Network', 'Hardware']
export const ISSUE_TYPES_KEY = 'sharedIssueTypes_v2'

export const loadIssueTypes = () => {
  try {
    const saved = localStorage.getItem(ISSUE_TYPES_KEY)
    return saved ? JSON.parse(saved) : DEFAULT_ISSUE_TYPES
  } catch { return DEFAULT_ISSUE_TYPES }
}
export const saveIssueTypes = (types) => localStorage.setItem(ISSUE_TYPES_KEY, JSON.stringify(types))

const SEVERITY = [
  { value: 'low', label: 'ต่ำ', color: '#16a34a', bg: '#f0fdf4' },
  { value: 'medium', label: 'ปานกลาง', color: '#d97706', bg: '#fffbeb' },
  { value: 'high', label: 'สูง', color: '#dc2626', bg: '#fef2f2' },
]
const STATUS_OPT = [
  { value: 'open', label: 'รอแก้ไข', color: '#d97706', bg: '#fffbeb' },
  { value: 'inprogress', label: 'กำลังแก้ไข', color: '#0891b2', bg: '#eff6ff' },
  { value: 'closed', label: 'แก้ไขแล้ว', color: '#16a34a', bg: '#f0fdf4' },
]

const EMPTY_FORM = { hospKey: '', hospitalId: '', date: '', resolvedDate: '', systemName: '', category: '', description: '', severity: 'medium', status: 'open', resolution: '', reportedBy: '', receivedBy: '', resolvedBy: '' }

const LAST_HOSP_KEY = 'lastTrainingIssueHosp'

const formatDate = (d) => {
  if (!d) return '-'
  const s = String(d).slice(0, 10)
  if (!s.includes('-')) return '-'
  const [y, m, day] = s.split('-')
  return `${day}/${m}/${y}`
}
const toDateStr = (d) => d ? String(d).slice(0, 10) : ''
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
const getCurrentUserName = () => {
  try {
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}')
    return u.name || u.username || ''
  } catch { return '' }
}

export default function TrainingSummary() {
  const { hospitals, teamMembers, projectPlans, trainingIssues, addTrainingIssue, updateTrainingIssue, deleteTrainingIssue } = useApp()
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [filterHosp, setFilterHosp] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState(todayStr())
  const [filterDateTo, setFilterDateTo] = useState(todayStr())
  const [limit, setLimit] = useState(30)

  // Build รพ./โครงการ options (UI only — value carries hospitalId)
  const hospOpts = (() => {
    const opts = []
    hospitals.forEach(h => {
      const plans = projectPlans.filter(p => String(p.hospitalId) === String(h.id))
      if (plans.length === 0) {
        opts.push({ value: `h:${h.id}`, label: h.name, hospitalId: String(h.id) })
      } else {
        plans.forEach(p => {
          const projName = p.projectName || ''
          opts.push({
            value: `p:${p.id}`,
            label: projName ? `${h.name} — ${projName}` : h.name,
            hospitalId: String(h.id),
          })
        })
      }
    })
    return opts
  })()
  const findOpt = (key) => hospOpts.find(o => o.value === key)
  const firstOptForHosp = (hospId) => hospOpts.find(o => o.hospitalId === String(hospId))

  const [systemNames, setSystemNames] = useState([])
  useEffect(() => {
    fetch(`${API}/api/system-names`).then(r => r.json()).then(setSystemNames).catch(() => {})
  }, [])

  // Issue type management
  const [issueTypes, setIssueTypes] = useState(loadIssueTypes)
  const [showTypeMgr, setShowTypeMgr] = useState(false)
  const [newType, setNewType] = useState('')
  const [editTypeIdx, setEditTypeIdx] = useState(null)
  const [editTypeVal, setEditTypeVal] = useState('')

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.hospitalId) return alert('กรุณาเลือกโรงพยาบาล / โครงการ')
    if (!form.date) return alert('กรุณากรอกวันที่พบปัญหา')
    if (!form.systemName) return alert('กรุณาเลือกระบบงาน')
    if (!form.category) return alert('กรุณาเลือกประเภทปัญหา')
    if (!form.description) return alert('กรุณากรอกรายละเอียดปัญหา')
    // จำค่า รพ./โครงการ ที่เลือกล่าสุด
    if (form.hospKey) localStorage.setItem(LAST_HOSP_KEY, form.hospKey)
    const { hospKey, ...payload } = form
    if (editId) {
      await updateTrainingIssue(editId, { ...payload, id: editId })
    } else {
      await addTrainingIssue(payload)
    }
    setForm(EMPTY_FORM)
    setShowForm(false)
    setEditId(null)
  }

  const handleEdit = (issue) => {
    const opt = firstOptForHosp(issue.hospitalId)
    setForm({
      ...issue,
      hospKey: opt?.value || '',
      date: toDateStr(issue.date),
      resolvedDate: toDateStr(issue.resolvedDate),
    })
    setEditId(issue.id)
    setShowForm(true)
  }

  const openAddForm = () => {
    setShowForm(true)
    setEditId(null)
    const lastKey = localStorage.getItem(LAST_HOSP_KEY) || ''
    const lastOpt = findOpt(lastKey)
    setForm({
      ...EMPTY_FORM,
      hospKey: lastOpt ? lastKey : '',
      hospitalId: lastOpt?.hospitalId || '',
      date: todayStr(),
      reportedBy: getCurrentUserName(),
      receivedBy: getCurrentUserName(),
    })
  }

  const handleDelete = async (id) => {
    if (window.confirm('ยืนยันการลบรายการนี้?'))
      await deleteTrainingIssue(id)
  }

  const filtered = trainingIssues.filter(i => {
    if (filterHosp && i.hospitalId !== filterHosp) return false
    if (filterStatus && i.status !== filterStatus) return false
    if (filterCategory && i.category !== filterCategory) return false
    const d = i.date ? String(i.date).slice(0, 10) : ''
    if (filterDateFrom && d && d < filterDateFrom) return false
    if (filterDateTo && d && d > filterDateTo) return false
    if ((filterDateFrom || filterDateTo) && !d) return false
    return true
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const displayed = filtered.slice(0, limit)

  const getHospName = (id) => hospitals.find(h => String(h.id) === String(id))?.name || id

  const isFiltered = !!(filterHosp || filterStatus || filterCategory || filterDateFrom || filterDateTo)

  const counts = {
    open: filtered.filter(i => i.status === 'open').length,
    inprogress: filtered.filter(i => i.status === 'inprogress').length,
    closed: filtered.filter(i => i.status === 'closed').length,
  }

  // Issue type CRUD
  const addType = () => {
    const trimmed = newType.trim()
    if (!trimmed) return
    if (issueTypes.includes(trimmed)) return alert('ประเภทปัญหานี้มีอยู่แล้ว')
    const updated = [...issueTypes, trimmed]
    setIssueTypes(updated)
    saveIssueTypes(updated)
    setNewType('')
  }

  const deleteType = (idx) => {
    if (!window.confirm(`ลบประเภทปัญหา "${issueTypes[idx]}" ?`)) return
    const updated = issueTypes.filter((_, i) => i !== idx)
    setIssueTypes(updated)
    saveIssueTypes(updated)
  }

  const startEditType = (idx) => {
    setEditTypeIdx(idx)
    setEditTypeVal(issueTypes[idx])
  }

  const saveEditType = () => {
    const trimmed = editTypeVal.trim()
    if (!trimmed) return
    if (issueTypes.includes(trimmed) && issueTypes[editTypeIdx] !== trimmed) return alert('ประเภทปัญหานี้มีอยู่แล้ว')
    const updated = issueTypes.map((t, i) => i === editTypeIdx ? trimmed : t)
    setIssueTypes(updated)
    saveIssueTypes(updated)
    setEditTypeIdx(null)
    setEditTypeVal('')
  }

  const exportToExcel = () => {
    const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
    const fmtBE = (d) => {
      if (!d) return ''
      const s = String(d).slice(0, 10)
      if (!s.includes('-')) return ''
      const [y, m, day] = s.split('-')
      return `${parseInt(day)} ${THAI_MONTHS[parseInt(m)-1]} ${parseInt(y)+543}`
    }
    const headers = ['ลำดับ','วันที่รับปัญหา','หน่วยงาน','ระบบงาน','ปัญหา','กลุ่มปัญหา','สถานะ','วิธีการแก้ไข','ผู้แจ้งปัญหา','ผู้รับปัญหา','ผู้แก้ไข','วันที่แก้ไขปัญหา']
    const rows = filtered.map((issue, idx) => [
      idx + 1,
      fmtBE(issue.date),
      getHospName(issue.hospitalId),
      issue.systemName || '',
      issue.description || '',
      issue.category || '',
      STATUS_OPT.find(s => s.value === issue.status)?.label || issue.status || '',
      issue.resolution || '',
      issue.reportedBy || '',
      issue.receivedBy || '',
      issue.resolvedBy || '',
      fmtBE(issue.resolvedDate),
    ])
    const wsData = [['ตารางสรุปปัญหาการอบรม AP/AR'], [], headers, ...rows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }]
    ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 40 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'สรุปปัญหาอบรม')
    XLSX.writeFile(wb, `training_issues_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#374151', background: '#f1f5f9', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }
  const tdStyle = { padding: '10px 14px', fontSize: 13, color: '#374151', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, color: '#1e3a5f', marginBottom: 4 }}>🎓 สรุปปัญหาการอบรม</h2>
        <p style={{ color: '#64748b', fontSize: 13 }}>บันทึกและติดตามปัญหาที่พบระหว่างการอบรมระบบ AP/AR</p>
      </div>

      {/* Summary */}
      <div style={{ marginBottom: 24 }}>
        {isFiltered && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#0891b2', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, padding: '3px 12px' }}>
              🔍 ผลการกรอง — แสดง {filtered.length} จาก {trainingIssues.length} รายการ
            </span>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          {[
            { label: isFiltered ? 'ผลที่กรอง' : 'ทั้งหมด', value: filtered.length, color: '#1e3a5f', bg: '#eff6ff' },
            { label: 'รอแก้ไข', value: counts.open, color: '#d97706', bg: '#fffbeb' },
            { label: 'กำลังแก้ไข', value: counts.inprogress, color: '#0891b2', bg: '#eff6ff' },
            { label: 'แก้ไขแล้ว', value: counts.closed, color: '#16a34a', bg: '#f0fdf4' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '16px 20px', border: `1px solid ${s.color}22` }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={openAddForm} style={{
          padding: '9px 20px', background: '#1e3a5f', color: '#fff', border: 'none',
          borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>+ เพิ่มปัญหา</button>
        <button onClick={() => { setShowTypeMgr(true); setEditTypeIdx(null) }} style={{
          padding: '9px 16px', background: '#f8fafc', color: '#374151', border: '1.5px solid #e2e8f0',
          borderRadius: 8, fontSize: 13, cursor: 'pointer',
        }}>⚙️ กำหนดประเภทปัญหา</button>
        <button onClick={exportToExcel} disabled={filtered.length === 0} style={{
          padding: '9px 18px', background: filtered.length === 0 ? '#e2e8f0' : '#16a34a', color: filtered.length === 0 ? '#94a3b8' : '#fff',
          border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: filtered.length === 0 ? 'default' : 'pointer', whiteSpace: 'nowrap',
        }}>📥 Export Excel</button>
        <SearchableSelect value={filterHosp} onChange={setFilterHosp}
          options={hospitals.map(h => ({ value: String(h.id), label: h.name }))}
          allLabel="ทุก รพ." style={{ minWidth: 200 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>พบปัญหา:</span>
          <DateInput value={filterDateFrom} onChange={v => setFilterDateFrom(v)}
            style={{ padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 130 }} />
          <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
          <DateInput value={filterDateTo} onChange={v => setFilterDateTo(v)}
            style={{ padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, width: 130 }} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
          <option value="">ทุกสถานะ</option>
          {STATUS_OPT.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
          <option value="">ทุกประเภทปัญหา</option>
          {issueTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(filterHosp || filterStatus || filterCategory || filterDateFrom || filterDateTo) && (
          <button onClick={() => { setFilterHosp(''); setFilterStatus(''); setFilterCategory(''); setFilterDateFrom(''); setFilterDateTo('') }} style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#64748b' }}>
            ✕ ล้างตัวกรอง
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>แสดง</span>
          <select value={limit} onChange={e => setLimit(Number(e.target.value))}
            style={{ padding: '6px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
            {[10, 20, 30, 50, 100, 999].map(n => <option key={n} value={n}>{n === 999 ? 'ทั้งหมด' : n}</option>)}
          </select>
          <span style={{ fontSize: 13, color: '#94a3b8', whiteSpace: 'nowrap' }}>จาก {filtered.length} รายการ</span>
        </div>
      </div>

      {/* Issues List */}
      {filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 60, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎓</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>ยังไม่มีปัญหาที่บันทึกไว้</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>คลิก "+ เพิ่มปัญหา" เพื่อบันทึกปัญหาการอบรม</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayed.map(issue => {
            const sev = SEVERITY.find(s => s.value === issue.severity) || SEVERITY[1]
            const sts = STATUS_OPT.find(s => s.value === issue.status) || STATUS_OPT[0]
            return (
              <div key={issue.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, background: sts.bg, color: sts.color, fontSize: 12, fontWeight: 600 }}>{sts.label}</span>
                      <span style={{ padding: '3px 10px', borderRadius: 20, background: sev.bg, color: sev.color, fontSize: 12, fontWeight: 600 }}>ความรุนแรง: {sev.label}</span>
                      {issue.category && <span style={{ padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#64748b', fontSize: 12 }}>{issue.category}</span>}
                      {issue.systemName && <span style={{ padding: '3px 10px', borderRadius: 20, background: '#eff6ff', color: '#1d4ed8', fontSize: 12 }}>⚙️ {issue.systemName}</span>}
                    </div>
                    <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: 14, marginBottom: 6 }}>🏥 {getHospName(issue.hospitalId)}</div>
                    <div style={{ fontSize: 14, color: '#374151', marginBottom: 6 }}>{issue.description}</div>
                    {(issue.reportedBy || issue.receivedBy || issue.resolvedBy) && (
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                        {issue.reportedBy && <span style={{ fontSize: 12, color: '#94a3b8' }}>👤 แจ้ง: {issue.reportedBy}</span>}
                        {issue.receivedBy && <span style={{ fontSize: 12, color: '#94a3b8' }}>📥 รับ: {issue.receivedBy}</span>}
                        {issue.resolvedBy && <span style={{ fontSize: 12, color: '#94a3b8' }}>🔧 แก้ไข: {issue.resolvedBy}</span>}
                      </div>
                    )}
                    {issue.resolution && (
                      <div style={{ fontSize: 13, color: '#16a34a', background: '#f0fdf4', padding: '8px 12px', borderRadius: 8, marginTop: 8 }}>
                        ✅ วิธีแก้ไข: {issue.resolution}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>📅 พบปัญหา: {formatDate(issue.date)}</div>
                    {issue.resolvedDate && <div style={{ fontSize: 12, color: '#16a34a', marginBottom: 8 }}>✅ แก้ไข: {formatDate(issue.resolvedDate)}</div>}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handleEdit(issue)} style={{ padding: '5px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#1d4ed8' }}>แก้ไข</button>
                      <button onClick={() => handleDelete(issue.id)} style={{ padding: '5px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#dc2626' }}>ลบ</button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Issue Type Manager Modal */}
      {showTypeMgr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ color: '#1e3a5f', fontSize: 18 }}>⚙️ กำหนดประเภทปัญหา</h3>
              <button onClick={() => { setShowTypeMgr(false); setEditTypeIdx(null) }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>ประเภทปัญหาที่กำหนดจะนำไปใช้เป็นตัวเลือกในทั้งหน้าสรุปปัญหาอบรมและสรุปปัญหาขึ้นระบบ</p>

            {/* Add new row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                value={newType}
                onChange={e => setNewType(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addType() } }}
                placeholder="ชื่อประเภทปัญหาใหม่..."
                style={{ flex: 1, padding: '9px 12px', border: '1.5px solid #3b82f6', borderRadius: 8, fontSize: 13 }}
              />
              <button onClick={addType} style={{ padding: '9px 20px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ เพิ่ม</button>
            </div>

            {/* Table */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 50, textAlign: 'center' }}>ลำดับ</th>
                    <th style={thStyle}>ชื่อประเภทปัญหา</th>
                    <th style={{ ...thStyle, width: 140, textAlign: 'center' }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {issueTypes.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 28 }}>ยังไม่มีประเภทปัญหา</td>
                    </tr>
                  ) : issueTypes.map((type, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                      <td style={tdStyle}>
                        {editTypeIdx === idx ? (
                          <input
                            value={editTypeVal}
                            onChange={e => setEditTypeVal(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEditType(); if (e.key === 'Escape') setEditTypeIdx(null) }}
                            autoFocus
                            style={{ width: '100%', padding: '5px 8px', border: '1.5px solid #3b82f6', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                          />
                        ) : (
                          <span>{type}</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {editTypeIdx === idx ? (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button onClick={saveEditType} style={{ padding: '4px 12px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>บันทึก</button>
                            <button onClick={() => setEditTypeIdx(null)} style={{ padding: '4px 12px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>ยกเลิก</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button onClick={() => startEditType(idx)} style={{ padding: '4px 12px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>แก้ไข</button>
                            <button onClick={() => deleteType(idx)} style={{ padding: '4px 12px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>ลบ</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowTypeMgr(false); setEditTypeIdx(null) }} style={{ padding: '9px 24px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 20, color: '#1e3a5f', fontSize: 18 }}>🎓 {editId ? 'แก้ไข' : 'เพิ่ม'}ปัญหาการอบรม</h3>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 }}>
                {[
                  { label: 'โรงพยาบาล / โครงการ *', type: 'hospSearch', key: 'hospKey', span2: true },
                  { label: 'วันที่พบปัญหา *', type: 'date', key: 'date' },
                  { label: 'วันที่แก้ไข', type: 'date', key: 'resolvedDate' },
                  { label: 'ผู้แจ้งปัญหา', type: 'select', key: 'reportedBy', options: (() => {
                    const opts = teamMembers.map(m => ({ value: m.name, label: m.name + (m.position ? ` (${m.position})` : '') }))
                    const me = getCurrentUserName()
                    if (me && !opts.some(o => o.value === me)) opts.unshift({ value: me, label: `${me} (ฉัน)` })
                    return opts
                  })(), nullable: true },
                  { label: 'ผู้รับปัญหา', type: 'select', key: 'receivedBy', options: (() => {
                    const opts = teamMembers.map(m => ({ value: m.name, label: m.name + (m.position ? ` (${m.position})` : '') }))
                    const me = getCurrentUserName()
                    if (me && !opts.some(o => o.value === me)) opts.unshift({ value: me, label: `${me} (ฉัน)` })
                    return opts
                  })(), nullable: true },
                  { label: 'ผู้แก้ไข', type: 'select', key: 'resolvedBy', options: teamMembers.map(m => ({ value: m.name, label: m.name + (m.position ? ` (${m.position})` : '') })), nullable: true },
                  { label: 'ระบบงาน *', type: 'select', key: 'systemName', options: systemNames.map(s => ({ value: s, label: s })), nullable: true },
                  { label: 'ประเภทปัญหา *', type: 'select', key: 'category', options: issueTypes.map(t => ({ value: t, label: t })), nullable: true },
                  { label: 'ความรุนแรง', type: 'select', key: 'severity', options: SEVERITY.map(s => ({ value: s.value, label: s.label })) },
                  { label: 'สถานะ', type: 'select', key: 'status', options: STATUS_OPT.map(s => ({ value: s.value, label: s.label })), span2: true },
                ].map(f => (
                  <div key={f.key} style={{ marginBottom: 14, gridColumn: f.span2 ? 'span 2' : 'span 1' }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}</label>
                    {f.type === 'hospSearch' ? (
                      <SearchableSelect value={String(form.hospKey || '')}
                        onChange={v => {
                          const opt = findOpt(v)
                          setForm(p => ({ ...p, hospKey: v, hospitalId: opt?.hospitalId || '' }))
                        }}
                        options={hospOpts}
                        placeholder="-- เลือก รพ. / โครงการ --"
                        inputStyle={{ border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
                        style={{ width: '100%' }} />
                    ) : f.type === 'select' ? (
                      <select value={form[f.key]} onChange={set(f.key)} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
                        {f.nullable && <option value="">-- เลือก --</option>}
                        {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : f.type === 'date' ? (
                      <DateInput value={form[f.key]} onChange={v => setForm(p => ({ ...p, [f.key]: v }))} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
                    ) : (
                      <input type={f.type} value={form[f.key]} onChange={set(f.key)} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
                    )}
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>รายละเอียดปัญหา *</label>
                <textarea value={form.description} onChange={set('description')} rows={3} placeholder="อธิบายปัญหาที่พบ..."
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }}>วิธีแก้ไข / ผลการดำเนินการ</label>
                <textarea value={form.resolution} onChange={set('resolution')} rows={2} placeholder="กรอกวิธีแก้ไขหรือผลการดำเนินการ..."
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" style={{ flex: 1, padding: '11px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  {editId ? 'บันทึกการแก้ไข' : 'เพิ่มปัญหา'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} style={{ flex: 1, padding: '11px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>ยกเลิก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
