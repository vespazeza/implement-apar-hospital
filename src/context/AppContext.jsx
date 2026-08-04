import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api'

const AppContext = createContext()

export const CHECKLIST_BASIC_ITEMS = [
  { id: 'b1', label: 'ข้อมูลผู้ขาย (Vendor Master)' },
  { id: 'b2', label: 'ข้อมูลลูกค้า (Customer Master)' },
  { id: 'b3', label: 'ผังบัญชี (Chart of Accounts)' },
  { id: 'b4', label: 'หน่วยงาน / ศูนย์ต้นทุน (Cost Center)' },
  { id: 'b5', label: 'เงื่อนไขการชำระเงิน (Payment Terms)' },
  { id: 'b6', label: 'ข้อมูลธนาคาร (Bank Master)' },
  { id: 'b7', label: 'ข้อมูลภาษีมูลค่าเพิ่ม (VAT Setting)' },
  { id: 'b8', label: 'ข้อมูลหัก ณ ที่จ่าย (WHT Setting)' },
  { id: 'b9', label: 'รหัสสินค้า / บริการ (Item/Service Code)' },
  { id: 'b10', label: 'ข้อมูลงบประมาณ (Budget Data)' },
]

export const CHECKLIST_FORM_ITEMS = [
  { id: 'f1', label: 'แบบฟอร์มใบสำคัญจ่าย (Payment Voucher)' },
  { id: 'f2', label: 'แบบฟอร์มใบสำคัญรับ (Receipt Voucher)' },
  { id: 'f3', label: 'แบบฟอร์มใบแจ้งหนี้ (Invoice)' },
  { id: 'f4', label: 'แบบฟอร์มใบเสร็จรับเงิน (Receipt)' },
  { id: 'f5', label: 'แบบฟอร์มใบกำกับภาษี (Tax Invoice)' },
  { id: 'f6', label: 'แบบฟอร์มหนังสือรับรองหัก ณ ที่จ่าย (WHT Certificate)' },
  { id: 'f7', label: 'แบบฟอร์มใบสั่งซื้อ (Purchase Order)' },
  { id: 'f8', label: 'แบบฟอร์มใบรับสินค้า (Goods Receipt)' },
  { id: 'f9', label: 'แบบฟอร์มใบขอซื้อ (Purchase Request)' },
  { id: 'f10', label: 'แบบฟอร์มใบหักบัญชี / ใบลดหนี้ (Debit/Credit Note)' },
]

export const CHECKLIST_REPORT_ITEMS = [
  { id: 'r1', label: 'รายงานเจ้าหนี้คงเหลือ (AP Balance Report)' },
  { id: 'r2', label: 'รายงานลูกหนี้คงเหลือ (AR Balance Report)' },
  { id: 'r3', label: 'รายงานอายุหนี้เจ้าหนี้ (AP Aging Report)' },
  { id: 'r4', label: 'รายงานอายุหนี้ลูกหนี้ (AR Aging Report)' },
  { id: 'r5', label: 'รายงานการจ่ายชำระ (Payment Report)' },
  { id: 'r6', label: 'รายงานการรับชำระ (Collection Report)' },
  { id: 'r7', label: 'รายงานภาษีซื้อ (Input Tax Report)' },
  { id: 'r8', label: 'รายงานภาษีขาย (Output Tax Report)' },
  { id: 'r9', label: 'รายงานหัก ณ ที่จ่าย (WHT Report)' },
  { id: 'r10', label: 'รายงานกระแสเงินสด (Cash Flow Report)' },
]

export const ADVANCE_ITEMS = [
  { id: 'a1', label: 'ติดตั้งโปรแกรม (Program Installation)' },
  { id: 'a2', label: 'ตั้งค่าระบบเครือข่าย (Network Configuration)' },
  { id: 'a3', label: 'ตั้งค่า Server (Server Configuration)' },
  { id: 'a4', label: 'ทดสอบการเชื่อมต่อฐานข้อมูล (DB Connection Test)' },
  { id: 'a5', label: 'ตั้งค่าผู้ใช้งานในระบบ (User Account Setup)' },
  { id: 'a6', label: 'กำหนดสิทธิ์การเข้าถึง (Access Rights)' },
  { id: 'a7', label: 'ทดสอบ Interface เชื่อมต่อระบบ (Interface Testing)' },
  { id: 'a8', label: 'ทดสอบ Backup และ Recovery (Backup/Recovery Test)' },
  { id: 'a9', label: 'ทดสอบ Performance (Performance Test)' },
  { id: 'a10', label: 'ทำ UAT (User Acceptance Test)' },
]

export function AppProvider({ children }) {
  const [hospitals, setHospitals] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [projectPlans, setProjectPlans] = useState([])
  const [checklistBasic, setChecklistBasic] = useState({})
  const [checklistForm, setChecklistForm] = useState({})
  const [checklistReport, setChecklistReport] = useState({})
  const [advanceData, setAdvanceData] = useState({})
  const [trainingIssues, setTrainingIssues] = useState([])
  const [systemIssues, setSystemIssues] = useState([])
  const [receivedIssues, setReceivedIssues] = useState([])
  const [basicMasterItems, setBasicMasterItems] = useState([])
  const [formMasterItems, setFormMasterItems] = useState([])
  const [reportMasterItems, setReportMasterItems] = useState([])
  const [basicEntriesSummary, setBasicEntriesSummary] = useState([])
  const [formEntriesSummary, setFormEntriesSummary] = useState([])
  const [reportEntriesSummary, setReportEntriesSummary] = useState([])
  const [advanceRecords, setAdvanceRecords] = useState([])
  const [masterplanSummary, setMasterplanSummary] = useState([])
  const [loading, setLoading] = useState(true)

  // ── โหลดข้อมูลจาก API เมื่อเริ่ม ──────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/hospitals'),
      api.get('/team'),
      api.get('/plans'),
      api.get('/checklist'),
      api.get('/training-issues'),
      api.get('/system-issues'),
      api.get('/received-issues'),
      api.get('/basic-master'),
      api.get('/basic-entries/summary'),
      api.get('/form-master'),
      api.get('/form-entries/summary'),
      api.get('/report-master'),
      api.get('/report-entries/summary'),
      api.get('/advance-records'),
      api.get('/masterplan-items/summary'),
    ]).then(([hosps, team, plans, chk, training, system, received, basicMaster, basicSummary, formMaster, formSummary, reportMaster, reportSummary, advRecs, mpSummary]) => {
      setHospitals(hosps)
      setTeamMembers(team)
      setProjectPlans(plans)
      setChecklistBasic(chk.basic || {})
      setChecklistForm(chk.form || {})
      setChecklistReport(chk.report || {})
      setAdvanceData(chk.advance || {})
      setTrainingIssues(training)
      setSystemIssues(system)
      setReceivedIssues(Array.isArray(received) ? received : [])
      setBasicMasterItems(basicMaster)
      setBasicEntriesSummary(Array.isArray(basicSummary) ? basicSummary : [])
      setFormMasterItems(Array.isArray(formMaster) ? formMaster : [])
      setFormEntriesSummary(Array.isArray(formSummary) ? formSummary : [])
      setReportMasterItems(Array.isArray(reportMaster) ? reportMaster : [])
      setReportEntriesSummary(Array.isArray(reportSummary) ? reportSummary : [])
      setAdvanceRecords(Array.isArray(advRecs) ? advRecs : [])
      setMasterplanSummary(Array.isArray(mpSummary) ? mpSummary : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // รีโหลด basicEntriesSummary (เรียกหลัง import/update entry)
  const refreshBasicSummary = async () => {
    try {
      const data = await api.get('/basic-entries/summary')
      setBasicEntriesSummary(Array.isArray(data) ? data : [])
    } catch { /* ignore */ }
  }

  // รีโหลด reportEntriesSummary
  const refreshReportSummary = async () => {
    try {
      const data = await api.get('/report-entries/summary')
      setReportEntriesSummary(Array.isArray(data) ? data : [])
    } catch { /* ignore */ }
  }

  // รีโหลด masterplanSummary (เรียกหลังบันทึก masterplan items)
  const refreshMasterplanSummary = async () => {
    try {
      const data = await api.get('/masterplan-items/summary')
      setMasterplanSummary(Array.isArray(data) ? data : [])
    } catch { /* ignore */ }
  }

  // ── Hospitals CRUD ─────────────────────────────────────────────────────────
  const addHospital = async (form) => {
    const res = await api.post('/hospitals', form)
    setHospitals(prev => [...prev, res])
    return res
  }
  const updateHospital = async (id, form) => {
    const res = await api.put(`/hospitals/${id}`, form)
    setHospitals(prev => prev.map(h => h.id === id ? res : h))
    return res
  }
  const deleteHospital = async (id) => {
    await api.del(`/hospitals/${id}`)
    setHospitals(prev => prev.filter(h => h.id !== id))
  }

  // ── Team CRUD ──────────────────────────────────────────────────────────────
  const addTeamMember = async (form) => {
    const res = await api.post('/team', form)
    setTeamMembers(prev => [...prev, res])
    return res
  }
  const updateTeamMember = async (id, form) => {
    const res = await api.put(`/team/${id}`, form)
    setTeamMembers(prev => prev.map(m => m.id === id ? res : m))
    return res
  }
  const deleteTeamMember = async (id) => {
    await api.del(`/team/${id}`)
    setTeamMembers(prev => prev.filter(m => m.id !== id))
  }

  // ── Plans CRUD ─────────────────────────────────────────────────────────────
  const addPlan = async (form) => {
    await api.post('/plans', form)
    const data = await api.get('/plans')
    setProjectPlans(data)
  }
  const updatePlan = async (id, form) => {
    await api.put(`/plans/${id}`, form)
    const data = await api.get('/plans')
    setProjectPlans(data)
  }
  const deletePlan = async (id) => {
    await api.del(`/plans/${id}`)
    setProjectPlans(prev => prev.filter(p => p.id !== id))
  }

  // ── Basic Master CRUD ──────────────────────────────────────────────────────
  const addBasicMaster = async (form) => {
    const res = await api.post('/basic-master', form)
    setBasicMasterItems(prev => [...prev, res])
    return res
  }
  const updateBasicMaster = async (id, form) => {
    const res = await api.put(`/basic-master/${id}`, form)
    setBasicMasterItems(prev => prev.map(i => i.id === id ? res : i))
    return res
  }
  const deleteBasicMaster = async (id) => {
    await api.del(`/basic-master/${id}`)
    setBasicMasterItems(prev => prev.filter(i => i.id !== id))
  }

  // ── Report Master CRUD ─────────────────────────────────────────────────────
  const addReportMaster = async (form) => {
    const res = await api.post('/report-master', form)
    setReportMasterItems(prev => [...prev, res])
    return res
  }
  const updateReportMaster = async (id, form) => {
    const res = await api.put(`/report-master/${id}`, form)
    setReportMasterItems(prev => prev.map(i => i.id === id ? res : i))
    return res
  }
  const deleteReportMaster = async (id) => {
    await api.del(`/report-master/${id}`)
    setReportMasterItems(prev => prev.filter(i => i.id !== id))
  }

  // ── Form Master CRUD ───────────────────────────────────────────────────────
  const addFormMaster = async (form) => {
    const res = await api.post('/form-master', form)
    setFormMasterItems(prev => [...prev, res])
    return res
  }
  const updateFormMaster = async (id, form) => {
    const res = await api.put(`/form-master/${id}`, form)
    setFormMasterItems(prev => prev.map(i => i.id === id ? res : i))
    return res
  }
  const deleteFormMaster = async (id) => {
    await api.del(`/form-master/${id}`)
    setFormMasterItems(prev => prev.filter(i => i.id !== id))
  }

  // ── Training Issues CRUD ───────────────────────────────────────────────────
  const addTrainingIssue = async (form) => {
    const res = await api.post('/training-issues', form)
    setTrainingIssues(prev => [res, ...prev])
    return res
  }
  const updateTrainingIssue = async (id, form) => {
    const res = await api.put(`/training-issues/${id}`, form)
    setTrainingIssues(prev => prev.map(i => i.id === id ? res : i))
    return res
  }
  const deleteTrainingIssue = async (id) => {
    await api.del(`/training-issues/${id}`)
    setTrainingIssues(prev => prev.filter(i => i.id !== id))
  }

  // ── System Issues CRUD ─────────────────────────────────────────────────────
  const addSystemIssue = async (form) => {
    const res = await api.post('/system-issues', form)
    setSystemIssues(prev => [res, ...prev])
    return res
  }
  const updateSystemIssue = async (id, form) => {
    const res = await api.put(`/system-issues/${id}`, form)
    setSystemIssues(prev => prev.map(i => i.id === id ? res : i))
    return res
  }
  const deleteSystemIssue = async (id) => {
    await api.del(`/system-issues/${id}`)
    setSystemIssues(prev => prev.filter(i => i.id !== id))
  }

  // ── Received Issues CRUD ───────────────────────────────────────────────────
  const addReceivedIssue = async (form) => {
    const res = await api.post('/received-issues', form)
    setReceivedIssues(prev => [res, ...prev])
    return res
  }
  const updateReceivedIssue = async (id, form) => {
    const res = await api.put(`/received-issues/${id}`, form)
    setReceivedIssues(prev => prev.map(i => i.id === id ? res : i))
    return res
  }
  const deleteReceivedIssue = async (id) => {
    await api.del(`/received-issues/${id}`)
    setReceivedIssues(prev => prev.filter(i => i.id !== id))
  }

  // ── Checklist ──────────────────────────────────────────────────────────────
  const updateChecklistItem = (type, hospitalId, itemId, data) => {
    api.put(`/checklist/${type}/${hospitalId}/${itemId}`, data)
    const setters = {
      basic: setChecklistBasic, form: setChecklistForm,
      report: setChecklistReport, advance: setAdvanceData,
    }
    setters[type](prev => ({
      ...prev,
      [hospitalId]: { ...(prev[hospitalId] || {}), [itemId]: data }
    }))
  }

  const getChecklistData = (type, hospitalId) => {
    const maps = { basic: checklistBasic, form: checklistForm, report: checklistReport, advance: advanceData }
    return maps[type]?.[hospitalId] || {}
  }

  const getProgress = (type, hospitalId) => {
    // ข้อมูลพื้นฐาน: คำนวณจาก basic_checklist_entries (status='done')
    if (type === 'basic') {
      const row = basicEntriesSummary.find(s => s.hospitalId === String(hospitalId))
      if (!row || row.total === 0) return { checked: 0, total: 0, pct: 0 }
      return { checked: row.done, total: row.total, pct: Math.round((row.done / row.total) * 100) }
    }
    // แบบฟอร์ม: คำนวณจาก form_checklist_entries (status='done')
    if (type === 'form') {
      const row = formEntriesSummary.find(s => s.hospitalId === String(hospitalId))
      if (!row || row.total === 0) return { checked: 0, total: 0, pct: 0 }
      return { checked: row.done, total: row.total, pct: Math.round((row.done / row.total) * 100) }
    }
    // รายงาน: คำนวณจาก report_checklist_entries (status='done')
    if (type === 'report') {
      const row = reportEntriesSummary.find(s => s.hospitalId === String(hospitalId))
      if (!row || row.total === 0) return { checked: 0, total: 0, pct: 0 }
      return { checked: row.done, total: row.total, pct: Math.round((row.done / row.total) * 100) }
    }
    // แผนปฏิบัติงาน: คำนวณจาก masterplan_items (status='done')
    if (type === 'masterplan') {
      const row = masterplanSummary.find(s => s.hospitalId === String(hospitalId))
      if (!row || row.total === 0) return { checked: 0, total: 0, pct: 0 }
      return { checked: row.done, total: row.total, pct: Math.round((row.done / row.total) * 100) }
    }
    const maps = {
      advance: { data: advanceData, items: ADVANCE_ITEMS },
    }
    const { data, items } = maps[type]
    const hosp = data[hospitalId] || {}
    const total = items.length
    if (total === 0) return { checked: 0, total: 0, pct: 0 }
    const checked = items.filter(i => hosp[i.id]?.checked).length
    return { checked, total, pct: Math.round((checked / total) * 100) }
  }

  return (
    <AppContext.Provider value={{
      hospitals, teamMembers, projectPlans,
      checklistBasic, checklistForm, checklistReport, advanceData, advanceRecords,
      trainingIssues, systemIssues, receivedIssues, basicMasterItems, formMasterItems, reportMasterItems,
      basicEntriesSummary, formEntriesSummary, reportEntriesSummary, masterplanSummary, loading,
      refreshBasicSummary, refreshReportSummary, refreshMasterplanSummary,
      // Report Master
      addReportMaster, updateReportMaster, deleteReportMaster,
      // Form Master
      addFormMaster, updateFormMaster, deleteFormMaster,
      // Hospital
      addHospital, updateHospital, deleteHospital, setHospitals,
      // Team
      addTeamMember, updateTeamMember, deleteTeamMember,
      // Plans
      addPlan, updatePlan, deletePlan,
      // Basic Master
      addBasicMaster, updateBasicMaster, deleteBasicMaster,
      // Training
      addTrainingIssue, updateTrainingIssue, deleteTrainingIssue,
      // System
      addSystemIssue, updateSystemIssue, deleteSystemIssue,
      // Received Issues
      addReceivedIssue, updateReceivedIssue, deleteReceivedIssue,
      // Checklist
      updateChecklistItem, getChecklistData, getProgress,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}