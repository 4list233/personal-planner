# 🧪 Firebase Authentication Testing Guide

## Current Status
✅ Firebase SDK installed
✅ Firebase configuration files created
✅ Authentication context implemented
✅ Login page created
✅ API routes secured with authentication
✅ Notion database configured with User Email and User ID columns
✅ Environment variables configured
✅ Dev server running at http://localhost:3000

---

## Test Checklist

### Phase 1: Basic Authentication Flow

#### Test 1.1: Email/Password Sign Up
1. ✅ Visit http://localhost:3000
2. ✅ Should automatically redirect to `/login`
3. ✅ Click "Sign Up" toggle
4. ✅ Enter test email: `test@example.com`
5. ✅ Enter password: `test123456` (min 6 characters)
6. ✅ Click "Sign Up"
7. **Expected**: Redirected to main app at `/`

#### Test 1.2: Email/Password Sign In
1. ✅ Sign out (if logged in)
2. ✅ Visit http://localhost:3000/login
3. ✅ Ensure "Sign In" mode is active
4. ✅ Enter same email: `test@example.com`
5. ✅ Enter password: `test123456`
6. ✅ Click "Sign In"
7. **Expected**: Redirected to main app at `/`

#### Test 1.3: Google Sign In
1. ✅ Visit http://localhost:3000/login
2. ✅ Click "Google" button
3. ✅ Select Google account in popup
4. **Expected**: Redirected to main app at `/`
5. **Note**: May need to allow popups in browser

---

### Phase 2: Task Creation with User Linking

#### Test 2.1: Create Task as Authenticated User
1. ✅ Log in with any method (email or Google)
2. ✅ Create a new task:
   - Click "+" or "Add Task"
   - Enter title: "Test Task 1"
   - Set due date
   - Click "Save"
3. **Expected**: Task appears in your view

#### Test 2.2: Verify User Email in Notion
1. ✅ Open your Notion database
2. ✅ Find the task you just created
3. ✅ Check "User Email" column
4. **Expected**: Shows your authenticated email address
5. ✅ Check "User ID" column
6. **Expected**: Shows your Firebase UID

---

### Phase 3: Multi-User Task Isolation

#### Test 3.1: Create Second User
1. ✅ Sign out from first account
2. ✅ Go to `/login`
3. ✅ Sign up with different email: `test2@example.com`
4. ✅ Password: `test234567`

#### Test 3.2: Verify Task Isolation
1. ✅ Create a task as second user: "User 2 Task"
2. **Expected**: Only see "User 2 Task", NOT "Test Task 1"
3. ✅ Sign out and sign back in as first user
4. **Expected**: Only see "Test Task 1", NOT "User 2 Task"

#### Test 3.3: Verify in Notion
1. ✅ Open Notion database
2. **Expected**: Both tasks visible
3. ✅ Check "User Email" for each task
4. **Expected**: Different emails for each task

---

### Phase 4: Protected Routes

#### Test 4.1: Access Without Authentication
1. ✅ Sign out completely
2. ✅ Try to visit http://localhost:3000 directly
3. **Expected**: Immediately redirected to `/login`

#### Test 4.2: API Authentication
1. ✅ Open browser DevTools (F12)
2. ✅ Go to Network tab
3. ✅ Sign in and create a task
4. ✅ Look at API requests to `/api/tasks`
5. **Expected**: Request headers include `Authorization: Bearer <token>`

---

### Phase 5: Error Handling

#### Test 5.1: Wrong Password
1. ✅ Go to `/login`
2. ✅ Enter valid email but wrong password
3. **Expected**: Error message displayed

#### Test 5.2: Invalid Email Format
1. ✅ Try to sign up with `notanemail`
2. **Expected**: HTML5 validation error

#### Test 5.3: Password Too Short
1. ✅ Try to sign up with password: `12345` (5 chars)
2. **Expected**: Firebase error about password length

---

## Common Issues & Solutions

### Issue: "Unauthorized" Error
**Symptom**: API returns 401 after login
**Solution**: 
- Check that Firebase environment variables are set
- Restart dev server: `Ctrl+C` then `npm run dev`
- Clear browser cache and cookies
- Verify FIREBASE_PRIVATE_KEY has proper `\n` line breaks

### Issue: No Tasks Showing
**Symptom**: User is logged in but no tasks appear
**Solution**:
- Check browser console for errors
- Verify Notion "User Email" column exists (exact spelling)
- Check that user's email matches in Notion
- Open DevTools > Network > Check `/api/tasks` response

### Issue: Google Sign-In Popup Blocked
**Symptom**: Nothing happens when clicking Google button
**Solution**:
- Allow popups for localhost:3000 in browser settings
- Check browser console for popup blocker message

### Issue: "User email not found"
**Symptom**: Error after signing in
**Solution**:
- Some auth providers may not provide email
- Ensure you're using email/password or Google auth
- Check Firebase Console > Authentication > Users table

### Issue: Firebase Admin Error
**Symptom**: Server-side authentication fails
**Solution**:
- Verify `FIREBASE_PRIVATE_KEY` in `.env.local`
- Ensure line breaks are preserved (`\n` characters)
- Check `FIREBASE_CLIENT_EMAIL` matches service account
- Restart dev server after changing env vars

---

## Testing Screenshot Import with Auth

Once authentication is working, test the AI screenshot import:

1. ✅ Log in as a user
2. ✅ Paste a screenshot with tasks
3. ✅ Verify tasks are created
4. ✅ Check Notion - tasks should have your email
5. ✅ Sign in as different user
6. ✅ Should NOT see the first user's tasks

---

## Browser DevTools Debugging

### Check Authentication State
```javascript
// In browser console
localStorage.getItem('firebase:authUser')
```

### Check API Requests
```javascript
// In Network tab, filter by "tasks"
// Check request headers for Authorization token
// Check response for error messages
```

### Check Firebase Connection
```javascript
// In Console tab
import { auth } from '@/lib/firebase';
console.log(auth.currentUser);
```

---

## Next Steps After Testing

Once all tests pass:

1. ✅ Test with multiple users simultaneously
2. ✅ Test task CRUD operations (Create, Read, Update, Delete)
3. ✅ Test drag-and-drop with authentication
4. ✅ Test calendar view with user filtering
5. ✅ Prepare for Vercel deployment
6. ✅ Add Firebase environment variables to Vercel
7. ✅ Test authentication in production

---

## Production Deployment Checklist

Before deploying:

- [ ] All tests pass locally
- [ ] Firebase credentials added to Vercel environment variables
- [ ] Add production URL to Firebase authorized domains
- [ ] Test Google OAuth with production URL
- [ ] Verify Firestore security rules are published
- [ ] Check that `.env.local` is NOT in git
- [ ] Service account JSON is NOT in git

---

## Support & Troubleshooting

If you encounter issues:

1. Check browser console for JavaScript errors
2. Check terminal for server errors
3. Verify all environment variables are set
4. Check Firebase Console > Authentication > Users
5. Check Notion database structure
6. Review `FIREBASE_SETUP_GUIDE.md` for setup steps

---

## 🎉 Success Criteria

Your Firebase integration is working correctly when:

✅ Users can sign up with email/password
✅ Users can sign in with Google
✅ Users are redirected to /login when not authenticated
✅ Tasks show user email in Notion
✅ Each user only sees their own tasks
✅ API requests include authentication tokens
✅ Protected routes require authentication
✅ Multiple users can use the app simultaneously

---

Happy Testing! 🚀
