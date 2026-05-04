const response = await fetch('https://crm-server-w6ye.onrender.com/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'TestUser', email: 'test@crm.com', password: 'password123' })
});
const data = await response.json();
console.log('Register:', response.status, data);

// Now test login
const loginRes = await fetch('https://crm-server-w6ye.onrender.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@crm.com', password: 'password123' })
});
const loginData = await loginRes.json();
console.log('Login:', loginRes.status, loginData);
