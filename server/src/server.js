
import 'dotenv/config'
import app from './app.js'
import mongoose from 'mongoose'

const port = Number(process.env.PORT || 5000)

let server

async function startServer() {
  try {
    // Validate required environment variables
    if (!process.env.MONGODB_URI) {
      throw new Error(
        'MONGODB_URI is missing. Create server/.env from .env.example.'
      )
    }

    if (!process.env.JWT_SECRET) {
      throw new Error(
        'JWT_SECRET is missing. Add it to server/.env.'
      )
    }

    // Configure MongoDB connection timeouts
    mongoose.set('bufferCommands', false)

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    })

    console.log('MongoDB connected successfully')

    // Start accepting requests only after MongoDB connects
    server = app.listen(port, '0.0.0.0', () => {
      console.log(`StaffSync API listening on http://localhost:${port}`)
    })

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(
          `Port ${port} is already in use. Stop the other process or change PORT in server/.env.`
        )
      } else {
        console.error('HTTP server error:', error)
      }

      process.exitCode = 1
    })
  } catch (error) {
    console.error('Failed to start StaffSync:', error.message)

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {})
    }

    process.exitCode = 1
  }
}

// Handle unexpected MongoDB disconnections
mongoose.connection.on('disconnected', () => {
  console.error('MongoDB disconnected. Check whether MongoDB is running.')
})

mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error:', error.message)
})

// Gracefully shut down the HTTP server and database connection
async function shutdown(signal) {
  console.log(`${signal} received. Shutting down StaffSync...`)

  if (server) {
    server.close(async () => {
      try {
        await mongoose.disconnect()
        console.log('StaffSync shut down cleanly')
        process.exit(0)
      } catch (error) {
        console.error('Shutdown error:', error.message)
        process.exit(1)
      }
    })
  } else {
    await mongoose.disconnect().catch(() => {})
    process.exit(0)
  }
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

startServer()
