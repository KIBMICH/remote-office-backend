# Google OAuth Testing Guide

## Prerequisites
1. Set up Google OAuth credentials in Google Cloud Console
2. Configure your .env file with the required variables
3. Ensure your server is running on http://localhost:5000

## Testing Steps

### Method 1: Browser Testing (Recommended)
1. Start your server: `npm run dev`
2. Open browser and go to: `http://localhost:5000/api/auth/google`
3. Complete Google authentication
4. Check the callback response for JWT token and user data

### Method 2: Postman Testing
Since OAuth requires browser interaction, you can:
1. Use Postman's OAuth 2.0 authorization
2. Set Authorization Type to "OAuth 2.0"
3. Configure:
   - Grant Type: Authorization Code
   - Callback URL: http://localhost:5000/api/auth/google/callback
   - Auth URL: https://accounts.google.com/o/oauth2/auth
   - Access Token URL: https://oauth2.googleapis.com/token
   - Client ID: Your Google Client ID
   - Client Secret: Your Google Client Secret
   - Scope: profile email

### Method 3: Frontend Integration
Create a simple HTML page to test the flow:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Google OAuth Test</title>
</head>
<body>
    <h1>Test Google OAuth</h1>
    <a href="http://localhost:5000/api/auth/google">
        <button>Login with Google</button>
    </a>
</body>
</html>
```

## Expected Response
After successful authentication, you should receive:
```json
{
  "message": "Google login successful",
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "name": "User Name",
    "email": "user@email.com",
    "role": "employee"
  }
}
```

## Troubleshooting
1. Check if all environment variables are set
2. Verify Google OAuth credentials are correct
3. Ensure callback URL matches in Google Console
4. Check server logs for any errors
5. Verify MongoDB connection is working
