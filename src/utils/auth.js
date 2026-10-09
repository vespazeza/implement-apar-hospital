export const getCurrentUser = () => {
  try { return JSON.parse(localStorage.getItem('currentUser') || '{}') } catch { return {} }
}
export const isViewer = () => getCurrentUser().role === 'viewer'
