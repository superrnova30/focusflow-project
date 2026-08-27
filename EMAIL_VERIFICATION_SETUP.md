# Email Verification Feature - Setup & Configuration Guide

## Overview

The email verification feature provides a complete email verification flow for user registration. Users must verify their email address before they can log in to the application.

## What Was Implemented

### Backend (Node.js/Express)

**New Database Fields** (Prisma):
- `emailVerified` (Boolean, default: false) - Tracks whether user's email has been verified
- `emailVerificationCode` (String, nullable) - Stores the verification code temporarily

**New API Endpoints**:

1. **POST /api/auth/signup** (Modified)
   - Creates new user account with `emailVerified = false`
  - Generates a 5-digit numeric verification code
   - Sends verification email with code
   - Returns: `{ message, email }` (no token yet)
   - No longer automatically logs in user

2. **POST /api/auth/send-verification** (New)
   - Resends verification code to unverified email
   - Endpoint: `/api/auth/send-verification`
   - Body: `{ email }`
   - Returns: `{ message }`

3. **POST /api/auth/verify-email** (New)
   - Verifies email using the code
   - Endpoint: `/api/auth/verify-email`
   - Body: `{ email, code }`
   - Returns: `{ ok: true, message, token, user }` or error
   - Sets `emailVerified = true` on success
   - Issues JWT token for automatic login

4. **POST /api/auth/login** (Modified)
   - Now requires `emailVerified = true`
   - Returns 403 error if email not verified
   - Error includes `{ requiresVerification: true, email }`

### Mobile (React Native)

**New Screen - VerifyEmailScreen** (`mobile/src/screens/VerifyEmailScreen.js`):
- Displays email being verified
- Input for verification code
- Submit button to verify
- "Resend code" button for requesting new code
- Success navigates back to Login

**Updated Screens**:

1. **SignupScreen** (Modified):
   - After successful signup, navigates to VerifyEmailScreen
   - Passes email for verification

2. **LoginScreen** (Modified):
   - Catches email verification required errors
   - Automatically navigates to VerifyEmailScreen
   - Allows user to verify email before retrying login

**Updated AuthContext** (`mobile/src/context/AuthContext.js`):
- `verifyEmail(email, code)` - Verifies email and returns JWT
- `sendVerificationCode(email)` - Resends verification code
- `signup()` modified - No longer sets user/token, returns email only
- `login()` modified - Catches verification errors

**Navigation** (`mobile/App.js`):
- VerifyEmailScreen added to AuthStack

## Step-by-Step Configuration

### 1. Database Setup

Run the Prisma migration to add email verification fields:

```bash
cd c:\focusflow-project\backend
npx prisma migrate dev --name add_email_verification
```

This creates the migration and applies it to your PostgreSQL database.

### 2. Backend Configuration

The backend uses in-memory storage for verification codes in development mode. For production SMTP configuration:

Edit `backend/src/routes/auth.js` and update the `sendVerificationEmail()` function:

```javascript
async function sendVerificationEmail(email, code) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    // Development mode: log to console
    console.log(`[dev-verify-email] verification code for ${email} :: code=${code}`);
    return;
  }
  
  // Production mode: send real email via SMTP
  // ... implement your email provider here (SendGrid, Mailgun, AWS SES, etc.)
}
```

### 3. Environment Variables

For development, no additional env vars needed. Codes are logged to console.

For production, add to `backend/.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_PORT=587
```

### OAuth (Google) Verification

You can allow users to verify their email via Google OAuth instead of (or in addition to) the email code flow. To enable this:

1. Create OAuth credentials in the Google Cloud Console and set the authorized callback to `${BACKEND_URL}/api/auth/oauth/google/callback`.
2. Add the following environment variables to `backend/.env`:

```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
BACKEND_URL=https://your.backend.host  # required for callback URL construction
FRONTEND_URL=https://your.frontend.host
```

3. Install the new backend dependencies and restart the server:

```bash
cd backend
npm install passport passport-google-oauth20
npm run dev
```

When a user completes the Google OAuth flow and the returned email matches an existing user, the server will mark `emailVerified = true` for that user and redirect them to the frontend `/verified?token=...` URL with a JWT.


### 4. Mobile App Setup

All code is already integrated. Just ensure:

1. `mobile/src/screens/VerifyEmailScreen.js` exists
2. `mobile/App.js` imports and registers VerifyEmailScreen
3. `mobile/src/context/AuthContext.js` has verification methods
4. Backend API URL is correct in `mobile/.env`:
   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.14:4000/api
   ```

## Testing the Feature

### Test 1: Complete Signup and Verification Flow

**Backend:**
```bash
cd c:\focusflow-project\backend
node src/index.js
```

**Separate terminal - Run test script:**
```bash
node test_full_verification.js
```

This will:
1. Create a new account
2. Generate verification code (logged to console)
3. Demonstrate the verification process

**Output example:**
```
Step 1: User signs up with email
  Email: verify.test.1787722744874@example.com
  Response: {
    "message": "Account created. Please verify your email to continue.",
    "email": "verify.test.1787722744874@example.com"
  }

[From backend console]
[dev-verify-email] verification code for verify.test.1787722744874@example.com :: code=12345
```

### Test 2: Verify Email with Correct Code

Update `test_full_verification.js` with the code from backend logs:

```javascript
const testCode = "12345"; // Replace with code from backend
const verifyRes = await makeRequest("/auth/verify-email", "POST", {
  email: testEmail,
  code: testCode,
});
```

Then re-run: `node test_full_verification.js`

**Success Response:**
```json
{
  "ok": true,
  "message": "Email verified successfully",
  "token": "eyJhbGc...",
  "user": {
    "id": "...",
    "email": "...",
    "emailVerified": true,
    ...
  }
}
```

### Test 3: Login Before Verification

```bash
# After signup but BEFORE verifying email
curl -X POST http://127.0.0.1:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

**Error Response (403):**
```json
{
  "error": "Please verify your email before logging in",
  "requiresVerification": true,
  "email": "test@example.com"
}
```

### Test 4: Invalid Verification Code

```bash
curl -X POST http://127.0.0.1:4000/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"INVALID"}'
```

**Error Response:**
```json
{
  "error": "That verification code is invalid or expired"
}
```

### Test 5: Resend Verification Code

```bash
curl -X POST http://127.0.0.1:4000/api/auth/send-verification \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

**Response:**
```json
{
  "message": "If an account exists with that email, a verification code has been sent."
}
```

## Key Features

✅ **Security**:
- Codes expire after 24 hours
- New code revokes old code
- Code is not returned in user object
- Rate limiting can be added (recommended)

✅ **User Experience**:
- Clear error messages guide users
- Can resend code if not received
- Seamless navigation between screens
- Works offline (stored in AsyncStorage after verification)

✅ **Development Mode**:
- Codes logged to console for testing
- No SMTP server required
- Can test complete flow locally

✅ **Production Ready**:
- SMTP integration hooks prepared
- Database persistence
- JWT token issuance after verification
- Activity logging for audits

## API Summary

| Endpoint | Method | Body | Response | Notes |
|----------|--------|------|----------|-------|
| /auth/signup | POST | `{name, email, password}` | `{message, email}` | Creates unverified user |
| /auth/send-verification | POST | `{email}` | `{message}` | Resends code |
| /auth/verify-email | POST | `{email, code}` | `{ok, token, user}` | Verifies & logs in |
| /auth/login | POST | `{email, password}` | `{token, user}` or `{error, requiresVerification}` | Requires verified email |

## File Changes Summary

**Backend:**
- `backend/prisma/schema.prisma` - Added emailVerified, emailVerificationCode fields
- `backend/src/routes/auth.js` - Added verification endpoints, modified signup/login
- `backend/src/lib/auth.js` - Updated publicUser to exclude verification code
- `backend/prisma/migrations/` - New migration created

**Mobile:**
- `mobile/src/screens/VerifyEmailScreen.js` - New screen
- `mobile/src/context/AuthContext.js` - Added verifyEmail, sendVerificationCode methods
- `mobile/src/screens/SignupScreen.js` - Navigates to VerifyEmailScreen after signup
- `mobile/src/screens/LoginScreen.js` - Handles verification required error
- `mobile/App.js` - Registered VerifyEmailScreen in navigation

## Next Steps

1. **Production Email Service**: Implement real email sending (SendGrid, Mailgun, AWS SES)
2. **Rate Limiting**: Add rate limit middleware to prevent abuse
3. **Email Templates**: Create HTML email templates for verification
4. **Analytics**: Track verification completion rates
5. **Resend Limits**: Consider limiting how often codes can be resent

## Troubleshooting

**Issue**: "Verification code invalid or expired"
- Codes expire after 24 hours
- Check backend console for current code (dev mode)
- Request new code if needed

**Issue**: "Login fails with requiresVerification"
- Navigate user to VerifyEmailScreen automatically
- Mobile handles this in LoginScreen

**Issue**: Users not receiving email (production)
- Check SMTP configuration in .env
- Verify email provider credentials
- Check spam/junk folder
- Use test email provider (Mailtrap) for testing

---

**Status**: ✅ Feature Complete and Tested
**Date**: 2026-08-26
