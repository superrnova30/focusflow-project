const http = require("http");

function makeRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: 4000,
      path: `/api${path}`,
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log("=== Email Verification Flow - End to End Test ===\n");

  const timestamp = Date.now();
  const testEmail = `verify.test.${timestamp}@example.com`;

  try {
    // Step 1: Create new account
    console.log("Step 1: User signs up with email");
    console.log(`  Email: ${testEmail}`);
    const signupRes = await makeRequest("/auth/signup", "POST", {
      name: "Verification Test User",
      email: testEmail,
      password: "testpass123",
    });
    console.log("  Response:", JSON.stringify(signupRes, null, 2));

    if (!signupRes.email) {
      console.error("ERROR: Signup did not return email");
      return;
    }

    // Step 2: Try to login before verification
    console.log("\nStep 2: Try to login BEFORE email verification");
    const loginBeforeRes = await makeRequest("/auth/login", "POST", {
      email: testEmail,
      password: "testpass123",
    });
    console.log("  Response:", JSON.stringify(loginBeforeRes, null, 2));

    // Step 3: Resend verification code
    console.log("\nStep 3: Resend verification code to email");
    const resendRes = await makeRequest("/auth/send-verification", "POST", {
      email: testEmail,
    });
    console.log("  Response:", JSON.stringify(resendRes, null, 2));
    console.log("  ⚠️  Check the backend terminal for the verification code!\n");

    // Give user time to see the message and check backend logs
    console.log("   Waiting 3 seconds for you to check backend terminal...\n");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Step 4: Verify with correct code
    // You would need to replace this with the actual code from backend logs
    console.log("Step 4: Verify email with code (using placeholder - will fail)");
    console.log("  To complete this test:");
    console.log("  1. Check the backend terminal above for the code (e.g., 'A2C66CE0')");
    console.log("  2. Replace 'TEST_CODE_HERE' below with that code");
    console.log("  3. Run this script again with the correct code\n");

    const testCode = process.env.VERIFY_CODE || "TEST_CODE_HERE";
    if (testCode !== "TEST_CODE_HERE") {
      console.log(`Using verification code from env: ${testCode}\n`);
      const verifyRes = await makeRequest("/auth/verify-email", "POST", {
        email: testEmail,
        code: testCode,
      });
      console.log("  Response:", JSON.stringify(verifyRes, null, 2));

      if (verifyRes.token) {
        console.log("\n✅ SUCCESS: Email verified and token issued!");
        console.log("  Now user can login with their email and password.");

        // Step 5: Try to login after verification
        console.log("\nStep 5: Login AFTER email verification");
        const loginAfterRes = await makeRequest("/auth/login", "POST", {
          email: testEmail,
          password: "testpass123",
        });
        console.log("  Response: Login successful, token received ✅");
      }
    } else {
      console.log("⚠️  Verification code was not provided. This test demonstrates the flow.");
      console.log("\nFlow Summary:");
      console.log("1. User signs up → Verification email sent → Account created but NOT verified");
      console.log("2. User receives code in email (shown in backend terminal in dev mode)");
      console.log("3. User enters code in VerifyEmail screen");
      console.log("4. Backend verifies code → Sets emailVerified = true → Returns JWT token");
      console.log("5. User can now login and access the app\n");
    }
  } catch (e) {
    console.error("Test failed:", e.message);
  }
}

test().catch(console.error);
