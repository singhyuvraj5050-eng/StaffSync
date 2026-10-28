import test from 'node:test'
import assert from 'node:assert/strict'

const API =
  process.env.STAFFSYNC_API ||
  'http://127.0.0.1:5000/api'

const employeeToken =
  process.env.STAFFSYNC_EMPLOYEE_TOKEN

test('health endpoint responds successfully', async () => {
  const response = await fetch(`${API}/health`)

  assert.equal(response.status, 200)
})

test('employee list rejects requests without a token', async () => {
  const response = await fetch(`${API}/employees`)

  assert.equal(response.status, 401)
})

test(
  'employee cannot access the HR-only employee list',
  { skip: !employeeToken },
  async () => {
    const response = await fetch(`${API}/employees`, {
      headers: {
        Authorization: `Bearer ${employeeToken}`,
      },
    })

    assert.equal(response.status, 403)
  }
)

test('notifications endpoint requires authentication', async () => {
  const response = await fetch(`${API}/notifications`)

  assert.equal(response.status, 401)
})