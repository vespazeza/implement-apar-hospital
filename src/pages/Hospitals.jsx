import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import * as XLSX from 'xlsx'

const API = import.meta.env.VITE_API_URL || ''

const HOSPITAL_TYPES = [
  { value: 'A', label: 'A – โรงพยาบาลศูนย์', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  { value: 'S', label: 'S – โรงพยาบาลทั่วไป', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'F', label: 'F – โรงพยาบาลชุมชน', color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  { value: 'P', label: 'P – รพ.สต. / PCU', color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
  { value: 'OTHER', label: 'อื่นๆ', color: '#374151', bg: '#f8fafc', border: '#e2e8f0' },
]

const REGIONS = ['ภาคเหนือ', 'ภาคกลาง', 'ภาคตะวันออกเฉียงเหนือ', 'ภาคตะวันออก', 'ภาคตะวันตก', 'ภาคใต้']

const EMPTY_FORM = {
  name: '', code: '', province: '', region: '', type: 'S',
  affiliation: '', address: '',
  coordinator: '', coordinatorPhone: '', coordinatorEmail: '',
  itContact: '', itPhone: '',
  bedCount: '', userCount: '', userCountAr: '', note: '',
}

const L = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 }
const I = { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', outline: 'none', background: '#fff' }

function TypeBadge({ value }) {
  const t = HOSPITAL_TYPES.find(x => x.value === value) || HOSPITAL_TYPES[4]
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, background: t.bg, color: t.color, border: `1px solid ${t.border}`, fontSize: 12, fontWeight: 700 }}>
      {t.value}
    </span>
  )
}

// ── Hospcode search input component ─────────────────────────────────────────
function HospcodeSearch({ value, onChange, onSelect }) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounce = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleChange = (e) => {
    const v = e.target.value
    onChange(v)
    clearTimeout(debounce.current)
    if (!v.trim()) { setSuggestions([]); setOpen(false); return }
    debounce.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API}/api/hospcode/search?q=${encodeURIComponent(v)}`)
        const data = await res.json()
        setSuggestions(Array.isArray(data) ? data : [])
        setOpen(true)
      } catch { setSuggestions([]) }
      finally { setLoading(false) }
    }, 300)
  }

  const handleSelect = (item) => {
    onSelect(item)
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={handleChange}
        onFocus={() => value && suggestions.length && setOpen(true)}
        placeholder="พิมพ์รหัส หรือ ชื่อสถานพยาบาล..."
        style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', outline: 'none', background: '#fff' }}
      />
      {loading && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8' }}>⏳</span>}
      {open && suggestions.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #0891b2', borderRadius: 8, zIndex: 999, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 260, overflowY: 'auto', marginTop: 2 }}>
          {suggestions.map(s => (
            <div key={s.hospcode} onMouseDown={() => handleSelect(s)}
              style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10, alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
              onMouseLeave={e => e.currentTarget.style.background = ''}>
              <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#0891b2', minWidth: 60 }}>{s.hospcode}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.province_name}{s.bed_count ? ` · ${s.bed_count} เตียง` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Hospitals() {
  const { hospitals, addHospital, updateHospital, deleteHospital } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [viewHosp, setViewHosp] = useState(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterRegion, setFilterRegion] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const openAdd = () => { setForm(EMPTY_FORM); setEditId(null); setShowForm(true) }
  const openEdit = (h) => { setForm({ ...EMPTY_FORM, ...h }); setEditId(h.id); setShowForm(true) }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.name.trim()) return alert('กรุณากรอกชื่อโรงพยาบาล')
    if (editId) {
      await updateHospital(editId, { ...form, id: editId })
    } else {
      await addHospital(form)
    }
    setShowForm(false)
  }

  const handleDelete = async id => {
    await deleteHospital(id)
    setConfirmDelete(null)
    if (viewHosp?.id === id) setViewHosp(null)
  }

  const filtered = hospitals.filter(h => {
    if (filterType && h.type !== filterType) return false
    if (filterRegion && h.region !== filterRegion) return false
    if (search) {
      const q = search.toLowerCase()
      return h.name?.toLowerCase().includes(q) || h.province?.toLowerCase().includes(q) ||
        h.code?.toLowerCase().includes(q) || h.coordinator?.toLowerCase().includes(q)
    }
    return true
  })

  const typeCounts = HOSPITAL_TYPES.reduce((acc, t) => ({ ...acc, [t.value]: hospitals.filter(h => h.type === t.value).length }), {})

  const exportToExcel = () => {
    const headers = ['ลำดับ','รหัส','ชื่อโรงพยาบาล','สังกัด','จังหวัด','ภาค','ประเภท','จำนวนเตียง','จำนวน user เจ้าหนี้','จำนวน user ลูกหนี้/รายได้','ผู้ประสานงาน','เบอร์โทรผู้ประสานงาน','อีเมลผู้ประสานงาน','เจ้าหน้าที่ IT','เบอร์โทร IT','ที่อยู่','หมายเหตุ']
    const rows = filtered.map((h, idx) => [
      idx + 1,
      h.code || '',
      h.name || '',
      h.affiliation || '',
      h.province || '',
      h.region || '',
      HOSPITAL_TYPES.find(t => t.value === h.type)?.label || h.type || '',
      h.bedCount || 0,
      h.userCount || 0,
      h.userCountAr || 0,
      h.coordinator || '',
      h.coordinatorPhone || '',
      h.coordinatorEmail || '',
      h.itContact || '',
      h.itPhone || '',
      h.address || '',
      h.note || '',
    ])
    const wsData = [['ทะเบียนข้อมูลโรงพยาบาล AP/AR'], [], headers, ...rows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }]
    ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 30 }, { wch: 26 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 20 }, { wch: 16 }, { wch: 36 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ข้อมูลโรงพยาบาล')
    XLSX.writeFile(wb, `hospitals_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, color: '#1e3a5f', marginBottom: 4 }}>🏥 จัดการข้อมูลโรงพยาบาล</h2>
        <p style={{ color: '#64748b', fontSize: 13 }}>เพิ่ม แก้ไข และจัดการข้อมูลโรงพยาบาลที่เข้าร่วมโครงการ AP/AR</p>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ background: '#eff6ff', borderRadius: 10, padding: '12px 20px', border: '1px solid #bfdbfe', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 28 }}>🏥</span>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1e3a5f' }}>{hospitals.length}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>โรงพยาบาลทั้งหมด</div>
          </div>
        </div>
        {HOSPITAL_TYPES.filter(t => typeCounts[t.value] > 0 || t.value !== 'OTHER').slice(0, 4).map(t => (
          <div key={t.value} style={{ background: t.bg, borderRadius: 10, padding: '12px 20px', border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: t.color }}>{typeCounts[t.value] || 0}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{t.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={openAdd} style={{
          padding: '9px 20px', background: 'linear-gradient(135deg,#1e3a5f,#0891b2)',
          color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}>+ เพิ่มโรงพยาบาล</button>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ / จังหวัด / รหัส / ผู้ประสานงาน..."
          style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, minWidth: 240 }} />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
          <option value="">ทุกประเภท</option>
          {HOSPITAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={{ padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
          <option value="">ทุกภาค</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {(search || filterType || filterRegion) && (
          <button onClick={() => { setSearch(''); setFilterType(''); setFilterRegion('') }} style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#64748b' }}>✕ ล้าง</button>
        )}
        <button onClick={exportToExcel} disabled={filtered.length === 0} style={{
          padding: '9px 18px', background: filtered.length === 0 ? '#e2e8f0' : '#16a34a', color: filtered.length === 0 ? '#94a3b8' : '#fff',
          border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: filtered.length === 0 ? 'default' : 'pointer', whiteSpace: 'nowrap',
        }}>📥 Export Excel</button>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#94a3b8' }}>แสดง {filtered.length} แห่ง</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 60, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏥</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>ไม่พบข้อมูลโรงพยาบาล</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>คลิก "+ เพิ่มโรงพยาบาล" เพื่อเพิ่มข้อมูล</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#1e3a5f' }}>
                  {['#', 'รหัส', 'ชื่อโรงพยาบาล', 'จังหวัด / ภาค', 'ประเภท', 'User เจ้าหนี้', 'User ลูกหนี้/รายได้', 'ผู้ประสานงาน', 'เบอร์โทร', 'อีเมล', 'จัดการ'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', borderRight: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((hosp, idx) => (
                  <tr key={hosp.id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ padding: '13px 14px', color: '#94a3b8', fontSize: 13 }}>{idx + 1}</td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{hosp.code || '-'}</td>
                    <td style={{ padding: '13px 14px', minWidth: 200 }} onClick={() => setViewHosp(hosp)}>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 14 }}>{hosp.name}</div>
                      {hosp.affiliation && <div style={{ fontSize: 11, color: '#94a3b8' }}>{hosp.affiliation}</div>}
                    </td>
                    <td style={{ padding: '13px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{hosp.province || '-'}</div>
                      {hosp.region && <div style={{ fontSize: 11, color: '#94a3b8' }}>{hosp.region}</div>}
                    </td>
                    <td style={{ padding: '13px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <TypeBadge value={hosp.type} />
                        {hosp.bedCount && (
                          <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                            {Number(hosp.bedCount).toLocaleString()} เตียง
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: '#374151', textAlign: 'center' }}>{hosp.userCount ? Number(hosp.userCount).toLocaleString() : '-'}</td>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: '#374151', textAlign: 'center' }}>{hosp.userCountAr ? Number(hosp.userCountAr).toLocaleString() : '-'}</td>
                    <td style={{ padding: '13px 14px', fontSize: 13, color: '#374151' }}>{hosp.coordinator || '-'}</td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>{hosp.coordinatorPhone || '-'}</td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#0891b2' }}>{hosp.coordinatorEmail || '-'}</td>
                    <td style={{ padding: '13px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => setViewHosp(hosp)} style={btnStyle('#f8fafc', '#e2e8f0', '#374151')}>ดูข้อมูล</button>
                        <button onClick={() => openEdit(hosp)} style={btnStyle('#eff6ff', '#bfdbfe', '#1d4ed8')}>แก้ไข</button>
                        <button onClick={() => setConfirmDelete(hosp)} style={btnStyle('#fef2f2', '#fecaca', '#dc2626')}>ลบ</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ADD/EDIT MODAL ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, padding: '24px 16px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 720, boxShadow: '0 24px 80px rgba(0,0,0,0.3)', marginBottom: 24 }}>

            {/* Modal header */}
            <div style={{ background: 'linear-gradient(135deg,#1a2d4a,#1e3a5f)', padding: '20px 28px', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>🏥 {editId ? 'แก้ไขข้อมูลโรงพยาบาล' : 'เพิ่มโรงพยาบาลใหม่'}</div>
                <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>กรอกข้อมูลโรงพยาบาลให้ครบถ้วน</div>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 22 }}>

                {/* Section 1: ข้อมูลทั่วไป */}
                <Section num={1} title="ข้อมูลทั่วไป">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={L}>ชื่อโรงพยาบาล *</label>
                      <input value={form.name} onChange={set('name')} placeholder="เช่น รพ.มหาราชนครเชียงใหม่" style={I} required />
                    </div>
                    <div>
                      <label style={L}>รหัสโรงพยาบาล</label>
                      <HospcodeSearch
                        value={form.code}
                        onChange={v => setForm(p => ({ ...p, code: v }))}
                        onSelect={item => setForm(p => ({
                          ...p,
                          code: item.hospcode,
                          name: item.name || p.name,
                          province: item.province_name ? item.province_name.replace(/^จ\./, '') : p.province,
                          address: item.addrpart || p.address,
                          bedCount: item.bed_count != null ? String(item.bed_count) : p.bedCount,
                        }))}
                      />
                      {form.code && <div style={{ fontSize: 11, color: '#0891b2', marginTop: 3 }}>💡 พิมพ์รหัสหรือชื่อเพื่อค้นหาจาก hospcode</div>}
                    </div>
                    <div>
                      <label style={L}>ประเภทโรงพยาบาล</label>
                      <select value={form.type} onChange={set('type')} style={I}>
                        {HOSPITAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={L}>จังหวัด</label>
                      <input value={form.province} onChange={set('province')} placeholder="เช่น เชียงใหม่" style={I} />
                    </div>
                    <div>
                      <label style={L}>ภาค</label>
                      <select value={form.region} onChange={set('region')} style={I}>
                        <option value="">-- เลือกภาค --</option>
                        {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={L}>สังกัด / หน่วยงานต้นสังกัด</label>
                      <input value={form.affiliation} onChange={set('affiliation')} placeholder="เช่น สำนักงานสาธารณสุขจังหวัดเชียงใหม่" style={I} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={L}>ที่อยู่</label>
                      <textarea value={form.address} onChange={set('address')} rows={2} placeholder="ที่อยู่โรงพยาบาล"
                        style={{ ...I, resize: 'vertical' }} />
                    </div>
                    <div>
                      <label style={L}>จำนวนเตียง</label>
                      <input type="number" value={form.bedCount} onChange={set('bedCount')} placeholder="0" min={0} style={I} />
                    </div>
                    <div>
                      <label style={L}>จำนวน user เจ้าหนี้</label>
                      <input type="number" value={form.userCount} onChange={set('userCount')} placeholder="0" min={0} style={I} />
                    </div>
                    <div>
                      <label style={L}>จำนวน user ลูกหนี้/รายได้</label>
                      <input type="number" value={form.userCountAr} onChange={set('userCountAr')} placeholder="0" min={0} style={I} />
                    </div>
                  </div>
                </Section>

                {/* Section 2: ผู้ประสานงานหลัก */}
                <Section num={2} title="ผู้ประสานงานหลัก (Site Owner)">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={L}>ชื่อ-นามสกุล ผู้ประสานงาน</label>
                      <input value={form.coordinator} onChange={set('coordinator')} placeholder="เช่น นายสมชาย ใจดี" style={I} />
                    </div>
                    <div>
                      <label style={L}>เบอร์โทรศัพท์</label>
                      <input value={form.coordinatorPhone} onChange={set('coordinatorPhone')} placeholder="เช่น 053-123456" style={I} />
                    </div>
                    <div>
                      <label style={L}>อีเมล</label>
                      <input type="email" value={form.coordinatorEmail} onChange={set('coordinatorEmail')} placeholder="example@hospital.go.th" style={I} />
                    </div>
                  </div>
                </Section>

                {/* Section 3: ผู้รับผิดชอบด้าน IT */}
                <Section num={3} title="ผู้รับผิดชอบด้าน IT">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={L}>ชื่อ-นามสกุล เจ้าหน้าที่ IT</label>
                      <input value={form.itContact} onChange={set('itContact')} placeholder="เช่น นายวิทย์ คอมพิวเตอร์" style={I} />
                    </div>
                    <div>
                      <label style={L}>เบอร์โทร IT</label>
                      <input value={form.itPhone} onChange={set('itPhone')} placeholder="เช่น 081-234-5678" style={I} />
                    </div>
                  </div>
                </Section>

                {/* Section 4: หมายเหตุ */}
                <Section num={4} title="หมายเหตุ / ข้อมูลเพิ่มเติม">
                  <textarea value={form.note} onChange={set('note')} rows={3} placeholder="หมายเหตุหรือข้อมูลเพิ่มเติมเกี่ยวกับโรงพยาบาล..."
                    style={{ ...I, resize: 'vertical' }} />
                </Section>

              </div>

              {/* Footer */}
              <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10 }}>
                <button type="submit" style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg,#1e3a5f,#0891b2)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                  {editId ? '💾 บันทึกการแก้ไข' : '✅ เพิ่มโรงพยาบาล'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} style={{ padding: '12px 24px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 10, fontSize: 15, cursor: 'pointer' }}>ยกเลิก</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DETAIL VIEW MODAL ── */}
      {viewHosp && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 24px 80px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ background: 'linear-gradient(135deg,#1a2d4a,#1e3a5f)', padding: '20px 28px', borderRadius: '16px 16px 0 0', display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 48, height: 48, background: 'rgba(255,255,255,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🏥</div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{viewHosp.name}</div>
                  {viewHosp.code && <div style={{ color: '#94a3b8', fontSize: 12 }}>รหัส: {viewHosp.code}</div>}
                </div>
              </div>
              <button onClick={() => setViewHosp(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '24px 28px' }}>
              <div style={{ marginBottom: 16 }}><TypeBadge value={viewHosp.type} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'จังหวัด', value: viewHosp.province || '-' },
                  { label: 'ภาค', value: viewHosp.region || '-' },
                  { label: 'สังกัด', value: viewHosp.affiliation || '-', col: 2 },
                  { label: 'จำนวนเตียง', value: viewHosp.bedCount ? viewHosp.bedCount + ' เตียง' : '-' },
                  { label: 'จำนวน user เจ้าหนี้', value: viewHosp.userCount ? Number(viewHosp.userCount).toLocaleString() + ' คน' : '-' },
                  { label: 'จำนวน user ลูกหนี้/รายได้', value: viewHosp.userCountAr ? Number(viewHosp.userCountAr).toLocaleString() + ' คน' : '-' },
                ].map(f => (
                  <div key={f.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', gridColumn: f.col ? `span ${f.col}` : 'span 1' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{f.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{f.value}</div>
                  </div>
                ))}
              </div>
              {viewHosp.address && (
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>ที่อยู่</div>
                  <div style={{ fontSize: 13, color: '#374151' }}>{viewHosp.address}</div>
                </div>
              )}

              {/* Contacts */}
              {(viewHosp.coordinator || viewHosp.itContact) && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: 13, marginBottom: 10 }}>👥 ผู้ติดต่อ</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {viewHosp.coordinator && (
                      <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 14px', border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700, marginBottom: 4 }}>ผู้ประสานงาน (Site Owner)</div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{viewHosp.coordinator}</div>
                        <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                          {viewHosp.coordinatorPhone && <span style={{ fontSize: 12, color: '#374151' }}>📞 {viewHosp.coordinatorPhone}</span>}
                          {viewHosp.coordinatorEmail && <span style={{ fontSize: 12, color: '#0891b2' }}>✉️ {viewHosp.coordinatorEmail}</span>}
                        </div>
                      </div>
                    )}
                    {viewHosp.itContact && (
                      <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', border: '1px solid #bbf7d0' }}>
                        <div style={{ fontSize: 11, color: '#15803d', fontWeight: 700, marginBottom: 4 }}>เจ้าหน้าที่ IT</div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{viewHosp.itContact}</div>
                        {viewHosp.itPhone && <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>📞 {viewHosp.itPhone}</div>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {viewHosp.note && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#92400e', marginBottom: 2 }}>หมายเหตุ</div>
                  <div style={{ fontSize: 13, color: '#374151' }}>{viewHosp.note}</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setViewHosp(null); openEdit(viewHosp) }} style={{ flex: 1, padding: '10px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>✏️ แก้ไข</button>
                <button onClick={() => { setViewHosp(null); setConfirmDelete(viewHosp) }} style={{ padding: '10px 18px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>🗑️ ลบ</button>
                <button onClick={() => setViewHosp(null)} style={{ padding: '10px 18px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>ปิด</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DELETE ── */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ color: '#1e3a5f', fontSize: 18, marginBottom: 8 }}>ยืนยันการลบ</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 4 }}>คุณต้องการลบโรงพยาบาล</p>
            <p style={{ color: '#dc2626', fontWeight: 700, fontSize: 15, marginBottom: 20 }}>"{confirmDelete.name}"</p>
            <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 24 }}>ข้อมูล Checklist และแผนงานที่เกี่ยวข้องจะยังคงอยู่</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => handleDelete(confirmDelete.id)} style={{ flex: 1, padding: '11px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>ลบ</button>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '11px', background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ num, title, children }) {
  return (
    <div>
      <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: 14, marginBottom: 14, paddingBottom: 8, borderBottom: '2px solid #eff6ff', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ background: '#1e3a5f', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>{num}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

const btnStyle = (bg, border, color) => ({
  padding: '5px 10px', background: bg, border: `1px solid ${border}`,
  borderRadius: 6, fontSize: 11, cursor: 'pointer', color, whiteSpace: 'nowrap',
})
