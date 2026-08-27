const fetch = require("node-fetch");

const API_URL = "http://localhost:4000/api";

async function test() {
  console.log("Testing Email Verification Flow\n");

  // Step 1: Signup
  console.log("Step 1: Signup with new email");
  const signupRes = await fetch(`${API_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Test User",
      email: "testuser@example.com",
      password: "password123",
    }),
  });
  const signupData = await signupRes.json();
  console.log("Response:", JSON.stringify(signupData, null, 2));

  if (!signupData.email) {
    console.error("Signup failed, no email in response");
    return;
  }

  const email = signupData.email;
  console.log(`Email: ${email}\n`);

  // Step 2: Send verification code
  console.log("Step 2: Send verification code");
  const sendRes = await fetch(`${API_URL}/auth/send-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const sendData = await sendRes.json();
  console.log("Response:", JSON.stringify(sendData, null, 2));
  console.log();

  // For testing, we need to check the server logs for the code
  console.log("(Check server logs for verification code)\n");

  // Step 3: Try verifying with a test code
  console.log("Step 3: Verify email with code");
  const verifyRes = await fetch(`${API_URL}/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code: "12345" }),
  });
  const verifyData = await verifyRes.json();
  console.log("Response (with fake code):", JSON.stringify(verifyData, null, 2));
}

test().catch(console.error);
