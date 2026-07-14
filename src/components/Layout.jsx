import { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'

const MENU = [
  { path: '/dashboard', icon: '📊', label: 'Dashboard', sub: 'ภาพรวมทั้งระบบ' },
  { path: '/hospitals', icon: '🏥', label: 'โรงพยาบาล', sub: 'จัดการข้อมูล รพ.' },
  { path: '/team', icon: '👥', label: 'ทีมงาน', sub: 'จัดการสมาชิก' },
  { path: '/workplan', icon: '📋', label: 'แผนการปฏิบัติงาน', sub: 'แผน + ความคืบหน้า' },
  { path: '/calendar', icon: '📅', label: 'ปฏิทินปฏิบัติงาน', sub: '' },
  { path: '/advance', icon: '⚙️', label: 'Advance', sub: 'เตรียมความพร้อม' },
  {
    group: true, icon: '✅', label: 'Check List', sub: 'ตรวจสอบรายการ',
    children: [
      { path: '/checklist-basic', icon: '🗂️', label: 'ข้อมูลพื้นฐาน', sub: '' },
      { path: '/checklist-form', icon: '📄', label: 'แบบฟอร์ม', sub: '' },
      { path: '/checklist-report', icon: '📈', label: 'รายงาน', sub: '' },
    ],
  },
  {
    group: true, icon: '🐛', label: 'Issue', sub: 'สรุปปัญหา',
    children: [
      { path: '/training-issues', icon: '🎓', label: 'สรุปปัญหาอบรม', sub: '' },
      { path: '/system-issues', icon: '🖥️', label: 'สรุปปัญหาขึ้นระบบ', sub: '' },
    ],
  },
  { path: '/risk-analysis', icon: '⚠️', label: 'วิเคราะห์ความเสี่ยง', sub: 'รายงานผู้บริหาร' },
  { path: '/lessons-learned', icon: '📚', label: 'สรุปบทเรียน', sub: 'ถอดบทเรียนการติดตั้ง' },
  { path: '/holiday', icon: '🗓️', label: 'จัดการวันหยุด', sub: 'Holiday Management' },
  { path: '/standby-calendar', icon: '🗓️', label: 'ตาราง Stand By', sub: 'Stand By Schedule' },
  { path: '/doc-tracking', icon: '📬', label: 'ติดตามการส่งเอกสาร', sub: 'Document Tracking' },
]

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')
  const [collapsed, setCollapsed] = useState(false)

  // Auto-expand groups that contain the active route
  const isGroupActive = (item) => item.children?.some(c => location.pathname.startsWith(c.path))
  const [openGroups, setOpenGroups] = useState(() => {
    const init = {}
    MENU.forEach(item => { if (item.group && item.children?.some(c => location.pathname.startsWith(c.path))) init[item.label] = true })
    return init
  })

  const toggleGroup = (label) => setOpenGroups(p => ({ ...p, [label]: !p[label] }))

  const handleLogout = () => {
    localStorage.removeItem('currentUser')
    navigate('/login')
  }

  const sidebarWidth = collapsed ? 64 : 240

  const navItemStyle = (isActive) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 14px', borderRadius: 8, marginBottom: 3,
    textDecoration: 'none',
    background: isActive ? 'rgba(8,145,178,0.3)' : 'transparent',
    borderLeft: isActive ? '3px solid #0891b2' : '3px solid transparent',
    transition: 'all 0.15s',
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f0f4f8' }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarWidth,
        background: 'linear-gradient(180deg, #1a2d4a 0%, #1e3a5f 100%)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.25s', overflow: 'hidden', flexShrink: 0,
        position: 'fixed', top: 0, left: 0, height: '100vh',
        zIndex: 100, boxShadow: '4px 0 16px rgba(0,0,0,0.2)',
      }}>
        {/* Brand */}
        <div style={{
          padding: collapsed ? '20px 16px' : '20px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', gap: 12, minHeight: 72,
        }}>
          <div style={{
            width: 36, height: 36, minWidth: 36,
            background: 'linear-gradient(135deg, #0891b2, #38bdf8)',
            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>🛠️</div>
          {!collapsed && (
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>AP/AR Tracker</div>
              <div style={{ color: '#94a3b8', fontSize: 11 }}>Implementation</div>
              <div style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>version : V2</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          {MENU.map((item) => {
            if (item.group) {
              const active = isGroupActive(item)
              const open = openGroups[item.label]
              return (
                <div key={item.label}>
                  {/* Group header */}
                  <button onClick={() => !collapsed && toggleGroup(item.label)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 14px', borderRadius: 8, marginBottom: 3,
                    background: active ? 'rgba(8,145,178,0.2)' : 'transparent',
                    borderLeft: active ? '3px solid #0891b2' : '3px solid transparent',
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    textAlign: 'left',
                  }}>
                    <span style={{ fontSize: 18, minWidth: 24, textAlign: 'center' }}>{item.icon}</span>
                    {!collapsed && (
                      <>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{item.label}</div>
                          {item.sub && <div style={{ color: '#64748b', fontSize: 11 }}>{item.sub}</div>}
                        </div>
                        <span style={{ color: '#64748b', fontSize: 11, transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
                      </>
                    )}
                  </button>

                  {/* Children */}
                  {!collapsed && open && (
                    <div style={{ marginLeft: 14, marginBottom: 4, borderLeft: '2px solid rgba(8,145,178,0.3)', paddingLeft: 6 }}>
                      {item.children.map(child => (
                        <NavLink key={child.path} to={child.path} style={({ isActive }) => ({
                          ...navItemStyle(isActive),
                          padding: '9px 12px', marginBottom: 2,
                        })}>
                          <span style={{ fontSize: 16, minWidth: 22, textAlign: 'center' }}>{child.icon}</span>
                          <div>
                            <div style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{child.label}</div>
                            {child.sub && <div style={{ color: '#64748b', fontSize: 10 }}>{child.sub}</div>}
                          </div>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <NavLink key={item.path} to={item.path} style={({ isActive }) => navItemStyle(isActive)}>
                <span style={{ fontSize: 18, minWidth: 24, textAlign: 'center' }}>{item.icon}</span>
                {!collapsed && (
                  <div>
                    <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{item.label}</div>
                    {item.sub && <div style={{ color: '#64748b', fontSize: 11 }}>{item.sub}</div>}
                  </div>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User + Logout */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {!collapsed && (
            <div style={{ padding: '8px 14px', marginBottom: 8 }}>
              <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 2 }}>ผู้ใช้งาน</div>
              <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser.name || currentUser.username}
              </div>
            </div>
          )}
          <button onClick={handleLogout} style={{
            width: '100%', padding: '9px 14px',
            background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)',
            borderRadius: 8, color: '#fca5a5', fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 8,
          }}>
            <span>🚪</span>
            {!collapsed && <span>ออกจากระบบ</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ marginLeft: sidebarWidth, flex: 1, transition: 'margin-left 0.25s', minWidth: 0 }}>
        {/* Header */}
        <header style={{
          background: '#fff', borderBottom: '1px solid #e2e8f0',
          padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 12,
          position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}>
          <button onClick={() => setCollapsed(p => !p)} style={{
            background: 'none', border: 'none', padding: 6, borderRadius: 6,
            cursor: 'pointer', fontSize: 18, color: '#64748b', lineHeight: 1,
          }}>☰</button>
          <div style={{ flex: 1 }}>
            <span style={{ color: '#1e3a5f', fontWeight: 700, fontSize: 13 }}>ระบบติดตามการติดตั้ง AP/AR</span>
            <span style={{ color: '#64748b', fontSize: 13 }}> | AP/AR Implementation Tracker</span>
          </div>
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe',
            borderRadius: 20, padding: '4px 14px', fontSize: 13, color: '#1e40af', fontWeight: 600,
          }}>
            👤 {currentUser.name || currentUser.username}
          </div>
        </header>

        {/* Content */}
        <main style={{ padding: 24, minHeight: 'calc(100vh - 56px)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
