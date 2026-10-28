
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
} from './models.js'

const app = express()

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(helmet())

app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5179',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5179',
    ],
    credentials: true,
  })
)

app.use(express.json({ limit: '1mb' }))
app.use(morgan('dev'))

// --------------------------------------------------
// AUTHENTICATION HELPERS
// --------------------------------------------------

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
    {
      sub: String(user._id),
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  )
}

async function auth(req, res, next) {
  try {
    const authorization = req.headers.authorization || ''

    if (!authorization.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Please sign in first',
      })
    }

    const token = authorization.slice(7)
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(payload.sub)

    if (!user || user.active === false) {
      return res.status(401).json({
        message: 'Account is unavailable',
      })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({
      message: 'Invalid or expired login session',
    })
  }
}

function allow(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'You do not have permission for this action',
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
    message:
      status === 500
        ? 'An unexpected server error occurred'
        : error.message,
  })
}

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    message: 'Backend is running',
    timestamp: new Date().toISOString(),
  })
})

// --------------------------------------------------
// REGISTER
// --------------------------------------------------

app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = 'employee',
      department = 'General',
    } = req.body

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      typeof email !== 'string' ||
      !email.trim() ||
      typeof password !== 'string' ||
      password.length < 8
    ) {
      return res.status(400).json({
        message:
          'Name, email and password (at least 8 characters) are required',
      })
    }

    if (!['hr', 'manager', 'employee'].includes(role)) {
      return res.status(400).json({
        message: 'Invalid role',
      })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const existingUser = await User.findOne({
      email: normalizedEmail,
    })

    if (existingUser) {
      return res.status(409).json({
        message: 'An account with this email already exists',
      })
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12),
      role,
      department:
        typeof department === 'string' && department.trim()
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

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '')
      .toLowerCase()
      .trim()

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

    return res.json({
      token: createToken(user),
      user: safeUser(user),
    })
  } catch (error) {
    return handleError(res, error)
  }
})

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------

app.get('/api/auth/me', auth, (req, res) => {
  res.json({
    user: safeUser(req.user),
  })
})

// --------------------------------------------------
// EMPLOYEES
// --------------------------------------------------

app.get('/api/employees', auth, allow('hr'), async (_req, res) => {
  try {
    const employees = await User.find({
      active: { $ne: false },
    }).sort({ createdAt: -1 })

    res.json({
      employees: employees.map(safeUser),
    })
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
      typeof name !== 'string' ||
      !name.trim() ||
      typeof email !== 'string' ||
      !email.trim() ||
      typeof password !== 'string' ||
      password.length < 8
    ) {
      return res.status(400).json({
        message:
          'Name, email and password (at least 8 characters) are required',
      })
    }

    if (!['hr', 'manager', 'employee'].includes(role)) {
      return res.status(400).json({
        message: 'Invalid role',
      })
    }

    const normalizedEmail = email.toLowerCase().trim()

    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({
        message: 'Email already exists',
      })
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
      department:
        typeof department === 'string' && department.trim()
          ? department.trim()
          : 'General',
      managerId: managerId || null,
    })

    res.status(201).json({
      employee: safeUser(employee),
    })
  } catch (error) {
    handleError(res, error, 400)
  }
})

app.patch('/api/employees/:id', auth, allow('hr'), async (req, res) => {
  try {
    const allowedFields = [
      'name',
      'department',
      'role',
      'managerId',
      'active',
    ]

    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([key]) =>
        allowedFields.includes(key)
      )
    )

    if (
      updates.role &&
      !['hr', 'manager', 'employee'].includes(updates.role)
    ) {
      return res.status(400).json({
        message: 'Invalid role',
      })
    }

    if (updates.name !== undefined) {
      if (
        typeof updates.name !== 'string' ||
        !updates.name.trim()
      ) {
        return res.status(400).json({
          message: 'Name cannot be empty',
        })
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
      {
        new: true,
        runValidators: true,
      }
    )

    if (!employee) {
      return res.status(404).json({
        message: 'Employee not found',
      })
    }

    res.json({
      employee: safeUser(employee),
    })
  } catch (error) {
    handleError(res, error, 400)
  }
})

// --------------------------------------------------
// ATTENDANCE
// --------------------------------------------------

app.get('/api/attendance', auth, async (req, res) => {
  try {
    const query =
      req.user.role === 'hr'
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
    const workDate = new Date().toLocaleDateString('en-CA')

    let record = await Attendance.findOne({
      userId: req.user._id,
      workDate,
    })

    if (record?.checkIn) {
      return res.status(409).json({
        message: record.checkOut
          ? 'Attendance is already complete for today'
          : 'You are already checked in',
      })
    }

    if (!record) {
      record = new Attendance({
        userId: req.user._id,
        workDate,
      })
    }

    record.checkIn = new Date()
    record.checkOut = null

    await record.save()

    res.status(201).json({
      message: 'Checked in successfully',
      record,
    })
  } catch (error) {
    handleError(res, error)
  }
})

app.post('/api/attendance/check-out', auth, async (req, res) => {
  try {
    const workDate = new Date().toLocaleDateString('en-CA')

    const record = await Attendance.findOne({
      userId: req.user._id,
      workDate,
    })

    if (!record?.checkIn) {
      return res.status(400).json({
        message: 'Please check in before checking out',
      })
    }

    if (record.checkOut) {
      return res.status(409).json({
        message: 'You have already checked out',
      })
    }

    record.checkOut = new Date()
    await record.save()

    res.json({
      message: 'Checked out successfully',
      record,
    })
  } catch (error) {
    handleError(res, error)
  }
})

// --------------------------------------------------
// LEAVE REQUESTS
// --------------------------------------------------

app.get('/api/leaves', auth, async (req, res) => {
  try {
    let query

    if (req.user.role === 'hr') {
      query = {}
    } else if (req.user.role === 'manager') {
      const team = await User.find({
        managerId: req.user._id,
      }).select('_id')

      query = {
        $or: [
          { userId: req.user._id },
          { userId: { $in: team.map((user) => user._id) } },
        ],
      }
    } else {
      query = { userId: req.user._id }
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

    if (
      !startDate ||
      !endDate ||
      typeof reason !== 'string' ||
      !reason.trim()
    ) {
      return res.status(400).json({
        message: 'Start date, end date and reason are required',
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

    const leave = await LeaveRequest.create({
      userId: req.user._id,
      startDate: start,
      endDate: end,
      reason: reason.trim(),
    })

    res.status(201).json({
      message: 'Leave request submitted',
      leave,
    })
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
        return res.status(404).json({
          message: 'Leave request not found',
        })
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

      res.json({
        message: `Leave ${status}`,
        leave,
      })
    } catch (error) {
      handleError(res, error)
    }
  }
)

// --------------------------------------------------
// ANNOUNCEMENTS
// --------------------------------------------------

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
      typeof title !== 'string' ||
      !title.trim() ||
      typeof body !== 'string' ||
      !body.trim()
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

    res.status(201).json({ announcement })
  } catch (error) {
    handleError(res, error)
  }
})

// --------------------------------------------------
// TRAINING
// --------------------------------------------------

app.get('/api/trainings', auth, async (_req, res) => {
  try {
    const trainings = await Training.find()
      .populate('createdBy', 'name email')
      .populate('enrollments.userId', 'name email department')
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
      typeof title !== 'string' ||
      !title.trim() ||
      typeof description !== 'string' ||
      !description.trim() ||
      !startDate ||
      !endDate
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
      return res.status(404).json({
        message: 'Training not found',
      })
    }

    const alreadyEnrolled = training.enrollments.some(
      (item) => String(item.userId) === String(req.user._id)
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
        return res.status(404).json({
          message: 'Training not found',
        })
      }

      const enrollment = training.enrollments.find(
        (item) => String(item.userId) === String(req.params.userId)
      )

      if (!enrollment) {
        return res.status(404).json({
          message: 'Participant is not enrolled in this training',
        })
      }

      enrollment.status = 'completed'
      await training.save()

      res.json({
        message: 'Participant marked as completed',
        training,
      })
    } catch (error) {
      handleError(res, error)
    }
  }
)

// --------------------------------------------------
// DASHBOARD SUMMARY
// --------------------------------------------------

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
        req.user.role === 'hr'
          ? {}
          : { userId: req.user._id }
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

// --------------------------------------------------
// 404 AND ERROR HANDLERS
// --------------------------------------------------

app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.path}`,
  })
})

app.use((error, _req, res, _next) => {
  console.error('Unhandled request error:', error)

  if (res.headersSent) {
    return
  }

  res.status(500).json({
    message: 'Internal server error',
  })
})

// Models are imported from models.js.
// Do not define Mongoose models in this file.

export default app
