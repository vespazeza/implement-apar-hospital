import { useState, useEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext'

const API = import.meta.env.VITE_API_URL || ''
const COLORS = ['#0891b2', '#dc2626', '#16a34a', '#d97706', '#7c3aed']
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const ymLabel = (ym) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(4, 6)); return `${THAI_MONTHS[m - 1]} ${y + 543}` }

const METRICS = [
  { key: 'usageScore', label: 'Usage Score' },
  { key: 'businessDayRate', label: 'วันทำการที่ใช้งาน (%)' },
  { key: 'hospitalStaffRate', label: 'สัดส่วนเจ้าหน้าที่ รพ. (%)' },
  { key: 'activeUserRate', label: 'อัตราผู้ใช้ active (%)' },
  { key: 'successRate', label: 'อัตราทำรายการสำเร็จ (%)' },
  { key: 'systemCoverage', label: 'ระบบงานที่ใช้ (จาก 5)' },
  { key: 'journalEntries', label: 'รายการบัญชี' },
]

function TrendChart({ series }) {
  const allPoints = series.flatMap(s => s.history)
  if (allPoints.length === 0) return <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>ไม่มีข้อมูล</div>
  const allYm = [...new Set(allPoints.map(p => p.ym))].sort()
  const singleColumn = allYm.length === 1
  const W = Math.max(500, allYm.length * 70), H = 220, pad = 24
  // งวดเดียว = จุดกึ่งกลางกราฟ (ไม่งั้นจุดทุก รพ. จะซ้อนกันที่ขอบซ้ายสุด มองแทบไม่เห็น)
  const x = (ym) => singleColumn ? W / 2 : pad + (allYm.indexOf(ym) / Math.max(allYm.length - 1, 1)) * (W - pad * 2)
  const y = (score) => H - pad - (score / 100) * (H - pad * 2)
  const hasTrendLine = series.some(s => s.history.filter(h => h.usageScore != null).length >= 2)

  return (
    <div style={{ overflowX: 'auto' }}>
      {!hasTrendLine && (
        <div style={{ fontSize: 11.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 12px', marginBottom: 10 }}>
          💡 แต่ละ รพ. มีข้อมูลแค่งวดเดียวตอนนี้ จึงยังวาดเส้นแนวโน้มไม่ได้ (แสดงเป็นจุดคะแนนล่าสุดแทน) — นำเข้าข้อมูลงวดถัดไปแล้วจะเห็นเส้นแนวโน้ม
        </div>
      )}
      <svg width={W} height={H} style={{ minWidth: '100%' }}>
        {[0, 25, 50, 75, 100].map(v => (
          <g key={v}>
            <line x1={pad} y1={y(v)} x2={W - pad} y2={y(v)} stroke="#f1f5f9" />
            <text x={2} y={y(v) + 3} fontSize="9" fill="#94a3b8">{v}</text>
          </g>
        ))}
        {series.map((s, si) => {
          const pts = s.history.filter(h => h.usageScore != null)
          if (pts.length === 0) return null
          const path = pts.map(p => `${x(p.ym)},${y(p.usageScore)}`).join(' ')
          // งวดเดียวขยับจุดแต่ละ รพ. เหลื่อมแนวนอนเล็กน้อย กันจุดซ้อนทับกันเป๊ะเวลาคะแนนใกล้กัน
          const jitter = singleColumn ? (si - (series.length - 1) / 2) * 16 : 0
          return (
            <g key={s.hospitalId}>
              <polyline points={path} fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth="2.2" />
              {pts.map(p => (
                <g key={p.ym}>
                  <circle cx={x(p.ym) + jitter} cy={y(p.usageScore)} r={singleColumn ? 5 : 3} fill={COLORS[si % COLORS.length]} />
                  {singleColumn && (
                    <text x={x(p.ym) + jitter} y={y(p.usageScore) - 10} fontSize="10" fontWeight="700" fill={COLORS[si % COLORS.length]} textAnchor="middle">
                      {p.usageScore.toFixed(1)}
                    </text>
                  )}
                </g>
              ))}
            </g>
          )
        })}
        {allYm.map(ym => <text key={ym} x={x(ym)} y={H - 4} fontSize="9" fill="#94a3b8" textAnchor="middle">{ymLabel(ym)}</text>)}
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        {series.map((s, si) => (
          <span key={s.hospitalId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[si % COLORS.length] }} />{s.hospitalName}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function UsageCompare() {
  const { hospitals } = useApp()
  const [selected, setSelected] = useState([])
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    return hospitals.filter(h => h.name.toLowerCase().includes(q) && !selected.includes(h.id)).slice(0, 8)
  }, [query, hospitals, selected])

  const addHospital = (id) => {
    if (selected.length >= 5 || selected.includes(id)) return
    setSelected(p => [...p, id]); setQuery('')
  }
  const removeHospital = (id) => setSelected(p => p.filter(x => x !== id))

  useEffect(() => {
    if (selected.length < 2) { setData(null); return }
    setLoading(true)
    fetch(`${API}/api/usage/compare?hospitalIds=${selected.join(',')}`).then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [selected])

  const getHospName = (id) => hospitals.find(h => String(h.id) === String(id))?.name || `รพ. ${id}`

  const th = { padding: '8px 12px', background: '#f1f5f9', color: '#374151', fontWeight: 700, textAlign: 'left', fontSize: 12, whiteSpace: 'nowrap' }
  const td = { padding: '8px 12px', fontSize: 12.5, color: '#1e293b', borderTop: '1px solid #f1f5f9', whiteSpace: 'nowrap' }

  const latestRow = (hist) => (hist && hist.length ? hist[hist.length - 1] : null)

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, color: '#1e3a5f', marginBottom: 4 }}>⚖️ เปรียบเทียบโรงพยาบาล</h2>
        <p style={{ color: '#64748b', fontSize: 13 }}>เลือก 2–5 แห่งเพื่อเปรียบเทียบ Usage Score และ KPI บนกราฟเดียวกัน</p>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20 }}>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={selected.length >= 5 ? 'เลือกครบ 5 แห่งแล้ว' : 'พิมพ์ชื่อโรงพยาบาลเพื่อเพิ่ม...'}
            disabled={selected.length >= 5}
            style={{ width: '100%', padding: '9px 13px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, boxSizing: 'border-box' }} />
          {suggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #0891b2', borderRadius: 8, zIndex: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
              {suggestions.map(h => (
                <div key={h.id} onMouseDown={() => addHospital(h.id)} style={{ padding: '9px 13px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'} onMouseLeave={e => e.currentTarget.style.background = ''}>🏥 {h.name}</div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {selected.map((id, i) => (
            <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: `${COLORS[i % COLORS.length]}18`, border: `1px solid ${COLORS[i % COLORS.length]}55`, fontSize: 12.5, color: COLORS[i % COLORS.length], fontWeight: 600 }}>
              {getHospName(id)}
              <button onClick={() => removeHospital(id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13 }}>✕</button>
            </span>
          ))}
          {selected.length === 0 && <span style={{ fontSize: 12.5, color: '#94a3b8' }}>ยังไม่ได้เลือกโรงพยาบาล</span>}
        </div>
      </div>

      {selected.length >= 1 && selected.length < 2 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400e', marginBottom: 20 }}>
          ⚠️ เลือกอย่างน้อย 2 แห่งเพื่อเริ่มเปรียบเทียบ
        </div>
      )}

      {loading && <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>กำลังโหลด...</div>}

      {data && !loading && (
        <>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20 }}>
            <h3 style={{ color: '#1e3a5f', fontSize: 15, marginBottom: 16 }}>📈 แนวโน้ม Usage Score</h3>
            <TrendChart series={data} />
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>ตัวชี้วัด (รอบล่าสุดของแต่ละ รพ.)</th>
                    {data.map(s => <th key={s.hospitalId} style={th}>{s.hospitalName}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map(m => (
                    <tr key={m.key}>
                      <td style={{ ...td, fontWeight: 600 }}>{m.label}</td>
                      {data.map(s => {
                        const latest = latestRow(s.history)
                        const v = latest ? latest[m.key] : null
                        return <td key={s.hospitalId} style={td}>{v != null ? (typeof v === 'number' && m.key.includes('Rate') ? `${v.toFixed(1)}%` : v) : '-'}</td>
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...td, fontWeight: 600 }}>งวดล่าสุด</td>
                    {data.map(s => { const latest = latestRow(s.history); return <td key={s.hospitalId} style={td}>{latest ? ymLabel(latest.ym) : 'ไม่มีข้อมูล'}</td> })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
