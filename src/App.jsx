import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import WorkPlan from './pages/WorkPlan'
import Advance from './pages/Advance'
import ChecklistBasic from './pages/ChecklistBasic'
import ChecklistForm from './pages/ChecklistForm'
import ChecklistReport from './pages/ChecklistReport'
import TrainingSummary from './pages/TrainingSummary'
import SystemSummary from './pages/SystemSummary'
import ReceivedIssues from './pages/ReceivedIssues'
import RiskAnalysis from './pages/RiskAnalysis'
import LessonsLearned from './pages/LessonsLearned'
import Calendar from './pages/Calendar'
import Hospitals from './pages/Hospitals'
import Team from './pages/Team'
import HolidayManagement from './pages/HolidayManagement'
import StandByCalendar from './pages/StandByCalendar'
import DocTracking from './pages/DocTracking'

function PrivateRoute({ children }) {
  const user = localStorage.getItem('currentUser')
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="hospitals" element={<Hospitals />} />
            <Route path="team" element={<Team />} />
            <Route path="summary" element={<Navigate to="/workplan" replace />} />
            <Route path="workplan" element={<WorkPlan />} />
            <Route path="advance" element={<Advance />} />
            <Route path="checklist-basic" element={<ChecklistBasic />} />
            <Route path="checklist-form" element={<ChecklistForm />} />
            <Route path="checklist-report" element={<ChecklistReport />} />
            <Route path="training-issues" element={<TrainingSummary />} />
            <Route path="standby-calendar" element={<StandByCalendar />} />
            <Route path="doc-tracking" element={<DocTracking />} />
            <Route path="system-issues" element={<SystemSummary />} />
            <Route path="received-issues" element={<ReceivedIssues />} />
            <Route path="risk-analysis" element={<RiskAnalysis />} />
            <Route path="lessons-learned" element={<LessonsLearned />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="holiday" element={<HolidayManagement />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
