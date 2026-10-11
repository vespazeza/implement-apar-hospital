import { useState, useRef, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import DateInput from '../components/DateInput'
import * as XLSX from 'xlsx'

const API = import.meta.env.VITE_API_URL || ''
const fmtDateShort = (d) => { if (!d) return '-'; const s = String(d).slice(0, 10); const [y, m, day] = s.split('-'); return `${day}/${m}/${Number(y) + 543}` }
const fmtDateTimeShort = (d) => { if (!d) return '-'; const s = String(d).replace('T', ' ').slice(0, 16); const [date, time] = s.split(' '); return `${fmtDateShort(date)} ${time || ''}` }

// ลำดับตรวจก่อนหลังสำคัญ — ของเฉพาะเจาะจงกว่าต้องมาก่อน (USER_ACTIVITY ก่อน USERS)
const REPORT_TYPES = [
  { code: 'info', label: 'INFO — ข้อมูล รพ./งวด (อ้างอิงเท่านั้น)', match: /INFO/i, infoOnly: true },
  // ไฟล์นี้ต่างจากไฟล์อื่น — มีหัวข้อแถวเดียว (ไม่มีแถว key ภาษาอังกฤษ) และมีคอลัมน์ "ลำดับ" นำหน้า
  { code: 'daily_activity', label: 'DAILY_ACTIVITY — กิจกรรมรายวัน', match: /DAILY/i, singleHeader: true, fields: ['_seq', 'activity_date', 'menu_group', 'action', 'outcome', 'n_actions', 'n_users'] },
  { code: 'user_activity', label: 'USER_ACTIVITY — สรุปรายผู้ใช้', match: /USER.?ACTIVITY/i },
  { code: 'menu_usage', label: 'MENU_USAGE — การใช้งานรายเมนู', match: /MENU.?USAGE/i },
  { code: 'hourly', label: 'HOURLY — ตามวัน/ชั่วโมง', match: /HOURLY/i },
  { code: 'failures', label: 'FAILURES — รายการล้มเหลว', match: /FAIL/i },
  { code: 'journal_monthly', label: 'JOURNAL_MONTHLY — รายการบัญชีรายเดือน', match: /JOURNAL/i },
  { code: 'data_footprint', label: 'DATA_FOOTPRINT — ขนาดข้อมูลสะสม', match: /FOOTPRINT/i },
  { code: 'users', label: 'USERS — บัญชีผู้ใช้ทั้งหมด', match: /USERS?(?!.*ACTIVITY)/i },
]

export default function UsageImport() {
  const { hospitals } = useApp()
  const today = new Date()
  const monthAgo = new Date(today); monthAgo.setMonth(monthAgo.getMonth() - 1)
  const toDateStr = (d) => d.toISOString().slice(0, 10)

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedHosp, setSelectedHosp] = useState(null)
  const [periodStart, setPeriodStart] = useState(toDateStr(monthAgo))
  const [periodEnd, setPeriodEnd] = useState(toDateStr(today))

  const [slots, setSlots] = useState({}) // code -> { fileName, sheetName, rowCount, rows, headerKeys }
  const [infoData, setInfoData] = useState(null) // { field: value, ... } จากไฟล์ INFO (ถ้ามี)
  const [unmatched, setUnmatched] = useState([])
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState(null)
  const fileInputRef = useRef()
  const searchTimer = useRef()

  const resolvedHospital = selectedHosp ? hospitals.find(h => String(h.code) === String(selectedHosp.hospcode)) : null

  // ── ประวัติการนำเข้าของ รพ. ที่เลือก ──────────────────────────────────────────────
  const [batches, setBatches] = useState([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const loadBatches = useCallback(() => {
    if (!resolvedHospital) { setBatches([]); return }
    setBatchesLoading(true)
    fetch(`${API}/api/usage/batches/${resolvedHospital.id}`).then(r => r.json())
      .then(d => { setBatches(Array.isArray(d) ? d : []); setBatchesLoading(false) })
      .catch(() => setBatchesLoading(false))
  }, [resolvedHospital])
  useEffect(() => { loadBatches() }, [loadBatches])

  const handleDeleteBatch = async (batch) => {
    const label = `${fmtDateShort(batch.period_start)} – ${fmtDateShort(batch.period_end)}`
    if (!window.confirm(`ยืนยันลบข้อมูลที่นำเข้าไว้ของรอบ ${label}?\nข้อมูลทุกรายงานในรอบนี้จะถูกลบทั้งหมด และกู้คืนไม่ได้`)) return
    setDeletingId(batch.id)
    try {
      await fetch(`${API}/api/usage/batch/${batch.id}`, { method: 'DELETE' })
      loadBatches()
    } finally {
      setDeletingId(null)
    }
  }

  const searchHospcode = (q) => {
    setQuery(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setSuggestions([]); setDropdownOpen(false); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/api/hospcode/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setSuggestions(Array.isArray(data) ? data : [])
        setDropdownOpen(true)
      } catch { setSuggestions([]) }
    }, 300)
  }

  const pickHospital = (h) => {
    setSelectedHosp(h); setQuery(''); setDropdownOpen(false)
    setSlots({}); setUnmatched([]); setResults(null); setInfoData(null)
  }

  // ไฟล์ Usage ส่วนใหญ่: แถว 1 = หัวข้อไทยสำหรับคนอ่าน, แถว 2 = key จริง (snake_case), แถว 3 เป็นต้นไป = ข้อมูล
  // ยกเว้นไฟล์ที่ระบุ singleHeader (เช่น DAILY_ACTIVITY) — มีแค่หัวข้อไทยแถวเดียว ข้อมูลเริ่มแถว 2 เลย
  // ต้องกำหนด fields (ชื่อ key ตามลำดับคอลัมน์) เองเพราะไม่มีแถว key ภาษาอังกฤษให้อ่าน
  const parseFile = (file, rt) => new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
        const headerKeys = rt?.singleHeader ? rt.fields : (raw[1] || []).map(k => String(k).trim())
        // เอ็นจิน report นี้เวลาไม่มีข้อมูลตามเงื่อนไข จะใส่แถว "ไม่พบข้อมูล" แทนการไม่มีแถวเลย ต้องกรองทิ้ง
        // ไม่งั้นจะถูกนำเข้าเป็นข้อมูลขยะ (เช่น username="ไม่พบข้อมูล") หรือ error ถ้าคอลัมน์นั้นเป็นตัวเลขที่ต้องมีค่า
        const dataRows = (rt?.singleHeader ? raw.slice(1) : raw.slice(2))
          .filter(r => r.some(c => c !== '') && String(r[0]).trim() !== 'ไม่พบข้อมูล')
        const rows = dataRows.map(r => {
          const obj = {}
          headerKeys.forEach((k, i) => { obj[k] = r[i] })
          return obj
        })
        resolve({ fileName: file.name, sheetName, rowCount: rows.length, headerKeys, rows })
      } catch {
        resolve({ fileName: file.name, sheetName: '-', rowCount: 0, headerKeys: [], rows: [], error: 'อ่านไฟล์ไม่สำเร็จ — ตรวจสอบว่าเป็นไฟล์ .xlsx ที่ถูกต้อง' })
      }
    }
    reader.readAsArrayBuffer(file)
  })

  const assignFile = async (file, rt) => {
    const info = await parseFile(file, rt)
    if (rt.code === 'info') {
      // INFO เป็นแบบ field/value — parse เป็น object ไว้โชว์ยืนยัน ไม่ส่งเข้า backend
      const obj = {}
      info.rows.forEach(r => { if (r.field) obj[r.field] = r.value })
      setInfoData(obj)
      setSlots(p => ({ ...p, info: { ...info, isInfo: true } }))
      return
    }
    setSlots(p => ({ ...p, [rt.code]: info }))
  }

  const handleFiles = (fileList) => {
    setResults(null)
    Array.from(fileList).forEach(file => {
      const rt = REPORT_TYPES.find(r => r.match.test(file.name))
      if (rt) assignFile(file, rt)
      else setUnmatched(p => [...p, { name: file.name, file }])
    })
  }

  const assignUnmatched = (idx, code) => {
    const item = unmatched[idx]
    const rt = REPORT_TYPES.find(r => r.code === code)
    if (!item || !rt) return
    assignFile(item.file, rt)
    setUnmatched(p => p.filter((_, i) => i !== idx))
  }

  const removeSlot = (code) => setSlots(p => { const n = { ...p }; delete n[code]; return n })

  const dataCodes = Object.keys(slots).filter(c => c !== 'info')
  const totalRows = dataCodes.reduce((s, c) => s + (slots[c].rowCount || 0), 0)
  const canImport = !!resolvedHospital && periodStart && periodEnd && dataCodes.length > 0 && !importing

  const handleImport = async () => {
    if (!canImport) return
    setImporting(true); setResults(null)
    try {
      const res = await fetch(`${API}/api/usage-import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospitalId: resolvedHospital.id, periodStart, periodEnd,
          reports: dataCodes.map(code => ({ code, sourceFile: slots[code].fileName, rows: slots[code].rows })),
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        let message = `เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ${res.status})`
        if (res.status === 413) message = 'ไฟล์/ข้อมูลที่นำเข้าใหญ่เกินกำหนด กรุณาแจ้งผู้ดูแลระบบ'
        else { try { message = JSON.parse(text).error || message } catch { /* not JSON */ } }
        setResults([{ code: '-', ok: false, message }])
        return
      }
      const data = await res.json()
      setResults(data.results || [{ code: '-', ok: false, message: data.error || 'นำเข้าไม่สำเร็จ' }])
      loadBatches()
    } catch {
      setResults([{ code: '-', ok: false, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ — ตรวจสอบว่า backend กำลังทำงานอยู่' }])
    } finally {
      setImporting(false)
    }
  }

  const card = { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }
  const h2 = { fontSize: 15, fontWeight: 700, color: '#1e3a5f', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }
  const hint = { fontSize: 12, color: '#94a3b8', margin: 0 }
  const label = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }
  const input = { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, boxSizing: 'border-box' }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, color: '#1e3a5f', marginBottom: 4 }}>📥 นำเข้าข้อมูล Usage (การใช้งานระบบ)</h2>
        <p style={{ color: '#64748b', fontSize: 13 }}>แนบไฟล์ USAGE จาก BMS-Accounting (DAILY_ACTIVITY, USER_ACTIVITY, MENU_USAGE, HOURLY, FAILURES, JOURNAL_MONTHLY, DATA_FOOTPRINT, USERS) เพื่อประมวลผลคะแนนการใช้งาน</p>
        <div style={{ marginTop: 8, fontSize: 11.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
          ⚠️ รูปแบบไฟล์ USERS ยังไม่เคยตรวจกับไฟล์ตัวอย่างจริง — อิงจาก spec + รูปแบบที่ยืนยันแล้วจากไฟล์อื่น หากพาร์สผิดพลาด แจ้งได้เลย
          <br />ไฟล์ USERS ควรมีคอลัมน์ <code>role</code> ระบุค่า <code>hospital_staff</code> หรือ <code>vendor_it</code> มาด้วย เพื่อใช้คำนวณ "สัดส่วนงานโดยเจ้าหน้าที่ รพ." โดยตรง
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <section style={card}>
          <h2 style={h2}><span>1️⃣</span> โรงพยาบาลและช่วงวันที่</h2>
          <p style={hint}>ค้นหาจากทะเบียน hospcode — เลือก 1 แห่งและช่วงวันที่ของข้อมูลชุดนี้</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 14 }}>
            <div style={{ position: 'relative' }}>
              <label style={label}>ค้นหาโรงพยาบาล (รหัส หรือ ชื่อ)</label>
              {!selectedHosp ? (
                <>
                  <input style={input} value={query} placeholder="พิมพ์รหัส 5 หลัก หรือชื่อโรงพยาบาล…"
                    onChange={e => searchHospcode(e.target.value)}
                    onFocus={() => query && setDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setDropdownOpen(false), 150)} />
                  {dropdownOpen && suggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #0891b2', borderRadius: 8, zIndex: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 240, overflowY: 'auto', marginTop: 2 }}>
                      {suggestions.map(s => (
                        <div key={s.hospcode} onMouseDown={() => pickHospital(s)}
                          style={{ padding: '9px 13px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10, alignItems: 'center' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}>
                          <span style={{ fontFamily: 'monospace', fontSize: 11.5, fontWeight: 700, color: '#0891b2', minWidth: 56 }}>{s.hospcode}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.province_name}{s.bed_count ? ` · ${s.bed_count} เตียง` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11.5, fontWeight: 700, color: '#0891b2' }}>{selectedHosp.hospcode}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{selectedHosp.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{selectedHosp.province_name}{selectedHosp.bed_count ? ` · ${selectedHosp.bed_count} เตียง` : ''}</div>
                  </div>
                  <button onClick={() => setSelectedHosp(null)} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>
              )}
              {selectedHosp && !resolvedHospital && (
                <div style={{ marginTop: 6, fontSize: 11.5, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '6px 10px' }}>
                  ⚠️ รพ. นี้ยังไม่ได้ลงทะเบียนในระบบ — กรุณาเพิ่มที่เมนู "โรงพยาบาล" ก่อนนำเข้าข้อมูล
                </div>
              )}
              {infoData && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 7, padding: '6px 10px' }}>
                  📎 ไฟล์ INFO ระบุ: {infoData.hospital_name || infoData.hcode || '-'} · {infoData.period_start || ''} – {infoData.period_end || ''}
                  {infoData.hcode && selectedHosp && String(infoData.hcode) !== String(selectedHosp.hospcode) && <span style={{ color: '#dc2626' }}> ⚠️ รหัสไม่ตรงกับที่เลือก!</span>}
                </div>
              )}
            </div>
            <div>
              <label style={label}>วันที่เริ่มต้น</label>
              <DateInput value={periodStart} onChange={setPeriodStart} style={input} />
            </div>
            <div>
              <label style={label}>วันที่สิ้นสุด</label>
              <DateInput value={periodEnd} onChange={setPeriodEnd} style={input} />
            </div>
          </div>
        </section>

        {resolvedHospital && (
          <section style={card}>
            <h2 style={h2}><span>🗂️</span> ประวัติการนำเข้าของ {resolvedHospital.name}</h2>
            {batchesLoading ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>กำลังโหลด...</div>
            ) : batches.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>ยังไม่เคยนำเข้าข้อมูลของโรงพยาบาลนี้</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {batches.map(b => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                        รอบ {fmtDateShort(b.period_start)} – {fmtDateShort(b.period_end)}
                        {b.usage_score != null && (
                          <span style={{ marginLeft: 8, padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#eff6ff', color: '#0891b2' }}>
                            คะแนน {Number(b.usage_score).toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>นำเข้าเมื่อ {fmtDateTimeShort(b.imported_at)}{b.imported_by ? ` โดย ${b.imported_by}` : ''}</div>
                    </div>
                    <button onClick={() => handleDeleteBatch(b)} disabled={deletingId === b.id} style={{
                      padding: '5px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6,
                      fontSize: 12, cursor: deletingId === b.id ? 'default' : 'pointer', color: '#dc2626', flexShrink: 0,
                    }}>{deletingId === b.id ? 'กำลังลบ...' : '🗑️ ลบ'}</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section style={card}>
          <h2 style={h2}><span>2️⃣</span> แนบไฟล์รายงาน (เลือกได้หลายไฟล์พร้อมกัน)</h2>
          <p style={hint}>ระบบจับคู่ไฟล์เข้ากับรายงานแต่ละประเภทจากชื่อไฟล์ให้อัตโนมัติ ไม่ต้องเรียงลำดับ — ไม่จำเป็นต้องมีครบทุกประเภท</p>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
            style={{
              border: `2px dashed ${dragging ? '#0891b2' : '#e2e8f0'}`, borderRadius: 10, padding: '24px 18px',
              textAlign: 'center', cursor: 'pointer', background: dragging ? '#eff6ff' : '#f8fafc',
            }}>
            <div style={{ fontSize: 26, marginBottom: 4 }}>📎</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1e293b' }}>ลากไฟล์ .xlsx มาวาง หรือคลิกเพื่อเลือก</div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>เลือกได้ทีเดียวหลายไฟล์</div>
            <input ref={fileInputRef} type="file" multiple accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {REPORT_TYPES.map(rt => {
              const s = slots[rt.code]
              if (!s) return (
                <div key={rt.code} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{rt.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 999, padding: '3px 10px' }}>
                    {rt.infoOnly ? 'ไม่บังคับ' : 'รอไฟล์'}
                  </div>
                </div>
              )
              const ok = !s.error && s.rowCount > 0
              return (
                <div key={rt.code} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', borderRadius: 9,
                  border: `1px solid ${ok ? '#86efac' : '#fde68a'}`, background: ok ? '#f0fdf4' : '#fffbeb',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{rt.label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.fileName} · {s.rowCount} แถว{s.headerKeys?.length ? ` · ${s.headerKeys.slice(0, 4).join(', ')}${s.headerKeys.length > 4 ? '…' : ''}` : ''}
                    </div>
                    {s.error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>⚠️ {s.error}</div>}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ok ? '#16a34a' : '#d97706', background: '#fff', border: `1px solid ${ok ? '#86efac' : '#fde68a'}`, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}>
                    {rt.infoOnly ? 'อ้างอิงแล้ว' : ok ? '✓ พร้อมนำเข้า' : '⚠ ตรวจสอบ'}
                  </div>
                  <button onClick={() => { removeSlot(rt.code); if (rt.code === 'info') setInfoData(null) }} style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>✕</button>
                </div>
              )
            })}
          </div>

          {unmatched.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {unmatched.map((u, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12.5 }}>
                  <span>❓</span>
                  <span style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 11.5, color: '#dc2626', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</span>
                  <select defaultValue="" onChange={e => assignUnmatched(i, e.target.value)} style={{ fontSize: 12, borderRadius: 7, border: '1px solid #fecaca', padding: '4px 6px' }}>
                    <option value="">ระบุชนิดรายงาน…</option>
                    {REPORT_TYPES.map(rt => <option key={rt.code} value={rt.code}>{rt.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={card}>
          <h2 style={h2}><span>3️⃣</span> ตรวจสอบและนำเข้า</h2>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '14px 16px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div><div style={{ fontSize: 19, fontWeight: 800, color: '#1e3a5f' }}>{dataCodes.length} / {REPORT_TYPES.filter(r => !r.infoOnly).length}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>ไฟล์พร้อมนำเข้า</div></div>
            <div><div style={{ fontSize: 19, fontWeight: 800, color: '#1e3a5f' }}>{totalRows.toLocaleString('th-TH')}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>แถวข้อมูลรวม</div></div>
          </div>

          <button onClick={handleImport} disabled={!canImport} style={{
            padding: '13px 18px', borderRadius: 10, border: 'none', fontSize: 14.5, fontWeight: 700,
            cursor: canImport ? 'pointer' : 'not-allowed',
            background: canImport ? '#0891b2' : '#e2e8f0', color: canImport ? '#fff' : '#94a3b8',
          }}>
            {importing ? 'กำลังนำเข้า…' : 'นำเข้าข้อมูลและคำนวณคะแนน'}
          </button>

          {results && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {results.map((r, i) => {
                const rt = REPORT_TYPES.find(x => x.code === r.code)
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, padding: '9px 12px', borderRadius: 9,
                    background: r.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${r.ok ? '#86efac' : '#fecaca'}`,
                  }}>
                    <span>{r.ok ? '✅' : '❌'}</span>
                    <span>{rt?.label || r.code}</span>
                    {r.ok ? (
                      <>
                        <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>→ {r.table}</span>
                        <span style={{ marginLeft: 'auto', color: '#64748b' }}>{r.rowCount} แถว</span>
                      </>
                    ) : <span style={{ marginLeft: 'auto', color: '#dc2626' }}>{r.message}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
