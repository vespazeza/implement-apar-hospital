import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || ''
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const ymLabel = (ym) => { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(4, 6)); return `${THAI_MONTHS[m - 1]} ${y + 543}` }

export default function UsageSubmissionTracking() {
  const navigate = useNavigate()
  const [months, setMonths] = useState(6)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`${API}/api/usage/submission-tracking?months=${months}`).then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [months])
  useEffect(() => { load() }, [load])

  const th = { padding: '8px 12px', background: '#f1f5f9', color: '#374151', fontWeight: 700, textAlign: 'center', fontSize: 12, whiteSpace: 'nowrap' }
  const td = { padding: '8px 12px', fontSize: 12.5, color: '#1e293b', borderTop: '1px solid #f1f5f9', textAlign: 'center' }

  const totalCells = data ? data.hospitals.length * data.months.length : 0
  const sentCells = data ? data.hospitals.reduce((s, h) => s + h.months.filter(m => m.sent).length, 0) : 0

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, color: '#1e3a5f', marginBottom: 4 }}>📬 ติดตามการส่งข้อมูล Usage</h2>
        <p style={{ color: '#64748b', fontSize: 13 }}>ตรวจว่าแต่ละโรงพยาบาลส่งข้อมูล Usage รายเดือนครบหรือไม่</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>ย้อนหลัง:</span>
        {[3, 6, 12].map(n => (
          <button key={n} onClick={() => setMonths(n)} style={{
            padding: '7px 16px', borderRadius: 8, border: `1.5px solid ${months === n ? '#0891b2' : '#e2e8f0'}`,
            background: months === n ? '#0891b2' : '#fff', color: months === n ? '#fff' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{n} เดือน</button>
        ))}
        {data && (
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#64748b' }}>
            ส่งแล้ว {sentCells} / {totalCells} ช่อง ({totalCells ? Math.round(sentCells / totalCells * 100) : 0}%)
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ color: '#94a3b8', textAlign: 'center', padding: 60 }}>กำลังโหลด...</div>
      ) : !data || data.hospitals.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 60, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏥</div><div style={{ fontSize: 16, fontWeight: 600 }}>ยังไม่มีโรงพยาบาลในระบบ</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, position: 'sticky', left: 0, background: '#f1f5f9' }}>ลำดับ</th>
                  <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 44, background: '#f1f5f9' }}>โรงพยาบาล</th>
                  {data.months.map(ym => <th key={ym} style={th}>{ymLabel(ym)}</th>)}
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {data.hospitals.map((h, i) => {
                  const sentCount = h.months.filter(m => m.sent).length
                  return (
                    <tr key={h.hospitalId}>
                      <td style={{ ...td, position: 'sticky', left: 0, background: '#fff', color: '#64748b', fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 600, position: 'sticky', left: 44, background: '#fff' }}>
                        🏥 {h.hospitalName}
                        {sentCount === 0 && <span style={{ marginLeft: 6, fontSize: 10, color: '#dc2626' }}>⚠ ไม่เคยส่ง</span>}
                      </td>
                      {h.months.map(m => (
                        <td key={m.ym} style={td}>
                          {m.sent
                            ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: '#f0fdf4', color: '#16a34a', fontWeight: 700, fontSize: 11 }} title={`คะแนน ${m.score}`}>✓ {Number(m.score).toFixed(0)}</span>
                            : <span style={{ color: '#e2e8f0', fontSize: 16 }}>—</span>}
                        </td>
                      ))}
                      <td style={td}>
                        {sentCount > 0 && (
                          <button onClick={() => navigate(`/usage-hospital?hospitalId=${h.hospitalId}`)} style={{
                            padding: '4px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 11.5, cursor: 'pointer', color: '#1d4ed8',
                          }}>ดู →</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
