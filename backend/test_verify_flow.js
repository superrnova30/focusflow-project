const http = require("http");

const API_URL = "http://localhost:4000/api";

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
  console.log("Full Email Verification Flow Test\n");

  const timestamp = Date.now();

  // Step 1: Signup
  console.log("Step 1: Signing up...");
  const signupRes = await makeRequest("/auth/signup", "POST", {
    name: "Alice Smith",
    email: `alice.${timestamp}@example.com`,
    password: "testpass123",
  });
  console.log("Signup response:", JSON.stringify(signupRes, null, 2));

  const email = signupRes.email;
  
  // The code will be logged by the server - we'll use a placeholder and update
  // In a real app, this would be sent via email
  console.log(`\nStep 2: Waiting for verification code to be logged by server...`);
  console.log("(Check the server terminal for the code generated for this email)\n");
  
  // For testing purposes, we'll wait a bit to see the code in logs
  setTimeout(() => {
    console.log("Now manually check the backend terminal for the code");
  }, 1000);
}

test().catch(console.error);
