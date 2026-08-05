import { useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import SearchableSelect from '../components/SearchableSelect'

// ─── Risk config ─────────────────────────────────────────────────────────────

const SEVERITY_SCORE = { high: 3, medium: 2, low: 1 }
const STATUS_WEIGHT  = { open: 1, inprogress: 0.6, closed: 0 }

const RISK_LEVEL = [
  { min: 8,  label: 'สูงมาก',      color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '🔴' },
  { min: 4,  label: 'สูง',         color: '#ea580c', bg: '#fff7ed', border: '#fdba74', icon: '🟠' },
  { min: 2,  label: 'ปานกลาง',    color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '🟡' },
  { min: 0.1,label: 'ต่ำ',         color: '#16a34a', bg: '#f0fdf4', border: '#86efac', icon: '🟢' },
  { min: 0,  label: 'ไม่มีความเสี่ยง', color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0', icon: '⚪' },
]

const RECOMMENDATIONS = {
  'ข้อมูลพื้นฐาน': [
    'จัดทำ Template มาตรฐานสำหรับนำเข้าข้อมูลพื้นฐานพร้อม Validation',
    'กำหนดผู้รับผิดชอบตรวจสอบความถูกต้องของข้อมูลก่อน Go-Live',
    'จัดอบรมเพิ่มเติมด้านการกรอกข้อมูลพื้นฐานให้กับเจ้าหน้าที่',
    'ทดสอบการนำเข้าข้อมูลทดสอบก่อนนำเข้าจริงอย่างน้อย 1 รอบ',
  ],
  'แบบฟอร์ม': [
    'ทดสอบการพิมพ์แบบฟอร์มกับข้อมูลจริงก่อน Go-Live ทุกแบบ',
    'อบรมผู้ใช้งานการออกแบบฟอร์มและการตั้งค่า Parameter',
    'กำหนดขั้นตอน UAT แบบฟอร์มพร้อมผู้รับผิดชอบตรวจสอบ',
    'จัดทำคู่มือการใช้งานแบบฟอร์มแต่ละประเภทเป็นภาษาไทย',
  ],
  'รายงาน': [
    'เปรียบเทียบผลลัพธ์รายงานกับระบบเดิมก่อน Go-Live',
    'กำหนดผู้รับผิดชอบตรวจสอบรายงานสำคัญประจำวัน/เดือน',
    'จัดทำรายการ Checklist รายงานที่ต้องทดสอบครบก่อนปิดโครงการ',
    'อบรมการอ่านและตีความรายงานให้ผู้บริหารและผู้ใช้งาน',
  ],
  'การใช้งานระบบ': [
    'จัดอบรมเพิ่มเติมเฉพาะกลุ่มผู้ใช้งานที่ยังมีปัญหา',
    'จัดทำคู่มือการใช้งานประจำวัน (Quick Guide) เป็นภาษาไทย',
    'ตั้ง Help Desk หรือช่องทางติดต่อทีมสนับสนุนที่ชัดเจน',
    'กำหนด Super User ประจำ รพ. เพื่อเป็นจุดประสานงานแรก',
  ],
  'อื่นๆ': [
    'วิเคราะห์สาเหตุปัญหาเพิ่มเติมและจัดทำแผนรับมือ',
    'บันทึกปัญหาและวิธีแก้ไขเพื่อสร้างฐานความรู้',
    'ประสานงานทีมพัฒนาระบบหากปัญหาเกี่ยวข้องกับ Software',
  ],
}

const DEFAULT_REC = [
  'ติดตามและประเมินผลการแก้ไขปัญหาอย่างต่อเนื่อง',
  'จัดประชุมทบทวนปัญหาและความเสี่ยงประจำสัปดาห์',
  'บันทึกบทเรียนที่ได้รับเพื่อปรับปรุงการติดตั้งครั้งต่อไป',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getRiskLevel = (score) => RISK_LEVEL.find(r => score >= r.min) || RISK_LEVEL[RISK_LEVEL.length - 1]

const calcScore = (issues) =>
  issues.reduce((s, i) => s + (SEVERITY_SCORE[i.severity] || 1) * (STATUS_WEIGHT[i.status] ?? 1), 0)

const formatDate = () => {
  const d = new Date()
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`
}

// ─── Donut chart helpers ──────────────────────────────────────────────────────

// Fixed categorical order (blue, orange, aqua, yellow, magenta, violet) — green is
// skipped here since this page already uses it as the "low risk / resolved" status color.
const PIE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7']
const PIE_LABEL_LIGHT = { '#2a78d6': true, '#eb6834': true, '#4a3aa7': true }
const PIE_OTHER_COLOR = '#94a3b8'

const polarToCartesian = (cx, cy, r, angleDeg) => {
  const rad = (angleDeg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

const donutSlicePath = (cx, cy, outerR, innerR, startAngle, endAngle) => {
  const startOuter = polarToCartesian(cx, cy, outerR, endAngle)
  const endOuter = polarToCartesian(cx, cy, outerR, startAngle)
  const startInner = polarToCartesian(cx, cy, innerR, endAngle)
  const endInner = polarToCartesian(cx, cy, innerR, startAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 1 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ')
}

// ─── Components ───────────────────────────────────────────────────────────────

function RiskBadge({ score }) {
  const r = getRiskLevel(score)
  return (
    <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
      background: r.bg, color: r.color, border: `1px solid ${r.border}`, whiteSpace: 'nowrap' }}>
      {r.icon} {r.label}
    </span>
  )
}

function ScoreBar({ score, max = 15 }) {
  const pct = Math.min((score / max) * 100, 100)
  const r = getRiskLevel(score)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: r.color, height: '100%', borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: r.color, minWidth: 32 }}>{score.toFixed(1)}</span>
    </div>
  )
}

function CategoryDonut({ issues }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const total = issues.length

  if (total === 0) {
    return <div style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>ยังไม่มีข้อมูลปัญหา</div>
  }

  const counts = {}
  issues.forEach(i => {
    const cat = i.category || 'ไม่ระบุ'
    counts[cat] = (counts[cat] || 0) + 1
  })
  const sortedCats = Object.entries(counts).sort((a, b) => b[1] - a[1])

  // ≤6 segments total (donut/pie legibility cap) — fold the tail into "อื่นๆ"
  let slices
  if (sortedCats.length <= 6) {
    slices = sortedCats.map(([cat, count], idx) => ({ cat, count, color: PIE_COLORS[idx] }))
  } else {
    const top = sortedCats.slice(0, 5)
    const restCount = sortedCats.slice(5).reduce((s, [, c]) => s + c, 0)
    slices = top.map(([cat, count], idx) => ({ cat, count, color: PIE_COLORS[idx] }))
    slices.push({ cat: 'อื่นๆ', count: restCount, color: PIE_OTHER_COLOR })
  }

  const R_OUT = 90, R_IN = 56, CX = 100, CY = 100
  const GAP = slices.length > 1 ? 2 : 0
  let cursor = 0
  const arcs = slices.map((s, idx) => {
    const sweep = (s.count / total) * 360
    const start = cursor + GAP / 2
    const end = cursor + Math.max(sweep - GAP, 0.001) + GAP / 2
    cursor += sweep
    return { ...s, idx, start, end, pct: Math.round((s.count / total) * 100) }
  })

  const hovered = hoverIdx != null ? arcs[hoverIdx] : null

  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={200} height={200} viewBox="0 0 200 200" style={{ flexShrink: 0 }}>
        {arcs.map(a => (
          <path key={a.cat}
            d={donutSlicePath(CX, CY, R_OUT, R_IN, a.start, a.end)}
            fill={a.color}
            opacity={hoverIdx == null || hoverIdx === a.idx ? 1 : 0.4}
            style={{ transition: 'opacity 0.15s', cursor: 'pointer' }}
            onMouseEnter={() => setHoverIdx(a.idx)}
            onMouseLeave={() => setHoverIdx(null)}
          />
        ))}
        {arcs.filter(a => a.pct >= 8).map(a => {
          const mid = (a.start + a.end) / 2
          const pos = polarToCartesian(CX, CY, (R_OUT + R_IN) / 2, mid)
          return (
            <text key={`lbl-${a.cat}`} x={pos.x} y={pos.y}
              textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: 12, fontWeight: 700, fill: PIE_LABEL_LIGHT[a.color] ? '#fff' : '#1e293b', pointerEvents: 'none' }}>
              {a.pct}%
            </text>
          )
        })}
        <text x={CX} y={CY - 6} textAnchor="middle" style={{ fontSize: 22, fontWeight: 800, fill: '#1e3a5f' }}>
          {hovered ? `${hovered.pct}%` : total}
        </text>
        <text x={CX} y={CY + 15} textAnchor="middle" style={{ fontSize: 10, fill: '#94a3b8' }}>
          {hovered ? (hovered.cat.length > 14 ? hovered.cat.slice(0, 13) + '…' : hovered.cat) : 'ปัญหาทั้งหมด'}
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 220 }}>
        {arcs.map(a => (
          <div key={a.cat}
            onMouseEnter={() => setHoverIdx(a.idx)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
              background: hoverIdx === a.idx ? '#f8fafc' : 'transparent', transition: 'background 0.15s',
            }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: a.color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#374151', flex: 1 }}>{a.cat}</span>
            <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{a.count} รายการ</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', minWidth: 40, textAlign: 'right' }}>{a.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function RiskAnalysis() {
  const { hospitals, trainingIssues, systemIssues } = useApp()
  const [activeTab, setActiveTab] = useState('overview')
  const printRef = useRef()

  const currentBEYear = String(new Date().getFullYear() + 543)
  const [filterOverviewYear, setFilterOverviewYear] = useState(currentBEYear)
  const [filterOverviewHosp, setFilterOverviewHosp] = useState('')
  const [filterHospYear, setFilterHospYear] = useState(currentBEYear)
  const [filterHosp, setFilterHosp] = useState('')
  const [filterCatYear, setFilterCatYear] = useState(currentBEYear)
  const [filterCatHosp, setFilterCatHosp] = useState('')
  const [filterReportYear, setFilterReportYear] = useState(currentBEYear)
  const [filterReportHosp, setFilterReportHosp] = useState('')

  const allIssues = [
    ...trainingIssues.map(i => ({ ...i, source: 'training' })),
    ...systemIssues.map(i => ({ ...i, source: 'system' })),
  ]

  const getHospName = (id) => hospitals.find(h => String(h.id) === String(id))?.name || `รพ. ${id}`

  const getIssueYear = (i) => {
    const d = i.date || i.reportDate || ''
    if (!d) return ''
    const y = parseInt(String(d).slice(0, 4))
    return isNaN(y) ? '' : String(y + 543)
  }

  const allYears = [...new Set(allIssues.map(getIssueYear).filter(Boolean))].sort().reverse()

  // Helper: compute hospRisks from a set of issues
  const buildHospRisks = (issues) => hospitals.map(h => {
    const hIssues = issues.filter(i => String(i.hospitalId) === String(h.id))
    const score = calcScore(hIssues)
    const openHigh = hIssues.filter(i => i.severity === 'high' && i.status !== 'closed').length
    const openMed  = hIssues.filter(i => i.severity === 'medium' && i.status !== 'closed').length
    const openLow  = hIssues.filter(i => i.severity === 'low' && i.status !== 'closed').length
    const total    = hIssues.length
    const closed   = hIssues.filter(i => i.status === 'closed').length
    const categories = [...new Set(hIssues.map(i => i.category).filter(Boolean))]
    return { hosp: h, score, openHigh, openMed, openLow, total, closed, categories }
  }).sort((a, b) => b.score - a.score)

  // Helper: compute catRisks from a set of issues
  const buildCatRisks = (issues) => {
    const cats = [...new Set(issues.map(i => i.category || 'ไม่ระบุ'))]
    return cats.map(cat => {
      const catIssues = issues.filter(i => (i.category || 'ไม่ระบุ') === cat)
      const score = calcScore(catIssues)
      const open  = catIssues.filter(i => i.status !== 'closed').length
      const recs  = RECOMMENDATIONS[cat] || DEFAULT_REC
      return { cat, issues: catIssues, score, open, recs }
    }).sort((a, b) => b.score - a.score)
  }

  // Per-tab filtered issues
  const overviewIssues = allIssues.filter(i =>
    (!filterOverviewYear || getIssueYear(i) === filterOverviewYear) &&
    (!filterOverviewHosp || String(i.hospitalId) === filterOverviewHosp)
  )
  const hospTabIssues = allIssues.filter(i =>
    !filterHospYear || getIssueYear(i) === filterHospYear
  )
  const catTabIssues = allIssues.filter(i =>
    (!filterCatYear || getIssueYear(i) === filterCatYear) &&
    (!filterCatHosp || String(i.hospitalId) === filterCatHosp)
  )
  const reportIssues = allIssues.filter(i =>
    (!filterReportYear || getIssueYear(i) === filterReportYear) &&
    (!filterReportHosp || String(i.hospitalId) === filterReportHosp)
  )

  // Per-tab computed risks
  const overviewHospRisks = buildHospRisks(overviewIssues)
  const overviewCatRisks  = buildCatRisks(overviewIssues)
  const hospTabHospRisks  = buildHospRisks(hospTabIssues)
  const catTabCatRisks    = buildCatRisks(catTabIssues)
  const reportHospRisks   = buildHospRisks(reportIssues)
  const reportCatRisks    = buildCatRisks(reportIssues)
  // เมื่อกรอง รพ. → แสดงเฉพาะ รพ.นั้นในตาราง/สรุป
  const reportHospRisksVisible = filterReportHosp
    ? reportHospRisks.filter(h => String(h.hosp.id) === filterReportHosp)
    : reportHospRisks

  // For summary cards (always all issues)
  const hospRisks = buildHospRisks(allIssues)
  const totalOpen = allIssues.filter(i => i.status !== 'closed').length
  const highRisk  = hospRisks.filter(h => h.score >= 4).length
  const maxScore  = hospRisks.reduce((m, h) => Math.max(m, h.score), 0)

  // Filtered hospital list for hospital detail tab
  const filteredHospRisks = filterHosp
    ? hospTabHospRisks.filter(h => String(h.hosp.id) === filterHosp)
    : hospTabHospRisks


  const handlePrint = () => {
    const content = printRef.current.innerHTML
    const win = window.open('', '_blank')
    win.document.write(`
      <html><head>
        <meta charset="utf-8">
        <title>รายงานวิเคราะห์ความเสี่ยง</title>
        <style>
          body { font-family: 'Sarabun', 'Tahoma', sans-serif; font-size: 13px; color: #1e293b; margin: 0; padding: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px 12px; font-size: 12px; }
          th { background: #f1f5f9; font-weight: 700; }
          h1 { font-size: 20px; color: #1e3a5f; margin-bottom: 4px; }
          h2 { font-size: 16px; color: #1e3a5f; margin: 20px 0 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
          h3 { font-size: 14px; color: #374151; margin: 12px 0 6px; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; }
          .rec { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 8px 12px; margin: 4px 0; border-radius: 4px; font-size: 12px; }
          .section { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
          @media print { body { padding: 0; } }
        </style>
      </head><body>${content}</body></html>
    `)
    win.document.close()
    win.print()
  }

  const TABS = [
    { key: 'overview',  label: '📊 ภาพรวมความเสี่ยง' },
    { key: 'hospital',  label: '🏥 วิเคราะห์ตาม รพ.' },
    { key: 'category',  label: '🗂️ วิเคราะห์ตามประเภท' },
    { key: 'report',    label: '📑 รายงานผู้บริหาร' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, color: '#1e3a5f', marginBottom: 4 }}>⚠️ วิเคราะห์ความเสี่ยง</h2>
        <p style={{ color: '#64748b', fontSize: 13 }}>ประมวลผลและวิเคราะห์ความเสี่ยงจากปัญหาอบรมและขึ้นระบบ พร้อมแนวทางป้องกัน</p>
      </div>

      {/* Filters — scope ภาพรวมปัญหา + ภาพรวมความเสี่ยง */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterOverviewYear} onChange={e => setFilterOverviewYear(e.target.value)}
          style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
          <option value="">ทุกปี พ.ศ.</option>
          {allYears.map(y => <option key={y} value={y}>ปี {y}</option>)}
        </select>
        <SearchableSelect value={filterOverviewHosp} onChange={setFilterOverviewHosp}
          options={hospitals.map(h => ({ value: String(h.id), label: h.name }))}
          allLabel="ทุก รพ." style={{ minWidth: 200 }} />
        {(filterOverviewYear !== currentBEYear || filterOverviewHosp) && (
          <button onClick={() => { setFilterOverviewYear(currentBEYear); setFilterOverviewHosp('') }}
            style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#64748b' }}>
            ✕ ล้าง
          </button>
        )}
        <span style={{ fontSize: 12, color: '#94a3b8' }}>ข้อมูล {overviewIssues.length} รายการ</span>
      </div>

      {/* ภาพรวมปัญหา: สัดส่วนตามประเภท */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, marginBottom: 24 }}>
        <h3 style={{ color: '#1e3a5f', fontSize: 15, marginBottom: 4 }}>📊 ภาพรวมปัญหา</h3>
        <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 16 }}>
          สัดส่วนปัญหา{filterOverviewHosp ? `ของ ${getHospName(filterOverviewHosp)}` : 'ทั้งหมด'}แยกตามประเภทปัญหา ({overviewIssues.length} รายการ)
        </p>
        <CategoryDonut issues={overviewIssues} />
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { icon: '📋', label: 'ปัญหาทั้งหมด', value: allIssues.length, color: '#1e3a5f', bg: '#eff6ff' },
          { icon: '🔓', label: 'ยังไม่แก้ไข', value: totalOpen, color: '#dc2626', bg: '#fef2f2' },
          { icon: '🏥', label: 'รพ. ความเสี่ยงสูง', value: highRisk, color: '#ea580c', bg: '#fff7ed' },
          { icon: '📈', label: 'คะแนนความเสี่ยงสูงสุด', value: maxScore.toFixed(1), color: '#d97706', bg: '#fffbeb' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '16px 20px', border: `1px solid ${s.color}22` }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '2px solid #e2e8f0', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: 'none', color: activeTab === t.key ? '#0891b2' : '#64748b',
            borderBottom: `3px solid ${activeTab === t.key ? '#0891b2' : 'transparent'}`,
            marginBottom: -2,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Tab: Overview ── */}
      {activeTab === 'overview' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Top risky hospitals */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
            <h3 style={{ color: '#1e3a5f', fontSize: 15, marginBottom: 16 }}>🏥 ระดับความเสี่ยงตาม รพ.</h3>
            {overviewHospRisks.filter(h => h.total > 0).length === 0 ? (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: 32 }}>ยังไม่มีข้อมูล</div>
            ) : overviewHospRisks.filter(h => h.total > 0).slice(0, 10).map(h => (
              <div key={h.hosp.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{h.hosp.name}</span>
                  <RiskBadge score={h.score} />
                </div>
                <ScoreBar score={h.score} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  ปัญหา {h.total} รายการ | ค้างแก้ {h.total - h.closed} รายการ
                </div>
              </div>
            ))}
          </div>

          {/* Risk by category */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
            <h3 style={{ color: '#1e3a5f', fontSize: 15, marginBottom: 16 }}>🗂️ ระดับความเสี่ยงตามประเภท</h3>
            {overviewCatRisks.length === 0 ? (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: 32 }}>ยังไม่มีข้อมูล</div>
            ) : overviewCatRisks.map(c => (
              <div key={c.cat} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{c.cat}</span>
                  <RiskBadge score={c.score} />
                </div>
                <ScoreBar score={c.score} />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {c.issues.length} รายการ | ค้างแก้ {c.open} รายการ
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {/* ── Tab: Hospital ── */}
      {activeTab === 'hospital' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={filterHospYear} onChange={e => setFilterHospYear(e.target.value)}
              style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
              <option value="">ทุกปี พ.ศ.</option>
              {allYears.map(y => <option key={y} value={y}>ปี {y}</option>)}
            </select>
            <SearchableSelect value={filterHosp} onChange={setFilterHosp}
              options={hospitals.map(h => ({ value: String(h.id), label: h.name }))}
              allLabel="ทุก รพ." style={{ minWidth: 220 }} />
            {(filterHospYear !== currentBEYear || filterHosp) && (
              <button onClick={() => { setFilterHospYear(currentBEYear); setFilterHosp('') }}
                style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#64748b' }}>
                ✕ ล้าง
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredHospRisks.filter(h => h.total > 0).map(h => {
              const rl = getRiskLevel(h.score)
              const hIssues = allIssues.filter(i => String(i.hospitalId) === String(h.hosp.id))
              const catGroups = [...new Set(hIssues.map(i => i.category || 'ไม่ระบุ'))]
              return (
                <div key={h.hosp.id} style={{ background: '#fff', borderRadius: 12, border: `1.5px solid ${rl.border}`, overflow: 'hidden' }}>
                  <div style={{ background: rl.bg, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>🏥 {h.hosp.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{h.hosp.province} | ประเภท {h.hosp.type}</div>
                    </div>
                    <RiskBadge score={h.score} />
                    <div style={{ fontSize: 12, color: '#64748b' }}>คะแนนความเสี่ยง: <strong>{h.score.toFixed(1)}</strong></div>
                  </div>
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
                      {[
                        { label: 'ปัญหาทั้งหมด', value: h.total, color: '#1e3a5f' },
                        { label: 'ค้างแก้ไข', value: h.total - h.closed, color: '#dc2626' },
                        { label: 'ความรุนแรงสูง', value: h.openHigh, color: '#ea580c' },
                        { label: 'แก้ไขแล้ว', value: h.closed, color: '#16a34a' },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 8, padding: '10px 4px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Issues by category */}
                    {catGroups.map(cat => {
                      const catIssues = hIssues.filter(i => (i.category || 'ไม่ระบุ') === cat)
                      const catScore  = calcScore(catIssues)
                      const recs = RECOMMENDATIONS[cat] || DEFAULT_REC
                      return (
                        <div key={cat} style={{ marginBottom: 14, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                          <div style={{ background: '#f8fafc', padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: '#374151', flex: 1 }}>📂 {cat}</span>
                            <RiskBadge score={catScore} />
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>{catIssues.length} รายการ</span>
                          </div>
                          <div style={{ padding: '12px 14px' }}>
                            <div style={{ fontSize: 12, color: '#374151', fontWeight: 600, marginBottom: 6 }}>🛡️ แนวทางป้องกัน / แก้ไข:</div>
                            {recs.map((r, i) => (
                              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
                                <span style={{ color: '#0891b2', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                                <span style={{ fontSize: 12, color: '#374151' }}>{r}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {filteredHospRisks.filter(h => h.total > 0).length === 0 && (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>ไม่พบปัญหาที่บันทึกไว้</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Category ── */}
      {activeTab === 'category' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={filterCatYear} onChange={e => setFilterCatYear(e.target.value)}
              style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
              <option value="">ทุกปี พ.ศ.</option>
              {allYears.map(y => <option key={y} value={y}>ปี {y}</option>)}
            </select>
            <SearchableSelect value={filterCatHosp} onChange={setFilterCatHosp}
              options={hospitals.map(h => ({ value: String(h.id), label: h.name }))}
              allLabel="ทุก รพ." style={{ minWidth: 200 }} />
            {(filterCatYear !== currentBEYear || filterCatHosp) && (
              <button onClick={() => { setFilterCatYear(currentBEYear); setFilterCatHosp('') }}
                style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#64748b' }}>
                ✕ ล้าง
              </button>
            )}
            <span style={{ fontSize: 12, color: '#94a3b8' }}>ข้อมูล {catTabIssues.length} รายการ</span>
          </div>
          {catTabCatRisks.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 60, textAlign: 'center', color: '#94a3b8' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 16 }}>ยังไม่มีข้อมูลปัญหา</div>
            </div>
          ) : catTabCatRisks.map(c => {
            const rl = getRiskLevel(c.score)
            const hospInCat = [...new Set(c.issues.map(i => i.hospitalId))]
            return (
              <div key={c.cat} style={{ background: '#fff', borderRadius: 12, border: `1.5px solid ${rl.border}`, overflow: 'hidden' }}>
                <div style={{ background: rl.bg, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>📂 {c.cat}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {c.issues.length} รายการ | ค้างแก้ {c.open} รายการ | {hospInCat.length} รพ.
                    </div>
                  </div>
                  <RiskBadge score={c.score} />
                  <div style={{ fontSize: 12, color: '#64748b' }}>คะแนน: <strong>{c.score.toFixed(1)}</strong></div>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  {/* Issues by severity */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                    {[
                      { label: 'ความรุนแรงสูง', count: c.issues.filter(i => i.severity === 'high').length, color: '#dc2626', bg: '#fef2f2' },
                      { label: 'ปานกลาง', count: c.issues.filter(i => i.severity === 'medium').length, color: '#d97706', bg: '#fffbeb' },
                      { label: 'ต่ำ', count: c.issues.filter(i => i.severity === 'low').length, color: '#16a34a', bg: '#f0fdf4' },
                    ].map(s => (
                      <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: '8px 16px', textAlign: 'center', minWidth: 100 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.count}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Recommendations */}
                  <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>🛡️ แนวทางป้องกันและลดความเสี่ยง</div>
                    {c.recs.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                        <span style={{ color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: 13, color: '#374151' }}>{r}</span>
                      </div>
                    ))}
                  </div>

                  {/* Hospitals affected */}
                  <div>
                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>🏥 รพ. ที่มีปัญหาประเภทนี้:</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {hospInCat.map(hid => (
                        <span key={hid} style={{ padding: '3px 10px', borderRadius: 20, background: '#eff6ff', color: '#1d4ed8', fontSize: 12, border: '1px solid #bfdbfe' }}>
                          {getHospName(hid)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tab: Executive Report ── */}
      {activeTab === 'report' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={filterReportYear} onChange={e => setFilterReportYear(e.target.value)}
              style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
              <option value="">ทุกปี พ.ศ.</option>
              {allYears.map(y => <option key={y} value={y}>ปี {y}</option>)}
            </select>
            <SearchableSelect value={filterReportHosp} onChange={setFilterReportHosp}
              options={hospitals.map(h => ({ value: String(h.id), label: h.name }))}
              allLabel="ทุก รพ." style={{ minWidth: 200 }} />
            {(filterReportYear !== currentBEYear || filterReportHosp) && (
              <button onClick={() => { setFilterReportYear(currentBEYear); setFilterReportHosp('') }}
                style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#64748b' }}>
                ✕ ล้าง
              </button>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <button onClick={handlePrint} style={{
                padding: '10px 24px', background: '#1e3a5f', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>🖨️ พิมพ์ / PDF</button>
            </div>
          </div>

          <div ref={printRef} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '32px 40px' }}>
            {/* Report header */}
            <div style={{ textAlign: 'center', marginBottom: 28, borderBottom: '2px solid #1e3a5f', paddingBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>รายงานสำหรับผู้บริหาร</div>
              <h1 style={{ fontSize: 22, color: '#1e3a5f', margin: '0 0 4px' }}>รายงานการวิเคราะห์ความเสี่ยง</h1>
              <div style={{ fontSize: 14, color: '#374151' }}>ระบบบัญชีเจ้าหนี้ – ลูกหนี้ (AP/AR) โรงพยาบาล</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>วันที่จัดทำ: {formatDate()}</div>
            </div>

            {/* 1. สรุปภาพรวม */}
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, color: '#1e3a5f', borderBottom: '2px solid #e2e8f0', paddingBottom: 8, marginBottom: 14 }}>
                1. สรุปภาพรวมความเสี่ยง
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'รพ. ทั้งหมด', value: filterReportHosp ? 1 : hospitals.length, color: '#1e3a5f' },
                  { label: 'ปัญหาทั้งหมด', value: reportIssues.length, color: '#374151' },
                  { label: 'ยังไม่แก้ไข', value: reportIssues.filter(i => i.status !== 'closed').length, color: '#dc2626' },
                  { label: 'รพ. ความเสี่ยงสูง', value: reportHospRisksVisible.filter(h => h.score >= 4).length, color: '#ea580c' },
                ].map(s => (
                  <div key={s.label} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#1e3a5f' }}>
                    {['ระดับความเสี่ยง', 'เกณฑ์คะแนน', 'จำนวน รพ.', 'ความหมาย'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', color: '#fff', fontWeight: 700, textAlign: 'left', fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RISK_LEVEL.slice(0, 4).map((rl, i) => {
                    const cnt2 = reportHospRisksVisible.filter(h => {
                      if (i === 0) return h.score >= 8
                      if (i === 1) return h.score >= 4 && h.score < 8
                      if (i === 2) return h.score >= 2 && h.score < 4
                      return h.score > 0 && h.score < 2
                    }).length
                    const meanings = ['ต้องแก้ไขเร่งด่วน วางแผนป้องกันทันที', 'ต้องติดตามและจัดการอย่างใกล้ชิด', 'ติดตามและพัฒนาอย่างต่อเนื่อง', 'อยู่ในระดับที่ยอมรับได้ ติดตามต่อไป']
                    return (
                      <tr key={rl.label} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: rl.color }}>{rl.icon} {rl.label}</td>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>
                          {i === 0 ? '≥ 8' : i === 1 ? '4 – 7.9' : i === 2 ? '2 – 3.9' : '0.1 – 1.9'}
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 700 }}>{cnt2}</td>
                        <td style={{ padding: '8px 12px', color: '#374151', fontSize: 12 }}>{meanings[i]}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>

            {/* 2. ความเสี่ยงตาม รพ. */}
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, color: '#1e3a5f', borderBottom: '2px solid #e2e8f0', paddingBottom: 8, marginBottom: 14 }}>
                2. ระดับความเสี่ยงแต่ละโรงพยาบาล
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#1e3a5f' }}>
                    {['#', 'โรงพยาบาล', 'จังหวัด', 'ปัญหาทั้งหมด', 'ค้างแก้ไข', 'ความรุนแรงสูง', 'คะแนน', 'ระดับความเสี่ยง'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', color: '#fff', fontWeight: 700, textAlign: 'left', fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportHospRisksVisible.map((h, idx) => {
                    const rl = getRiskLevel(h.score)
                    return (
                      <tr key={h.hosp.id} style={{ background: idx % 2 === 0 ? '#f8fafc' : '#fff' }}>
                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{idx + 1}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>{h.hosp.name}</td>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{h.hosp.province}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>{h.total}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#dc2626', fontWeight: 600 }}>{h.total - h.closed}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#ea580c', fontWeight: 600 }}>{h.openHigh}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: rl.color }}>{h.score.toFixed(1)}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: rl.bg, color: rl.color, border: `1px solid ${rl.border}` }}>
                            {rl.icon} {rl.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>

            {/* 3. ความเสี่ยงตามประเภทปัญหา */}
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, color: '#1e3a5f', borderBottom: '2px solid #e2e8f0', paddingBottom: 8, marginBottom: 14 }}>
                3. การวิเคราะห์ความเสี่ยงตามประเภทปัญหาและแนวทางป้องกัน
              </h2>
              {reportCatRisks.map((c, idx) => {
                const rl = getRiskLevel(c.score)
                return (
                  <div key={c.cat} style={{ marginBottom: 20, border: `1px solid ${rl.border}`, borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: rl.bg, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', flex: 1 }}>
                        {idx + 1}. {c.cat}
                      </span>
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: 'white', color: rl.color, border: `1px solid ${rl.border}` }}>
                        {rl.icon} {rl.label} (คะแนน {c.score.toFixed(1)})
                      </span>
                    </div>
                    <div style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 24, marginBottom: 10, fontSize: 13, color: '#64748b' }}>
                        <span>ปัญหาทั้งหมด: <strong>{c.issues.length}</strong></span>
                        <span>ค้างแก้ไข: <strong style={{ color: '#dc2626' }}>{c.open}</strong></span>
                        <span>แก้ไขแล้ว: <strong style={{ color: '#16a34a' }}>{c.issues.length - c.open}</strong></span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e3a5f', marginBottom: 6 }}>แนวทางป้องกันและลดความเสี่ยง:</div>
                      {c.recs.map((r, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, paddingLeft: 8 }}>
                          <span style={{ color: '#0891b2', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                          <span style={{ fontSize: 13, color: '#374151' }}>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </section>

            {/* 4. ข้อเสนอแนะ */}
            <section style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, color: '#1e3a5f', borderBottom: '2px solid #e2e8f0', paddingBottom: 8, marginBottom: 14 }}>
                4. ข้อเสนอแนะสำหรับผู้บริหาร
              </h2>
              {[
                { icon: '🎯', title: 'มาตรการระยะสั้น (ทันที)', items: ['กำหนดผู้รับผิดชอบแก้ไขปัญหาที่ความรุนแรงสูงทุกรายการ', 'ประชุมทบทวนความคืบหน้าการแก้ไขปัญหาทุกสัปดาห์', 'ตรวจสอบให้แน่ใจว่าทุก รพ. มี Super User ประจำ'] },
                { icon: '📅', title: 'มาตรการระยะกลาง (1–3 เดือน)', items: ['จัดอบรมเพิ่มเติมเฉพาะกลุ่มสำหรับปัญหาที่พบบ่อย', 'จัดทำคู่มือการใช้งานและ FAQ เป็นภาษาไทย', 'สร้างกลไก Help Desk และช่องทางรับเรื่องร้องเรียน'] },
                { icon: '🌟', title: 'มาตรการระยะยาว (3 เดือนขึ้นไป)', items: ['ทบทวนและปรับปรุงกระบวนการ Go-Live สำหรับ รพ. ถัดไป', 'สร้างฐานความรู้ (Knowledge Base) จากบทเรียนที่ได้รับ', 'ประเมินความพึงพอใจผู้ใช้งานและวัดผลลัพธ์การติดตั้ง'] },
              ].map(s => (
                <div key={s.title} style={{ marginBottom: 14, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ background: '#f8fafc', padding: '10px 14px', fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>
                    {s.icon} {s.title}
                  </div>
                  <div style={{ padding: '10px 14px' }}>
                    {s.items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                        <span style={{ color: '#0891b2', fontWeight: 700, flexShrink: 0 }}>•</span>
                        <span style={{ fontSize: 13, color: '#374151' }}>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>
              รายงานนี้จัดทำโดยระบบวิเคราะห์ความเสี่ยงอัตโนมัติ | ระบบติดตามการติดตั้งระบบ AP/AR โรงพยาบาล
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
