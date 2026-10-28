import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  Users, CalendarCheck, ClipboardList, Megaphone,
  GraduationCap, LogOut, Clock3, RefreshCw, Plus,
  Check, X, LayoutDashboard, BarChart3, Bell
} from 'lucide-react'

const API =
  import.meta.env.VITE_API_URL ||
  'http://127.0.0.1:5000/api'

const modules = [
  { name: 'Overview', icon: LayoutDashboard },
  { name: 'Employees', icon: Users },
  { name: 'Attendance', icon: CalendarCheck },
  { name: 'Leave Requests', icon: ClipboardList },
  { name: 'Announcements', icon: Megaphone },
  { name: 'Training', icon: GraduationCap },
  { name: 'Reports & Analytics', icon: BarChart3 },
  { name: 'Notifications', icon: Bell },
]

function api(token) {
  return axios.create({
    baseURL: API,
    headers: token
      ? { Authorization: `Bearer ${token}` }
      : {},
  })
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString() : '—'
}

function escapeCsv(value) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename

  document.body.appendChild(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(url)
}

function exportRows(rows, filename, format) {
  if (!rows.length) return false

  const headers = Object.keys(rows[0])

  if (format === 'csv') {
    const csv =
      '\uFEFF' +
      [headers, ...rows.map(row =>
        headers.map(header => row[header])
      )]
        .map(row => row.map(escapeCsv).join(','))
        .join('\r\n')

    downloadBlob(
      csv,
      `${filename}.csv`,
      'text/csv;charset=utf-8;'
    )

    return true
  }

  const htmlEscape = value =>
    String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const table = `
    <table>
      <thead>
        <tr>
          ${headers.map(h =>
            `<th>${htmlEscape(h)}</th>`
          ).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(row =>
          `<tr>${headers.map(h =>
            `<td>${htmlEscape(row[h])}</td>`
          ).join('')}</tr>`
        ).join('')}
      </tbody>
    </table>
  `

  const documentText =
    `\uFEFF<html><head><meta charset="utf-8"></head>` +
    `<body>${table}</body></html>`

  downloadBlob(
    documentText,
    `${filename}.xls`,
    'application/vnd.ms-excel;charset=utf-8;'
  )

  return true
}

function App() {
  const [token, setToken] = useState(
    localStorage.getItem('staffsync_token') || ''
  )

  const [user, setUser] = useState(
    JSON.parse(
      localStorage.getItem('staffsync_user') || 'null'
    )
  )

  const [mode, setMode] = useState('login')
  const [page, setPage] = useState('Overview')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [health, setHealth] = useState('Checking API…')

  const [summary, setSummary] = useState({})
  const [employees, setEmployees] = useState([])
  const [attendance, setAttendance] = useState([])
  const [leaves, setLeaves] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [trainings, setTrainings] = useState([])

  // Notification state
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'employee',
    department: 'General',
  })

  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    email: '',
    password: 'Welcome123!',
    role: 'employee',
    department: 'General',
  })

  const [leaveForm, setLeaveForm] = useState({
    startDate: '',
    endDate: '',
    reason: '',
  })

  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    body: '',
  })

  const [trainingForm, setTrainingForm] = useState({
    title: '',
    description: '',
    trainer: '',
    startDate: '',
    endDate: '',
  })

  const [search, setSearch] = useState('')

  const client = useMemo(() => api(token), [token])

  async function loadAll() {
    if (!token) return

    try {
      const results = await Promise.all([
        client.get('/dashboard/summary')
          .catch(() => ({ data: { summary: {} } })),

        client.get('/attendance')
          .catch(() => ({ data: { attendance: [] } })),

        client.get('/leaves')
          .catch(() => ({ data: { leaves: [] } })),

        client.get('/announcements')
          .catch(() => ({ data: { announcements: [] } })),

        user?.role === 'hr'
          ? client.get('/employees')
              .catch(() => ({ data: { employees: [] } }))
          : Promise.resolve({ data: { employees: [] } }),

        client.get('/trainings')
          .catch(() => ({ data: { trainings: [] } })),

        client.get('/notifications')
          .catch(() => ({
            data: {
              notifications: [],
              unreadCount: 0,
            },
          })),
      ])

      setSummary(results[0].data.summary || {})
      setAttendance(results[1].data.attendance || [])
      setLeaves(results[2].data.leaves || [])
      setAnnouncements(results[3].data.announcements || [])
      setEmployees(results[4].data.employees || [])
      setTrainings(results[5].data.trainings || [])

      setNotifications(
        results[6].data.notifications || []
      )

      setUnreadCount(
        results[6].data.unreadCount || 0
      )
    } catch (e) {
      setError(
        e.response?.data?.message ||
        'Could not load workspace data'
      )
    }
  }

  useEffect(() => {
    axios.get(`${API}/health`)
      .then(r => setHealth(r.data.message))
      .catch(() => setHealth('API not reachable'))
  }, [])

  useEffect(() => {
    loadAll()
  }, [token, user?.role])

  function showError(e) {
    setError(
      e.response?.data?.message ||
      e.message ||
      'Something went wrong'
    )
    setNotice('')
  }

  function showNotice(message) {
    setNotice(message)
    setError('')
  }

  async function submitAuth(e) {
    e.preventDefault()
    setBusy(true)
    setError('')

    try {
      const endpoint =
        mode === 'login'
          ? '/auth/login'
          : '/auth/register'

      const payload =
        mode === 'login'
          ? {
              email: authForm.email,
              password: authForm.password,
            }
          : authForm

      const { data } = await axios.post(
        `${API}${endpoint}`,
        payload
      )

      localStorage.setItem(
        'staffsync_token',
        data.token
      )

      localStorage.setItem(
        'staffsync_user',
        JSON.stringify(data.user)
      )

      setToken(data.token)
      setUser(data.user)
      setPage('Overview')
      showNotice(`Welcome, ${data.user.name}`)
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  function logout() {
    localStorage.removeItem('staffsync_token')
    localStorage.removeItem('staffsync_user')

    setToken('')
    setUser(null)
    setPage('Overview')
    setNotice('Signed out')
  }

  async function action(fn, success) {
    setBusy(true)
    setError('')
    setNotice('')

    try {
      await fn()
      await loadAll()
      showNotice(success)
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }

  // Notification functions
  async function loadNotifications() {
    try {
      const { data } = await client.get('/notifications')

      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    } catch (e) {
      showError(e)
    }
  }

  async function markNotificationRead(id) {
    await action(
      () => client.patch(`/notifications/${id}/read`),
      'Notification marked as read'
    )
  }

  async function markAllNotificationsRead() {
    await action(
      () => client.patch('/notifications/read-all'),
      'All notifications marked as read'
    )
  }

  async function checkIn() {
    await action(
      () => client.post('/attendance/check-in'),
      'Checked in successfully'
    )
  }

  async function checkOut() {
    await action(
      () => client.post('/attendance/check-out'),
      'Checked out successfully'
    )
  }

  async function createLeave(e) {
    e.preventDefault()

    await action(async () => {
      await client.post('/leaves', leaveForm)
      setLeaveForm({
        startDate: '',
        endDate: '',
        reason: '',
      })
    }, 'Leave request submitted')
  }

  async function decideLeave(id, status) {
    await action(
      () => client.patch(`/leaves/${id}/decision`, { status }),
      `Leave ${status}`
    )
  }

  async function createAnnouncement(e) {
    e.preventDefault()

    await action(async () => {
      await client.post('/announcements', announcementForm)
      setAnnouncementForm({ title: '', body: '' })
    }, 'Announcement published')
  }

  async function createEmployee(e) {
    e.preventDefault()

    await action(async () => {
      await client.post('/employees', employeeForm)

      setEmployeeForm({
        name: '',
        email: '',
        password: 'Welcome123!',
        role: 'employee',
        department: 'General',
      })
    }, 'Employee account created')
  }

  async function createTraining(e) {
    e.preventDefault()

    await action(async () => {
      await client.post('/trainings', trainingForm)

      setTrainingForm({
        title: '',
        description: '',
        trainer: '',
        startDate: '',
        endDate: '',
      })
    }, 'Training program created')
  }

  async function enrollTraining(id) {
    await action(
      () => client.post(`/trainings/${id}/enroll`),
      'Successfully enrolled in training'
    )
  }

  async function completeTraining(id, userId) {
    await action(
      () => client.patch(
        `/trainings/${id}/complete/${userId}`
      ),
      'Participant marked as completed'
    )
  }

  function getExportRows(type) {
    if (type === 'attendance') {
      return attendance.map(a => ({
        ...(user.role === 'hr'
          ? {
              Employee: a.userId?.name || 'Employee',
              Email: a.userId?.email || '',
            }
          : {}),
        'Work Date': a.workDate || '',
        'Check In': a.checkIn
          ? new Date(a.checkIn).toLocaleString()
          : '',
        'Check Out': a.checkOut
          ? new Date(a.checkOut).toLocaleString()
          : '',
        'Hours Worked': a.checkIn && a.checkOut
          ? (
              (new Date(a.checkOut) -
                new Date(a.checkIn)) / 3600000
            ).toFixed(2)
          : '',
      }))
    }

    if (type === 'leaves') {
      return leaves.map(l => ({
        ...(user.role !== 'employee'
          ? {
              Employee: l.userId?.name || 'Employee',
              Email: l.userId?.email || '',
            }
          : {}),
        'Start Date': l.startDate || '',
        'End Date': l.endDate || '',
        Reason: l.reason || '',
        Status: l.status || '',
        'Review Note': l.reviewNote || '',
      }))
    }

    if (type === 'training') {
      return trainings.map(t => ({
        'Training Program': t.title || '',
        Description: t.description || '',
        Trainer: t.trainer || '',
        'Start Date': t.startDate
          ? new Date(t.startDate).toLocaleDateString()
          : '',
        'End Date': t.endDate
          ? new Date(t.endDate).toLocaleDateString()
          : '',
        Enrolled: (t.enrollments || []).length,
        Completed: (t.enrollments || [])
          .filter(en => en.status === 'completed').length,
      }))
    }

    if (type === 'employees' && user.role === 'hr') {
      return employees.map(e => ({
        Name: e.name || '',
        Email: e.email || '',
        Department: e.department || 'General',
        Role: e.role || '',
        Status: e.isActive === false ? 'Inactive' : 'Active',
      }))
    }

    return []
  }

  function handleReportExport(type, format) {
    const rows = getExportRows(type)

    if (!rows.length) {
      showError({
        message: 'There is no data to export for this report yet.',
      })
      return
    }

    const ok = exportRows(
      rows,
      `staffsync_${type}_report_${new Date().toISOString().slice(0, 10)}`,
      format
    )

    if (ok) {
      showNotice(
        `${type[0].toUpperCase() + type.slice(1)} report exported as ${format.toUpperCase()}.`
      )
    }
  }

  const filteredEmployees = employees.filter(e =>
    `${e.name} ${e.email} ${e.department} ${e.role}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  if (!token || !user) {
    return (
      <div className="auth-shell">
        <div className="auth-brand">Staff<span>Sync</span></div>
        <p className="muted">Human resources, in sync.</p>

        <form className="auth-card" onSubmit={submitAuth}>
          <div className="eyebrow">WORKFORCE MANAGEMENT</div>
          <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="muted">
            {mode === 'login'
              ? 'Sign in to your StaffSync workspace.'
              : 'Create a demo account to get started.'}
          </p>

          {mode !== 'login' && (
            <>
              <label>
                Full name
                <input
                  required
                  value={authForm.name}
                  onChange={e => setAuthForm({
                    ...authForm,
                    name: e.target.value,
                  })}
                  placeholder="Your name"
                />
              </label>

              <label>
                Department
                <input
                  value={authForm.department}
                  onChange={e => setAuthForm({
                    ...authForm,
                    department: e.target.value,
                  })}
                  placeholder="Engineering"
                />
              </label>

              <label>
                Demo role
                <select
                  value={authForm.role}
                  onChange={e => setAuthForm({
                    ...authForm,
                    role: e.target.value,
                  })}
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="hr">HR / Admin</option>
                </select>
              </label>
            </>
          )}

          <label>
            Email
            <input
              type="email"
              required
              value={authForm.email}
              onChange={e => setAuthForm({
                ...authForm,
                email: e.target.value,
              })}
              placeholder="you@company.com"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              minLength="8"
              required
              value={authForm.password}
              onChange={e => setAuthForm({
                ...authForm,
                password: e.target.value,
              })}
              placeholder="At least 8 characters"
            />
          </label>

          {error && <div className="alert error">{error}</div>}

          <button className="primary full" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>

          <p className="switch">
            {mode === 'login'
              ? 'New to StaffSync?'
              : 'Already have an account?'}
            {' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setError('')
              }}
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>

        <div className="api-status">
          <span className={health === 'Backend is running' ? 'green-dot' : 'yellow-dot'} />
          {health}
        </div>
      </div>
    )
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="auth-brand">Staff<span>Sync</span></div>
        <p className="side-caption">PEOPLE OPERATIONS</p>

        <nav>
          {modules
            .filter(m => m.name !== 'Employees' || user.role === 'hr')
            .map(m => (
              <button
                key={m.name}
                className={page === m.name ? 'nav-item active' : 'nav-item'}
                onClick={() => setPage(m.name)}
              >
                <m.icon size={18} />
                {m.name}
                {m.name === 'Notifications' && unreadCount > 0 && (
                  <span className="badge" style={{ marginLeft: 'auto' }}>
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
        </nav>

        <div className="side-bottom">
          <div className="avatar">
            {user.name?.slice(0, 1).toUpperCase()}
          </div>
          <div className="user-mini">
            <strong>{user.name}</strong>
            <span>{user.role} · {user.department}</span>
          </div>
          <button className="icon-button" title="Sign out" onClick={logout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="page-top">
          <div>
            <div className="eyebrow">STAFFSYNC WORKSPACE</div>
            <h1>{page}</h1>
            <p className="muted">
              Welcome back, {user.name}. Here's your workspace.
            </p>
          </div>

          <div className="top-actions">
            <span className="api-status">
              <span className={health === 'Backend is running' ? 'green-dot' : 'yellow-dot'} />
              {health}
            </span>
            <button className="secondary" onClick={loadAll}>
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="alert error">
            {error}
            <button onClick={() => setError('')}>Dismiss</button>
          </div>
        )}

        {notice && (
          <div className="alert success">
            {notice}
            <button onClick={() => setNotice('')}>Dismiss</button>
          </div>
        )}

        {page === 'Overview' && (
          <>
            <section className="hero">
              <div>
                <div className="eyebrow">YOUR TEAM. ONE WORKSPACE.</div>
                <h2>Everything your team needs,<br /><span>in sync.</span></h2>
                <p>
                  Manage people, attendance, leave requests and company updates in one place.
                </p>
              </div>
              <div className="hero-mark">S<span>S</span></div>
            </section>

            <div className="stats-grid">
              {[
                {
                  label: user.role === 'hr' ? 'Active accounts' : 'Team members',
                  value: summary.employeeCount ?? 0,
                  icon: Users,
                },
                {
                  label: 'Attendance records',
                  value: summary.attendanceCount ?? 0,
                  icon: CalendarCheck,
                },
                {
                  label: 'Pending leaves',
                  value: summary.pendingLeaves ?? 0,
                  icon: ClipboardList,
                },
                {
                  label: 'Announcements',
                  value: summary.announcementCount ?? 0,
                  icon: Megaphone,
                },
              ].map(s => (
                <article className="stat-card" key={s.label}>
                  <div className="stat-icon"><s.icon size={19} /></div>
                  <div><span>{s.label}</span><strong>{s.value}</strong></div>
                </article>
              ))}
            </div>

            <div className="content-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div><h2>Quick actions</h2><p>Common tasks for your role</p></div>
                </div>
                <div className="quick-actions">
                  <button onClick={checkIn}><Clock3 />Check in</button>
                  <button onClick={checkOut}><CalendarCheck />Check out</button>
                  <button onClick={() => setPage('Leave Requests')}><ClipboardList />Request leave</button>
                  <button onClick={() => setPage('Announcements')}><Megaphone />Announcements</button>
                  <button onClick={() => setPage('Notifications')}><Bell />Notifications {unreadCount > 0 && `(${unreadCount})`}</button>
                </div>
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div><h2>Latest announcements</h2><p>Updates from your organization</p></div>
                </div>
                {announcements.slice(0, 3).map(a => (
                  <div className="announcement-row" key={a._id}>
                    <strong>{a.title}</strong>
                    <p>{a.body}</p>
                    <small>{a.authorId?.name || 'StaffSync HR'} · {dateTime(a.createdAt)}</small>
                  </div>
                ))}
                {!announcements.length && <p className="empty">No announcements yet.</p>}
              </section>
            </div>
          </>
        )}

        {page === 'Employees' && (
          <section className="panel">
            <div className="panel-heading">
              <div><h2>Employee directory</h2><p>Create and search staff accounts</p></div>
              <input
                className="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search employees…"
              />
            </div>

            <form className="inline-form" onSubmit={createEmployee}>
              <input required placeholder="Full name" value={employeeForm.name}
                onChange={e => setEmployeeForm({ ...employeeForm, name: e.target.value })} />
              <input required type="email" placeholder="Email" value={employeeForm.email}
                onChange={e => setEmployeeForm({ ...employeeForm, email: e.target.value })} />
              <input required type="password" minLength="8" placeholder="Temporary password" value={employeeForm.password}
                onChange={e => setEmployeeForm({ ...employeeForm, password: e.target.value })} />
              <input placeholder="Department" value={employeeForm.department}
                onChange={e => setEmployeeForm({ ...employeeForm, department: e.target.value })} />
              <select value={employeeForm.role}
                onChange={e => setEmployeeForm({ ...employeeForm, role: e.target.value })}>
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="hr">HR</option>
              </select>
              <button className="primary"><Plus size={16} /> Add</button>
            </form>

            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Status</th></tr></thead>
                <tbody>
                  {filteredEmployees.map(e => (
                    <tr key={e.id}>
                      <td>{e.name}</td><td>{e.email}</td><td>{e.department}</td>
                      <td><span className="badge">{e.role}</span></td>
                      <td><span className="status-active">Active</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredEmployees.length && <p className="empty">No employees found. Create an account above.</p>}
            </div>
          </section>
        )}

        {page === 'Attendance' && (
          <section className="panel">
            <div className="panel-heading">
              <div><h2>Attendance tracker</h2><p>Record your workday and review attendance history.</p></div>
              <div className="button-row">
                <button className="primary" onClick={checkIn} disabled={busy}><Clock3 size={16} /> Check in</button>
                <button className="secondary" onClick={checkOut} disabled={busy}><Check size={16} /> Check out</button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Work date</th>{user.role === 'hr' && <th>Employee</th>}<th>Check in</th><th>Check out</th><th>Hours</th></tr></thead>
                <tbody>
                  {attendance.map(a => (
                    <tr key={a._id}>
                      <td>{a.workDate}</td>
                      {user.role === 'hr' && <td>{a.userId?.name || 'Employee'}</td>}
                      <td>{dateTime(a.checkIn)}</td><td>{dateTime(a.checkOut)}</td>
                      <td>{a.checkIn && a.checkOut ? ((new Date(a.checkOut) - new Date(a.checkIn)) / 3600000).toFixed(2) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!attendance.length && <p className="empty">No attendance records yet. Use Check in to create today's record.</p>}
            </div>
          </section>
        )}

        {page === 'Leave Requests' && (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-heading"><div><h2>Request time off</h2><p>Submit a leave request for review.</p></div></div>
              <form className="stack-form" onSubmit={createLeave}>
                <label>Start date<input required type="date" value={leaveForm.startDate}
                  onChange={e => setLeaveForm({ ...leaveForm, startDate: e.target.value })} /></label>
                <label>End date<input required type="date" value={leaveForm.endDate}
                  onChange={e => setLeaveForm({ ...leaveForm, endDate: e.target.value })} /></label>
                <label>Reason<textarea required rows="4" value={leaveForm.reason}
                  onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Add a brief reason…" /></label>
                <button className="primary" disabled={busy}>Submit request</button>
              </form>
            </section>

            <section className="panel">
              <div className="panel-heading"><div><h2>Leave requests</h2><p>Current status and review actions</p></div></div>
              {leaves.map(l => (
                <div className="leave-row" key={l._id}>
                  <div className="leave-top">
                    <strong>{l.userId?.name || 'Your request'}</strong>
                    <span className={`badge ${l.status}`}>{l.status}</span>
                  </div>
                  <p>{l.startDate} → {l.endDate}</p>
                  <p>{l.reason}</p>
                  {l.reviewNote && <small>Review note: {l.reviewNote}</small>}
                  {['hr', 'manager'].includes(user.role) && l.status === 'pending' && (
                    <div className="button-row">
                      <button className="approve" onClick={() => decideLeave(l._id, 'approved')}><Check size={15} /> Approve</button>
                      <button className="reject" onClick={() => decideLeave(l._id, 'rejected')}><X size={15} /> Reject</button>
                    </div>
                  )}
                </div>
              ))}
              {!leaves.length && <p className="empty">No leave requests yet.</p>}
            </section>
          </div>
        )}

        {page === 'Announcements' && (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-heading"><div><h2>Company announcements</h2><p>Important updates for your team.</p></div></div>
              {announcements.map(a => (
                <article className="announcement-row" key={a._id}>
                  <strong>{a.title}</strong><p>{a.body}</p>
                  <small>{a.authorId?.name || 'StaffSync HR'} · {dateTime(a.createdAt)}</small>
                </article>
              ))}
              {!announcements.length && <p className="empty">No announcements yet.</p>}
            </section>

            {user.role === 'hr' && (
              <section className="panel">
                <div className="panel-heading"><div><h2>Publish announcement</h2><p>Visible to signed-in users.</p></div></div>
                <form className="stack-form" onSubmit={createAnnouncement}>
                  <label>Title<input required value={announcementForm.title}
                    onChange={e => setAnnouncementForm({ ...announcementForm, title: e.target.value })} /></label>
                  <label>Content<textarea required rows="5" value={announcementForm.body}
                    onChange={e => setAnnouncementForm({ ...announcementForm, body: e.target.value })} /></label>
                  <button className="primary" disabled={busy}><Plus size={16} /> Publish</button>
                </form>
              </section>
            )}
          </div>
        )}

        {page === 'Training' && (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-heading">
                <div><h2>Learning & development</h2><p>Browse programs and track enrollment.</p></div>
                <button className="secondary" onClick={loadAll}><RefreshCw size={15} /> Refresh</button>
              </div>

              {trainings.map(t => {
                const ownEnrollment = (t.enrollments || []).find(
                  en => String(en.userId?._id || en.userId) === String(user.id || user._id)
                )

                return (
                  <article className="announcement-row" key={t._id}>
                    <div className="leave-top">
                      <strong>{t.title}</strong>
                      <span className="badge">{(t.enrollments || []).length} enrolled</span>
                    </div>
                    <p>{t.description}</p>
                    <p><strong>Trainer:</strong> {t.trainer || 'Not specified'}</p>
                    <p><strong>Dates:</strong> {new Date(t.startDate).toLocaleDateString()} – {new Date(t.endDate).toLocaleDateString()}</p>
                    {ownEnrollment && <p><span className={`badge ${ownEnrollment.status}`}>{ownEnrollment.status}</span></p>}

                    <div className="button-row">
                      {!ownEnrollment && (
                        <button className="primary" disabled={busy} onClick={() => enrollTraining(t._id)}>
                          <GraduationCap size={16} /> Enroll
                        </button>
                      )}

                      {user.role === 'hr' && (t.enrollments || [])
                        .filter(en => en.status !== 'completed')
                        .map(en => (
                          <button className="secondary" key={String(en.userId?._id || en.userId)}
                            disabled={busy}
                            onClick={() => completeTraining(t._id, en.userId?._id || en.userId)}>
                            <Check size={15} /> Complete {en.userId?.name || 'participant'}
                          </button>
                        ))}
                    </div>
                  </article>
                )
              })}

              {!trainings.length && <p className="empty">No training programs yet. HR can create the first program.</p>}
            </section>

            {user.role === 'hr' && (
              <section className="panel">
                <div className="panel-heading"><div><h2>Create training</h2><p>Publish a learning program for employees.</p></div></div>
                <form className="stack-form" onSubmit={createTraining}>
                  <label>Title<input required value={trainingForm.title}
                    onChange={e => setTrainingForm({ ...trainingForm, title: e.target.value })} placeholder="React Fundamentals" /></label>
                  <label>Description<textarea required rows="4" value={trainingForm.description}
                    onChange={e => setTrainingForm({ ...trainingForm, description: e.target.value })} placeholder="What will participants learn?" /></label>
                  <label>Trainer<input value={trainingForm.trainer}
                    onChange={e => setTrainingForm({ ...trainingForm, trainer: e.target.value })} placeholder="Trainer name" /></label>
                  <label>Start date<input required type="date" value={trainingForm.startDate}
                    onChange={e => setTrainingForm({ ...trainingForm, startDate: e.target.value })} /></label>
                  <label>End date<input required type="date" min={trainingForm.startDate || undefined}
                    value={trainingForm.endDate}
                    onChange={e => setTrainingForm({ ...trainingForm, endDate: e.target.value })} /></label>
                  <button className="primary" disabled={busy}><Plus size={16} /> Create training</button>
                </form>
              </section>
            )}
          </div>
        )}

        {page === 'Notifications' && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>
                  Notifications{' '}
                  {unreadCount > 0 && <span className="badge">{unreadCount} unread</span>}
                </h2>
                <p>Leave decisions, announcements, and training updates for your account.</p>
              </div>
              <div className="button-row">
                <button className="secondary" onClick={loadNotifications} disabled={busy}>
                  <RefreshCw size={15} /> Refresh
                </button>
                <button className="secondary" onClick={markAllNotificationsRead}
                  disabled={busy || unreadCount === 0}>
                  Mark all as read
                </button>
              </div>
            </div>

            {notifications.map(n => (
              <article className="announcement-row" key={n._id}
                style={{ opacity: n.readAt ? 0.68 : 1 }}>
                <div className="leave-top">
                  <strong>{n.title}</strong>
                  <span className="badge">{n.readAt ? 'Read' : 'Unread'}</span>
                </div>
                <p>{n.message}</p>
                <small>{dateTime(n.createdAt)} · {n.type}</small>
                {!n.readAt && (
                  <div className="button-row">
                    <button className="secondary" onClick={() => markNotificationRead(n._id)}
                      disabled={busy}>
                      Mark as read
                    </button>
                  </div>
                )}
              </article>
            ))}

            {!notifications.length && (
              <p className="empty">You're all caught up. No notifications yet.</p>
            )}
          </section>
        )}

        {page === 'Reports & Analytics' && (
          <div className="reports-page">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Export reports</h2>
                  <p>Download the currently available report data as CSV or an Excel-compatible .xls file.</p>
                </div>
                <button className="secondary" onClick={loadAll} disabled={busy}>
                  <RefreshCw size={15} /> Refresh data
                </button>
              </div>

              <div className="export-grid">
                {[
                  { type: 'attendance', label: 'Attendance', icon: CalendarCheck },
                  { type: 'leaves', label: 'Leave requests', icon: ClipboardList },
                  { type: 'training', label: 'Training', icon: GraduationCap },
                  ...(user.role === 'hr'
                    ? [{ type: 'employees', label: 'Employees', icon: Users }]
                    : []),
                ].map(item => (
                  <div className="export-card" key={item.type}>
                    <div className="export-card-title">
                      <item.icon size={18} />
                      <strong>{item.label}</strong>
                    </div>
                    <div className="button-row">
                      <button className="primary" onClick={() => handleReportExport(item.type, 'csv')}>
                        <Plus size={14} /> Export CSV
                      </button>
                      <button className="secondary" onClick={() => handleReportExport(item.type, 'xls')}>
                        Export Excel
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <p className="muted export-note">
                Exports include only data available to your signed-in role. Excel files use the .xls format and can be opened in Microsoft Excel or imported into spreadsheet software.
              </p>
            </section>

            <style>{`
              .export-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
                gap: 12px;
              }
              .export-card {
                border: 1px solid var(--border-color, #e5e7eb);
                border-radius: 12px;
                padding: 14px;
                display: flex;
                flex-direction: column;
                gap: 12px;
              }
              .export-card-title {
                display: flex;
                align-items: center;
                gap: 8px;
              }
              .export-card .button-row {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
              }
              .export-card button { font-size: 12px; }
              .export-note { margin-top: 14px; font-size: 12px; }
              .analytics-bars {
                display: flex;
                align-items: stretch;
                gap: 12px;
                min-height: 190px;
                padding-top: 12px;
                overflow-x: auto;
              }
              .analytics-bar-item {
                min-width: 48px;
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
              }
              .analytics-bar-value { font-size: 12px; font-weight: 700; }
              .analytics-bar-track {
                height: 110px;
                width: 100%;
                max-width: 42px;
                border-radius: 8px;
                background: var(--surface-secondary, #f1f5f9);
                display: flex;
                align-items: flex-end;
                overflow: hidden;
              }
              .analytics-bar-fill {
                width: 100%;
                border-radius: 8px;
                background: #4f46e5;
                min-height: 4px;
              }
              .analytics-bar-label {
                font-size: 10px;
                color: var(--muted, #64748b);
                white-space: nowrap;
              }
              .analytics-bar-sub {
                font-size: 10px;
                color: var(--muted, #64748b);
              }
              .leave-analytics {
                display: flex;
                align-items: center;
                gap: 24px;
                flex-wrap: wrap;
              }
              .leave-analytics-total {
                width: 105px;
                height: 105px;
                border-radius: 50%;
                border: 10px solid #e0e7ff;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
              }
              .leave-analytics-total strong { font-size: 24px; }
              .leave-analytics-total span {
                font-size: 10px;
                color: var(--muted, #64748b);
                text-align: center;
              }
              .leave-analytics-bars {
                flex: 1;
                min-width: 150px;
                display: grid;
                gap: 14px;
              }
              .leave-status-heading,
              .training-chart-heading {
                display: flex;
                justify-content: space-between;
                gap: 12px;
                font-size: 12px;
                margin-bottom: 6px;
              }
              .leave-status-track,
              .training-status-track {
                height: 10px;
                background: var(--surface-secondary, #f1f5f9);
                border-radius: 999px;
                overflow: hidden;
                position: relative;
              }
              .leave-status-fill {
                height: 100%;
                border-radius: 999px;
                background: #64748b;
              }
              .leave-status-fill.approved { background: #16a34a; }
              .leave-status-fill.rejected { background: #dc2626; }
              .training-chart-list { display: grid; gap: 16px; }
              .training-chart-heading span {
                color: var(--muted, #64748b);
                white-space: nowrap;
              }
              .training-enrolled-fill {
                position: absolute;
                inset: 0 auto 0 0;
                background: #c7d2fe;
                border-radius: 999px;
              }
              .training-completed-fill {
                position: absolute;
                inset: 0 auto 0 0;
                background: #4f46e5;
                border-radius: 999px;
              }
            `}</style>

            <section className="stats-grid">
              {[
                { label: 'Employees', value: user.role === 'hr' ? employees.length : '—', icon: Users },
                { label: 'Attendance records', value: attendance.length, icon: CalendarCheck },
                { label: 'Approved leaves', value: leaves.filter(l => l.status === 'approved').length, icon: Check },
                { label: 'Training programs', value: trainings.length, icon: GraduationCap },
              ].map(s => (
                <article className="stat-card" key={s.label}>
                  <div className="stat-icon"><s.icon size={19} /></div>
                  <div><span>{s.label}</span><strong>{s.value}</strong></div>
                </article>
              ))}
            </section>

            <div className="content-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div><h2>Attendance analytics</h2><p>Daily records and recorded work hours.</p></div>
                </div>

                {(() => {
                  const daily = Object.values(
                    attendance.reduce((acc, item) => {
                      const key = item.workDate || 'Unknown'

                      if (!acc[key]) {
                        acc[key] = { date: key, records: 0, hours: 0 }
                      }

                      acc[key].records += 1

                      if (item.checkIn && item.checkOut) {
                        acc[key].hours += (
                          new Date(item.checkOut) - new Date(item.checkIn)
                        ) / 3600000
                      }

                      return acc
                    }, {})
                  )
                    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
                    .slice(-7)

                  const maxRecords = Math.max(1, ...daily.map(d => d.records))

                  return daily.length ? (
                    <div className="analytics-bars">
                      {daily.map(d => (
                        <div className="analytics-bar-item" key={d.date}>
                          <div className="analytics-bar-value">{d.records}</div>
                          <div className="analytics-bar-track">
                            <div className="analytics-bar-fill"
                              style={{ height: `${Math.max(8, d.records / maxRecords * 100)}%` }} />
                          </div>
                          <div className="analytics-bar-label">{d.date}</div>
                          <div className="analytics-bar-sub">{d.hours.toFixed(1)} hrs</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty">No attendance data available to chart yet.</p>
                  )
                })()}
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div><h2>Leave analytics</h2><p>Requests grouped by current status.</p></div>
                </div>

                {(() => {
                  const counts = ['pending', 'approved', 'rejected'].map(status => ({
                    status,
                    count: leaves.filter(l => l.status === status).length,
                  }))

                  const total = Math.max(
                    1,
                    counts.reduce((sum, item) => sum + item.count, 0)
                  )

                  return (
                    <div className="leave-analytics">
                      <div className="leave-analytics-total">
                        <strong>{leaves.length}</strong>
                        <span>Total requests</span>
                      </div>

                      <div className="leave-analytics-bars">
                        {counts.map(item => (
                          <div className="leave-status-row" key={item.status}>
                            <div className="leave-status-heading">
                              <span>{item.status[0].toUpperCase() + item.status.slice(1)}</span>
                              <strong>{item.count}</strong>
                            </div>
                            <div className="leave-status-track">
                              <div className={`leave-status-fill ${item.status}`}
                                style={{ width: `${item.count / total * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div><h2>Training analytics</h2><p>Enrollment and completion by program.</p></div>
                </div>

                {trainings.length ? (
                  <div className="training-chart-list">
                    {trainings.map(t => {
                      const enrolled = (t.enrollments || []).length
                      const completed = (t.enrollments || [])
                        .filter(en => en.status === 'completed').length
                      const scale = Math.max(1, enrolled)

                      return (
                        <div className="training-chart-row" key={t._id}>
                          <div className="training-chart-heading">
                            <strong>{t.title}</strong>
                            <span>{completed}/{enrolled} completed</span>
                          </div>
                          <div className="training-status-track">
                            <div className="training-enrolled-fill"
                              style={{ width: `${enrolled ? 100 : 0}%` }} />
                            <div className="training-completed-fill"
                              style={{ width: `${completed / scale * 100}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="empty">No training programs available to chart yet.</p>
                )}
              </section>
            </div>

            <div className="content-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div><h2>Attendance summary</h2><p>Based on attendance records currently available to your account.</p></div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {user.role === 'hr' && <th>Employee</th>}
                        <th>Work date</th><th>Check-in</th><th>Check-out</th><th>Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.slice(0, 10).map(a => (
                        <tr key={a._id}>
                          {user.role === 'hr' && <td>{a.userId?.name || 'Employee'}</td>}
                          <td>{a.workDate || '—'}</td>
                          <td>{a.checkIn ? new Date(a.checkIn).toLocaleTimeString() : '—'}</td>
                          <td>{a.checkOut ? new Date(a.checkOut).toLocaleTimeString() : '—'}</td>
                          <td>{a.checkIn && a.checkOut ? ((new Date(a.checkOut) - new Date(a.checkIn)) / 3600000).toFixed(2) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!attendance.length && <p className="empty">No attendance data available yet.</p>}
                </div>
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div><h2>Leave breakdown</h2><p>Requests grouped by current status.</p></div>
                </div>
                <div className="stats-grid">
                  {['pending', 'approved', 'rejected'].map(status => (
                    <article className="stat-card" key={status}>
                      <div><span>{status[0].toUpperCase() + status.slice(1)}</span>
                        <strong>{leaves.filter(l => l.status === status).length}</strong>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {user.role !== 'employee' && <th>Employee</th>}
                        <th>Period</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaves.slice(0, 10).map(l => (
                        <tr key={l._id}>
                          {user.role !== 'employee' && <td>{l.userId?.name || 'Employee'}</td>}
                          <td>{l.startDate || '—'} – {l.endDate || '—'}</td>
                          <td><span className={`badge ${l.status}`}>{l.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!leaves.length && <p className="empty">No leave requests available yet.</p>}
                </div>
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div><h2>Training overview</h2><p>Enrollment and completion counts by program.</p></div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Program</th><th>Enrolled</th><th>Completed</th></tr></thead>
                    <tbody>
                      {trainings.map(t => (
                        <tr key={t._id}>
                          <td>{t.title}</td>
                          <td>{(t.enrollments || []).length}</td>
                          <td>{(t.enrollments || []).filter(en => en.status === 'completed').length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!trainings.length && <p className="empty">No training programs available yet.</p>}
                </div>
              </section>

              {user.role === 'hr' && (
                <section className="panel">
                  <div className="panel-heading">
                    <div><h2>Employee directory snapshot</h2><p>Current employee accounts grouped by department.</p></div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Department</th><th>Employees</th></tr></thead>
                      <tbody>
                        {[...new Set(employees.map(e => e.department || 'General'))]
                          .sort()
                          .map(dept => (
                            <tr key={dept}>
                              <td>{dept}</td>
                              <td>{employees.filter(e => (e.department || 'General') === dept).length}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {!employees.length && <p className="empty">No employee records available.</p>}
                  </div>
                </section>
              )}
            </div>

            <div className="button-row">
              <button className="secondary" onClick={loadAll}>
                <RefreshCw size={15} /> Refresh report data
              </button>
            </div>
          </div>
        )}

        <footer className="footer">
          <span>StaffSync · MERN HR Management MVP</span>
          <span>Signed in as {user.role}</span>
        </footer>
      </main>
    </div>
  )
}

export default App