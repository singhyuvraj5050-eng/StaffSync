# StaffSync — Functional MERN MVP

This is a functional starter MVP for an HR management system. It includes:
- React dashboard with login/register
- MongoDB + Express backend
- JWT authentication
- Roles: `hr`, `manager`, `employee`
- Employee directory (HR/admin only)
- Attendance check-in/check-out and history
- Leave request and HR/manager decision workflow
- Announcements (HR can create; signed-in users can view)
- API health endpoint

## Requirements
- Node.js LTS + npm
- MongoDB Server running locally, or a MongoDB Atlas URI
- VS Code

## Run backend
1. Open a terminal in `server`.
2. Copy `.env.example` to `.env`.
3. Set `MONGODB_URI` and a long random `JWT_SECRET`.
4. Run:
   ```bash
   npm install
   npm run dev
   ```
5. Health check: http://localhost:5000/api/health

## Run frontend
In a second terminal:
```bash
cd client
npm install
npm run dev
```
Open the Vite URL shown in the terminal (often `http://localhost:5173` or `5174`).

If the frontend runs on another port, set `CLIENT_ORIGIN` in `server/.env` to that exact origin and restart the backend.

## First account / roles
Use the Register page to create an account. For this MVP, role selection is available for local demo convenience. **Before any public deployment, remove public HR role selection and provision HR accounts securely.**

## Important limitations
This is a portfolio/demo MVP, not production HR software. Before production use, add comprehensive tests, stronger account provisioning, audit logs, CSRF protections if using cookies, email verification, password reset, policy-aware leave balances, and security review. The JWT is stored in localStorage in this demo for simplicity.
