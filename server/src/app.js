// server/src/app.js
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import {
  User,
  Attendance,
  LeaveRequest,
  Announcement,
  Training,
  Notification,
} from './models.js'

const app = express()

app.use(helmet())
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || true,
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))
app.use(morgan('dev'))

function safeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    managerId: user.managerId,
  }
}

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing in server/.env')
  }

  return jwt.sign(
    { sub: String(user._id), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  )
}

async function auth(req, res, next) {
  try {
    const authorization = req.headers.authorization || ''

    if (!authorization.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Please sign in first' })
    }

    const payload = jwt.verify(
      authorization.slice(7),
      process.env.JWT_SECRET
    )
    const user = await User.findById(payload.sub)

    if (!user || user.active === false) {
      return res.status(401).json({ message: 'Account is unavailable' })
    }

    req.user = user
    next()
  } catch {
    return res.status(401).json({
      message: 'Invalid or expired login session',
    })
  }
}

function allow(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action',
      })
    }
    next()
  }
}

function handleError(res, error, status = 500) {
  console.error(error)

  if (error?.code === 11000) {
    return res.status(409).json({
      message: 'A record with this information already exists',
    })
  }

  return res.status(status).json({
    message: status === 500
      ? 'An unexpected server error occurred'
      : error.message,
  })
}

async function notifyUsers(
  userIds,
  { title, message, type = 'system' }
) {
  const uniqueIds = [
    ...new Set((userIds || []).filter(Boolean).map(String)),
  ]

  if (!uniqueIds.length) return

  try {
    await Notification.insertMany(
      uniqueIds.map(userId => ({
        userId,
        title,
        message,
        type,
      }))
    )
  } catch (error) {
    console.error('Notification creation failed:', error.message)
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    message: 'Backend is running',
    timestamp: new Date().toISOString(),
  })
})

// Authentication
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, department = 'General' } = req.body

    if (
      typeof name !== 'string' || !name.trim() ||
      typeof email !== 'string' || !email.trim() ||
      typeof password !== 'string' || password.length < 8
    ) {
      return res.status(400).json({
        message: 'Name, email and password (at least 8 characters) are required',
      })
    }

    const normalizedEmail = email.toLowerCase().trim()

    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({
        message: 'An account with this email already exists',
      })
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'employee',
      department: typeof department === 'string' && department.trim()
        ? department.trim()
        : 'General',
    })

    return res.status(201).json({
      token: createToken(user),
      user: safeUser(user),
    })
  } catch (error) {
    return handleError(res, error, 400)
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim()
    const password = req.body.password

    if (!email || typeof password !== 'string') {
      return res.status(400).json({
        message: 'Email and password are required',
      })
    }

    const user = await User.findOne({ email }).select('+passwordHash')

    if (
      !user ||
      user.active === false ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      return res.status(401).json({
        message: 'Invalid email or password',
      })
    }

    res.json({ token: createToken(user), user: safeUser(user) })
  } catch (error) {
    handleError(res, error)
  }
})

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: safeUser(req.user) })
})

// Employees — HR only
app.get('/api/employees', auth, allow('hr'), async (_req, res) => {
  try {
    const employees = await User.find({ active: { $ne: false } })
      .sort({ createdAt: -1 })

    res.json({ employees: employees.map(safeUser) })
  } catch (error) {
    handleError(res, error)
  }
})

app.post('/api/employees', auth, allow('hr'), async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = 'employee',
      department = 'General',
      managerId = null,
    } = req.body

    if (
      typeof name !== 'string' || !name.trim() ||
      typeof email !== 'string' || !email.trim() ||
      typeof password !== 'string' || password.length < 8
    ) {
      return res.status(400).json({
        message: 'Name, email and password (at least 8 characters) are required',
      })
    }

    if (!['hr', 'manager', 'employee'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' })
    }

    const normalizedEmail = email.toLowerCase().trim()

    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ message: 'Email already exists' })
    }

    if (managerId) {
      const manager = await User.findOne({
        _id: managerId,
        role: 'manager',
        active: { $ne: false },
      })

      if (!manager) {
        return res.status(400).json({
          message: 'Manager not found or inactive',
        })
      }
    }

    const employee = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      role,
      department: department.trim() || 'General',
      managerId: managerId || null,
    })

    res.status(201).json({ employee: safeUser(employee) })
  } catch (error) {
    handleError(res, error, 400)
  }
})

app.patch('/api/employees/:id', auth, allow('hr'), async (req, res) => {
  try {
    const allowedFields = ['name', 'department', 'role', 'managerId', 'active']
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([key]) =>
        allowedFields.includes(key)
      )
    )

    if (updates.role && !['hr', 'manager', 'employee'].includes(updates.role)) {
      return res.status(400).json({ message: 'Invalid role' })
    }

    if (updates.name !== undefined) {
      if (typeof updates.name !== 'string' || !updates.name.trim()) {
        return res.status(400).json({ message: 'Name cannot be empty' })
      }
      updates.name = updates.name.trim()
    }

    if (updates.managerId) {
      const manager = await User.findOne({
        _id: updates.managerId,
        role: 'manager',
        active: { $ne: false },
      })

      if (!manager) {
        return res.status(400).json({
          message: 'Manager not found or inactive',
        })
      }
    }

    const employee = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    )

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' })
    }

    res.json({ employee: safeUser(employee) })
  } catch (error) {
    handleError(res, error, 400)
  }
})

// Attendance
app.get('/api/attendance', auth, async (req, res) => {
  try {
    const query = req.user.role === 'hr'
      ? {}
      : { userId: req.user._id }

    const attendance = await Attendance.find(query)
      .populate('userId', 'name email department')
      .sort({ createdAt: -1 })
      .limit(100)

    res.json({ attendance })
  } catch (error) {
    handleError(res, error)
  }
})

app.post('/api/attendance/check-in', auth, async (req, res) => {
  try {
    const workDate = new Date().toISOString().slice(0, 10)
    let record = await Attendance.findOne({
      userId: req.user._id,
      workDate,
    })

    if (record?.checkIn && !record.checkOut) {
      return res.status(409).json({
        message: 'You have already checked in',
      })
    }

    if (record?.checkOut) {
      return res.status(409).json({
        message: 'Today’s attendance is already completed',
      })
    }

    if (!record) {
      record = await Attendance.create({
        userId: req.user._id,
        workDate,
        checkIn: new Date(),
      })
    } else {
      record.checkIn = new Date()
      await record.save()
    }

    res.json({ message: 'Checked in successfully', attendance: record })
  } catch (error) {
    handleError(res, error)
  }
})

app.post('/api/attendance/check-out', auth, async (req, res) => {
  try {
    const workDate = new Date().toISOString().slice(0, 10)
    const record = await Attendance.findOne({
      userId: req.user._id,
      workDate,
    })

    if (!record || !record.checkIn) {
      return res.status(400).json({
        message: 'Check in before checking out',
      })
    }

    if (record.checkOut) {
      return res.status(409).json({
        message: 'You have already checked out',
      })
    }

    record.checkOut = new Date()
    await record.save()

    res.json({ message: 'Checked out successfully', attendance: record })
  } catch (error) {
    handleError(res, error)
  }
})

// Leave requests
app.get('/api/leaves', auth, async (req, res) => {
  try {
    let query = {}

    if (req.user.role === 'employee') {
      query = { userId: req.user._id }
    } else if (req.user.role === 'manager') {
      const team = await User.find({
        managerId: req.user._id,
      }).select('_id')

      query = {
        userId: { $in: team.map(item => item._id) },
      }
    }

    const leaves = await LeaveRequest.find(query)
      .populate('userId', 'name email department managerId')
      .populate('reviewerId', 'name')
      .sort({ createdAt: -1 })

    res.json({ leaves })
  } catch (error) {
    handleError(res, error)
  }
})

app.post('/api/leaves', auth, async (req, res) => {
  try {
    const { startDate, endDate, reason } = req.body
    const start = new Date(startDate)
    const end = new Date(endDate)

    if (
      !startDate || !endDate ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start ||
      typeof reason !== 'string' || !reason.trim()
    ) {
      return res.status(400).json({
        message: 'Provide valid dates and a reason; end date must not precede start date',
      })
    }

    const leave = await LeaveRequest.create({
      userId: req.user._id,
      startDate: start,
      endDate: end,
      reason: reason.trim(),
    })

    res.status(201).json({ message: 'Leave request submitted', leave })
  } catch (error) {
    handleError(res, error)
  }
})

app.patch(
  '/api/leaves/:id/decision',
  auth,
  allow('hr', 'manager'),
  async (req, res) => {
    try {
      const { status, reviewNote = '' } = req.body

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          message: 'Status must be approved or rejected',
        })
      }

      const leave = await LeaveRequest.findById(req.params.id)

      if (!leave) {
        return res.status(404).json({ message: 'Leave request not found' })
      }

      if (leave.status !== 'pending') {
        return res.status(409).json({
          message: 'This request has already been reviewed',
        })
      }

      if (req.user.role === 'manager') {
        const employee = await User.findById(leave.userId)

        if (
          !employee ||
          String(employee.managerId || '') !== String(req.user._id)
        ) {
          return res.status(403).json({
            message: 'You can only review leave for your assigned team',
          })
        }
      }

      leave.status = status
      leave.reviewNote = String(reviewNote).slice(0, 500)
      leave.reviewerId = req.user._id
      await leave.save()

      await notifyUsers([leave.userId], {
        title: `Leave ${status}`,
        message: `Your leave request was ${status}.${leave.reviewNote ? ` Note: ${leave.reviewNote}` : ''}`,
        type: 'leave',
      })

      res.json({ message: `Leave ${status}`, leave })
    } catch (error) {
      handleError(res, error)
    }
  }
)

// Announcements
app.get('/api/announcements', auth, async (_req, res) => {
  try {
    const announcements = await Announcement.find()
      .populate('authorId', 'name')
      .sort({ createdAt: -1 })
      .limit(100)

    res.json({ announcements })
  } catch (error) {
    handleError(res, error)
  }
})

app.post('/api/announcements', auth, allow('hr'), async (req, res) => {
  try {
    const { title, body } = req.body

    if (
      typeof title !== 'string' || !title.trim() ||
      typeof body !== 'string' || !body.trim()
    ) {
      return res.status(400).json({
        message: 'Title and announcement content are required',
      })
    }

    const announcement = await Announcement.create({
      title: title.trim(),
      body: body.trim(),
      authorId: req.user._id,
    })

    const recipients = await User.find({
      active: true,
      _id: { $ne: req.user._id },
    }).select('_id')

    await notifyUsers(
      recipients.map(user => user._id),
      {
        title: 'New company announcement',
        message: title.trim(),
        type: 'announcement',
      }
    )

    res.status(201).json({ announcement })
  } catch (error) {
    handleError(res, error)
  }
})

// Training
app.get('/api/trainings', auth, async (_req, res) => {
  try {
    const trainings = await Training.find()
      .populate('createdBy', 'name')
      .populate('enrollments.userId', 'name department')
      .sort({ startDate: 1 })

    res.json({ trainings })
  } catch (error) {
    handleError(res, error)
  }
})

app.post('/api/trainings', auth, allow('hr'), async (req, res) => {
  try {
    const {
      title,
      description,
      trainer = '',
      startDate,
      endDate,
    } = req.body

    if (
      typeof title !== 'string' || !title.trim() ||
      typeof description !== 'string' || !description.trim() ||
      !startDate || !endDate
    ) {
      return res.status(400).json({
        message: 'Title, description, start date and end date are required',
      })
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    ) {
      return res.status(400).json({
        message: 'Please provide valid dates; end date must not precede start date',
      })
    }

    const training = await Training.create({
      title: title.trim(),
      description: description.trim(),
      trainer: typeof trainer === 'string' ? trainer.trim() : '',
      startDate: start,
      endDate: end,
      createdBy: req.user._id,
      enrollments: [],
    })

    res.status(201).json({
      message: 'Training created successfully',
      training,
    })
  } catch (error) {
    handleError(res, error)
  }
})

app.post('/api/trainings/:id/enroll', auth, async (req, res) => {
  try {
    const training = await Training.findById(req.params.id)

    if (!training) {
      return res.status(404).json({ message: 'Training not found' })
    }

    const alreadyEnrolled = training.enrollments.some(
      item => String(item.userId) === String(req.user._id)
    )

    if (alreadyEnrolled) {
      return res.status(409).json({
        message: 'You are already enrolled in this training',
      })
    }

    training.enrollments.push({
      userId: req.user._id,
      status: 'enrolled',
    })

    await training.save()

    await notifyUsers([req.user._id], {
      title: 'Training enrollment confirmed',
      message: `You enrolled in ${training.title}.`,
      type: 'training',
    })

    res.json({
      message: 'Successfully enrolled in training',
      training,
    })
  } catch (error) {
    handleError(res, error)
  }
})

app.patch(
  '/api/trainings/:id/complete/:userId',
  auth,
  allow('hr'),
  async (req, res) => {
    try {
      const training = await Training.findById(req.params.id)

      if (!training) {
        return res.status(404).json({ message: 'Training not found' })
      }

      const enrollment = training.enrollments.find(
        item => String(item.userId) === String(req.params.userId)
      )

      if (!enrollment) {
        return res.status(404).json({
          message: 'Participant is not enrolled in this training',
        })
      }

      enrollment.status = 'completed'
      await training.save()

      await notifyUsers([req.params.userId], {
        title: 'Training completed',
        message: `Your completion of ${training.title} has been recorded.`,
        type: 'training',
      })

      res.json({
        message: 'Participant marked as completed',
        training,
      })
    } catch (error) {
      handleError(res, error)
    }
  }
)

// Notifications — every query is scoped to the signed-in user
app.get('/api/notifications', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({
      userId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(100)

    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      readAt: null,
    })

    res.json({ notifications, unreadCount })
  } catch (error) {
    handleError(res, error)
  }
})

app.patch('/api/notifications/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        userId: req.user._id,
      },
      { $set: { readAt: new Date() } },
      { new: true, runValidators: true }
    )

    if (!notification) {
      return res.status(404).json({
        message: 'Notification not found',
      })
    }

    res.json({ notification })
  } catch (error) {
    handleError(res, error)
  }
})

app.patch('/api/notifications/read-all', auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, readAt: null },
      { $set: { readAt: new Date() } }
    )

    res.json({ message: 'All notifications marked as read' })
  } catch (error) {
    handleError(res, error)
  }
})

// Dashboard summary
app.get('/api/dashboard/summary', auth, async (req, res) => {
  try {
    let employeeQuery

    if (req.user.role === 'hr') {
      employeeQuery = { active: { $ne: false } }
    } else if (req.user.role === 'manager') {
      employeeQuery = {
        managerId: req.user._id,
        active: { $ne: false },
      }
    } else {
      employeeQuery = { _id: req.user._id }
    }

    const [
      employeeCount,
      attendanceCount,
      pendingLeaves,
      announcementCount,
      trainingCount,
    ] = await Promise.all([
      User.countDocuments(employeeQuery),
      Attendance.countDocuments(
        req.user.role === 'hr' ? {} : { userId: req.user._id }
      ),
      LeaveRequest.countDocuments(
        req.user.role === 'hr'
          ? { status: 'pending' }
          : { userId: req.user._id, status: 'pending' }
      ),
      Announcement.countDocuments(),
      Training.countDocuments(),
    ])

    res.json({
      summary: {
        employeeCount,
        attendanceCount,
        pendingLeaves,
        announcementCount,
        trainingCount,
      },
    })
  } catch (error) {
    handleError(res, error)
  }
})

app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.path}`,
  })
})

app.use((error, _req, res, _next) => {
  console.error('Unhandled request error:', error)

  if (res.headersSent) return

  res.status(500).json({ message: 'Internal server error' })
})

export default app