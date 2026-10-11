import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'

const API = import.meta.env.VITE_API_URL || ''

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const ymLabel = (ym) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(4, 6)); return `${THAI_MONTHS[m - 1]} ${y + 543}` }
const fmtDate = (d) => { if (!d) return ''; const s = String(d).slice(0, 10); const [y, m, day] = s.split('-'); return `${day}/${m}/${Number(y) + 543}` }

const levelColor = (score) => {
  if (score >= 80) return { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' }
  if (score >= 50) return { color: '#0891b2', bg: '#eff6ff', border: '#bfdbfe' }
  if (score >= 20) return { color: '#d97706', bg: '#fffbeb', border: '#fde68a' }
  return { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' }
}

function Sparkline({ data }) {
  if (!data || data.length < 2) return <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>
  const w = 72, h = 24, max = 100, min = 0
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((d.score - min) / (max - min)) * h
    return `${x},${y}`
  }).join(' ')
  const last = data[data.length - 1]
  const lc = levelColor(last.score)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={lc.color} strokeWidth="1.8" />
      <circle cx={w} cy={h - (last.score / 100) * h} r="2.2" fill={lc.color} />
    </svg>
  )
}

function SystemDots({ n }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i < n ? '#0891b2' : '#e2e8f0' }} />
      ))}
    </span>
  )
}

const exportOverviewExcel = (rows) => {
  const headers = ['โรงพยาบาล', 'จังหวัด', 'เขตสุขภาพ', 'งวดล่าสุด', 'Usage Score', 'ระดับการใช้งาน', 'วันทำการที่ใช้งาน (%)', '% เจ้าหน้าที่ รพ.', 'ระบบงานที่ใช้ (จาก 5)', 'รายการบัญชี', 'อัตราสำเร็จ (%)']
  const data = rows.map(r => [
    r.hospitalName, r.province, r.healthRegion, ymLabel(r.ym), r.usageScore.toFixed(1), r.usageLevel,
    r.businessDayRate.toFixed(0), r.hospitalStaffRate.toFixed(1), r.systemCoverage, r.journalEntries, r.successRate.toFixed(1),
  ])
  const title = 'รายงานสรุป Usage Score ทุกโรงพยาบาล'
  const ws = XLSX.utils.aoa_to_sheet([[title], [], headers, ...data])
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }]
  ws['!cols'] = headers.map(() => ({ wch: 18 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ภาพรวม Usage')
  XLSX.writeFile(wb, `usage_overview_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

const currentBEYear = String(new Date().getFullYear() + 543)

export default function UsageOverview() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterYear, setFilterYear] = useState(currentBEYear)
  const [filterRegion, setFilterRegion] = useState('')
  const [filterProvince, setFilterProvince] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('usageScore')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    fetch(`${API}/api/usage/overview`).then(r => r.json()).then(d => {
      setRows(Array.isArray(d) ? d : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const regions = useMemo(() => [...new Set((rows || []).map(r => r.healthRegion).filter(Boolean))].sort(), [rows])
  const provinces = useMemo(() => [...new Set((rows || []).map(r => r.province).filter(Boolean))].sort(), [rows])
  const years = useMemo(() => [...new Set((rows || []).map(r => String(Number(r.ym.slice(0, 4)) + 543)))].sort().reverse(), [rows])
  const globalLatestYm = useMemo(() => (rows && rows.length ? rows.reduce((m, r) => r.ym > m ? r.ym : m, '000000') : ''), [rows])

  const filtered = useMemo(() => {
    if (!rows) return []
    return rows.filter(r =>
      (!filterYear || String(Number(r.ym.slice(0, 4)) + 543) === filterYear) &&
      (!filterRegion || r.healthRegion === filterRegion) &&
      (!filterProvince || r.province === filterProvince) &&
      (!search.trim() || r.hospitalName.toLowerCase().includes(search.trim().toLowerCase()))
    )
  }, [rows, filterYear, filterRegion, filterProvince, search])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av ?? 0) - (bv ?? 0)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // ── KPI แถวบน ──────────────────────────────────────────────────────────────
  const totalInstalled = rows?.length || 0
  const sentLatest = filtered.filter(r => r.ym === globalLatestYm).length
  const fullyUsed = filtered.filter(r => r.usageScore >= 80).length
  const totalActions = filtered.reduce((s, r) => s + (r.nActionsTotal || 0), 0)
  const totalJournal = filtered.reduce((s, r) => s + (r.journalEntries || 0), 0)

  // ── แผนภูมิแท่งระดับคะแนนตามเขตสุขภาพ ───────────────────────────────────────
  const byRegion = useMemo(() => {
    const groups = {}
    filtered.forEach(r => {
      const key = r.healthRegion || 'ไม่ระบุเขต'
      if (!groups[key]) groups[key] = { full: 0, partial: 0, starting: 0, none: 0, total: 0 }
      const g = groups[key]
      g.total++
      if (r.usageScore >= 80) g.full++
      else if (r.usageScore >= 50) g.partial++
      else if (r.usageScore >= 20) g.starting++
      else g.none++
    })
    return Object.entries(groups).map(([region, g]) => ({ region, ...g }))
  }, [filtered])

  // ── heatmap รพ. × เดือน ───────────────────────────────────────────────────
  const allMonths = useMemo(() => {
    const set = new Set()
    ;(rows || []).forEach(r => r.sparkline.forEach(s => set.add(s.ym)))
    return [...set].sort()
  }, [rows])
  const heatmapScoreOf = (r, ym) => r.sparkline.find(s => s.ym === ym)?.score

  // ── ต้องติดตาม ──────────────────────────────────────────────────────────────
  const watchlist = useMemo(() => filtered.filter(r =>
    r.ym !== globalLatestYm || (r.scoreDelta != null && r.scoreDelta < -20) || r.hospitalStaffRate < 40 || r.successRate < 90
  ), [filtered, globalLatestYm])
  const watchReason = (r) => {
    const reasons = []
    if (r.ym !== globalLatestYm) reasons.push('ยังไม่ส่งข้อมูลงวดล่าสุด')
    if (r.scoreDelta != null && r.scoreDelta < -20) reasons.push(`คะแนนลดลง ${Math.abs(r.scoreDelta)} จุด`)
    if (r.hospitalStaffRate < 40) reasons.push('สัดส่วนเจ้าหน้าที่ รพ. ต่ำ')
    if (r.successRate < 90) reasons.push('อัตราทำรายการสำเร็จต่ำ')
    return reasons.join(' · ')
  }

  const th = { padding: '8px 12px', background: '#f1f5f9', color: '#374151', fontWeight: 700, textAlign: 'left', fontSize: 12, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }
  const td = { padding: '8px 12px', fontSize: 12.5, color: '#1e293b', borderTop: '1px solid #f1f5f9', whiteSpace: 'nowrap' }

  if (loading) return <div style={{ color: '#94a3b8', textAlign: 'center', padding: 60 }}>กำลังโหลดข้อมูล...</div>

  if (!rows || rows.length === 0) return (
    <div>
      <h2 style={{ fontSize: 22, color: '#1e3a5f', marginBottom: 16 }}>📶 แดชบอร์ด Usage — ภาพรวมทุก รพ.</h2>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 60, textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>ยังไม่มีข้อมูล Usage ที่นำเข้า</div>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, color: '#1e3a5f', marginBottom: 4 }}>📶 แดชบอร์ด Usage — ภาพรวมทุก รพ.</h2>
        <p style={{ color: '#64748b', fontSize: 13 }}>สรุปการใช้งานระบบจริง (บันทึกข้อมูล) ของทุกโรงพยาบาล แยกตามเขตสุขภาพ/จังหวัด</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ รพ..."
          style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, minWidth: 200 }} />
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
          <option value="">ทุกปี พ.ศ.</option>
          {years.map(y => <option key={y} value={y}>ปี {y}</option>)}
        </select>
        <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
          <option value="">ทุกเขตสุขภาพ</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterProvince} onChange={e => setFilterProvince(e.target.value)} style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
          <option value="">ทุกจังหวัด</option>
          {provinces.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {(filterYear !== currentBEYear || filterRegion || filterProvince || search) && (
          <button onClick={() => { setFilterYear(currentBEYear); setFilterRegion(''); setFilterProvince(''); setSearch('') }}
            style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#64748b' }}>✕ ล้างตัวกรอง</button>
        )}
        <button onClick={() => exportOverviewExcel(sorted)} disabled={sorted.length === 0} style={{
          padding: '8px 16px', background: sorted.length === 0 ? '#e2e8f0' : '#16a34a', color: sorted.length === 0 ? '#94a3b8' : '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: sorted.length === 0 ? 'default' : 'pointer',
        }}>📥 Export Excel</button>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>งวดล่าสุดในระบบ: {globalLatestYm && ymLabel(globalLatestYm)}</span>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { icon: '🏥', label: 'รพ. ที่ติดตั้ง', value: totalInstalled, color: '#1e3a5f', bg: '#eff6ff' },
          { icon: '📤', label: 'ส่งข้อมูลงวดล่าสุด', value: `${sentLatest}/${filtered.length}`, color: '#0891b2', bg: '#ecfeff' },
          { icon: '🟢', label: 'ใช้งานจริงเต็มรูปแบบ', value: fullyUsed, color: '#16a34a', bg: '#f0fdf4' },
          { icon: '⚡', label: 'การกระทำรวม', value: totalActions.toLocaleString('th-TH'), color: '#d97706', bg: '#fffbeb' },
          { icon: '📒', label: 'รายการบัญชีรวม', value: totalJournal.toLocaleString('th-TH'), color: '#dc2626', bg: '#fef2f2' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '14px 18px', border: `1px solid ${s.color}22` }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11.5, color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* แผนภูมิแท่งแยกระดับตามเขตสุขภาพ */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20 }}>
        <h3 style={{ color: '#1e3a5f', fontSize: 15, marginBottom: 16 }}>📊 ระดับการใช้งานแยกตามเขตสุขภาพ</h3>
        {byRegion.length === 0 ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>ไม่มีข้อมูล</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {byRegion.map(g => (
              <div key={g.region} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12.5, width: 110, flexShrink: 0, color: '#374151' }}>{g.region}</span>
                <div style={{ flex: 1, display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', background: '#f1f5f9' }}>
                  {g.full > 0 && <div style={{ width: `${g.full / g.total * 100}%`, background: '#16a34a' }} title={`เต็มรูปแบบ ${g.full}`} />}
                  {g.partial > 0 && <div style={{ width: `${g.partial / g.total * 100}%`, background: '#0891b2' }} title={`บางส่วน ${g.partial}`} />}
                  {g.starting > 0 && <div style={{ width: `${g.starting / g.total * 100}%`, background: '#d97706' }} title={`เริ่มต้น ${g.starting}`} />}
                  {g.none > 0 && <div style={{ width: `${g.none / g.total * 100}%`, background: '#dc2626' }} title={`ไม่ใช้งาน ${g.none}`} />}
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8', width: 50, textAlign: 'right' }}>{g.total} รพ.</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 14, marginTop: 4, fontSize: 11, color: '#64748b' }}>
              {[['#16a34a', 'เต็มรูปแบบ'], ['#0891b2', 'บางส่วน'], ['#d97706', 'เริ่มต้น'], ['#dc2626', 'ไม่ใช้งาน']].map(([c, l]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: c }} />{l}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ตารางอันดับ */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>ลำดับ</th>
                <th style={th} onClick={() => toggleSort('hospitalName')}>โรงพยาบาล</th>
                <th style={th} onClick={() => toggleSort('usageScore')}>Usage Score</th>
                <th style={th}>แนวโน้ม 6 เดือน</th>
                <th style={th} onClick={() => toggleSort('businessDayRate')}>วันทำการที่ใช้งาน</th>
                <th style={th} onClick={() => toggleSort('hospitalStaffRate')}>% เจ้าหน้าที่ รพ.</th>
                <th style={th}>ระบบงานที่ใช้</th>
                <th style={th} onClick={() => toggleSort('journalEntries')}>รายการบัญชี</th>
                <th style={th}>งวดล่าสุด</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const lc = levelColor(r.usageScore)
                const stale = r.ym !== globalLatestYm
                return (
                  <tr key={r.hospitalId}>
                    <td style={{ ...td, color: '#64748b', fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 600 }}>🏥 {r.hospitalName}</td>
                    <td style={td}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}>
                        {r.usageScore.toFixed(1)}
                      </span>
                      {r.scoreDelta != null && r.scoreDelta !== 0 && (
                        <span style={{ fontSize: 11, marginLeft: 6, color: r.scoreDelta > 0 ? '#16a34a' : '#dc2626' }}>
                          {r.scoreDelta > 0 ? '▲' : '▼'}{Math.abs(r.scoreDelta)}
                        </span>
                      )}
                    </td>
                    <td style={td}><Sparkline data={r.sparkline} /></td>
                    <td style={td} title={r.projectStartDate ? `วันเริ่มโครงการ ${fmtDate(r.projectStartDate)}` : undefined}>
                      {r.businessDayRate.toFixed(0)}%
                      {r.projectStartDate && <div style={{ fontSize: 10, color: '#cbd5e1' }}>จาก {fmtDate(r.projectStartDate)}</div>}
                    </td>
                    <td style={{ ...td, color: r.hospitalStaffRate < 40 ? '#dc2626' : '#1e293b', fontWeight: r.hospitalStaffRate < 40 ? 700 : 400 }}>{r.hospitalStaffRate.toFixed(1)}%</td>
                    <td style={td}><SystemDots n={r.systemCoverage} /></td>
                    <td style={td}>{r.journalEntries.toLocaleString('th-TH')}</td>
                    <td style={td}>
                      {ymLabel(r.ym)}
                      {stale && <span style={{ marginLeft: 6, fontSize: 10, color: '#dc2626' }}>⚠ ไม่ล่าสุด</span>}
                    </td>
                    <td style={td}>
                      <button onClick={() => navigate(`/usage-hospital?hospitalId=${r.hospitalId}&ym=${r.ym}`)} style={{
                        padding: '5px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#1d4ed8',
                      }}>เจาะดู →</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Heatmap รพ. × เดือน */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20 }}>
        <h3 style={{ color: '#1e3a5f', fontSize: 15, marginBottom: 4 }}>🗓️ Heatmap การใช้งาน รพ. × เดือน</h3>
        <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>สีเข้ม = คะแนนสูง · ช่องว่าง = ไม่ได้ส่งข้อมูลเดือนนั้น</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, position: 'sticky', left: 0, background: '#f1f5f9' }}>ลำดับ</th>
                <th style={{ ...th, position: 'sticky', left: 44, background: '#f1f5f9' }}>โรงพยาบาล</th>
                {allMonths.map(m => <th key={m} style={{ ...th, textAlign: 'center' }}>{ymLabel(m)}</th>)}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.hospitalId}>
                  <td style={{ ...td, position: 'sticky', left: 0, background: '#fff', color: '#64748b', fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ ...td, position: 'sticky', left: 44, background: '#fff', fontWeight: 600 }}>{r.hospitalName}</td>
                  {allMonths.map(m => {
                    const score = heatmapScoreOf(r, m)
                    const lc = score != null ? levelColor(score) : null
                    return (
                      <td key={m} style={{ ...td, textAlign: 'center' }}>
                        {score != null ? (
                          <span style={{ display: 'inline-block', minWidth: 40, padding: '3px 6px', borderRadius: 6, background: lc.bg, color: lc.color, fontWeight: 700, fontSize: 11.5 }}>
                            {score.toFixed(0)}
                          </span>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ต้องติดตาม */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #fecaca', padding: 20 }}>
        <h3 style={{ color: '#dc2626', fontSize: 15, marginBottom: 14 }}>🚩 รายการต้องติดตาม ({watchlist.length})</h3>
        {watchlist.length === 0 ? <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>✅ ไม่มีรายการที่ต้องติดตามตอนนี้</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {watchlist.map(r => (
              <div key={r.hospitalId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca' }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1e293b' }}>🏥 {r.hospitalName}</span>
                <span style={{ fontSize: 12, color: '#b91c1c' }}>{watchReason(r)}</span>
                <button onClick={() => navigate(`/usage-hospital?hospitalId=${r.hospitalId}&ym=${r.ym}`)} style={{
                  padding: '4px 10px', background: '#fff', border: '1px solid #fecaca', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', color: '#dc2626',
                }}>ดู →</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
