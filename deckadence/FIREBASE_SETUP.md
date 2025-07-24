# Firebase Authentication Setup for Deckadence

## Overview
This guide will help you set up Firebase authentication with email/password and Google providers for your Deckadence application.

## Prerequisites
- Firebase project created
- Firebase Authentication enabled
- Google Cloud Console project (for Google Sign-In)

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or select an existing project
3. Follow the setup wizard

## Step 2: Enable Authentication

1. In your Firebase project, go to **Authentication** in the left sidebar
2. Click **Get started**
3. Go to the **Sign-in method** tab
4. Enable the following providers:
   - **Email/Password**
   - **Google**

### Email/Password Setup
- Click on **Email/Password**
- Enable **Email/Password** provider
- Click **Save**

### Google Setup
- Click on **Google**
- Enable **Google** provider
- Add your authorized domain (localhost for development)
- Click **Save**

## Step 3: Get Firebase Configuration

1. In your Firebase project, go to **Project settings** (gear icon)
2. Scroll down to **Your apps** section
3. Click **Add app** and select **Web**
4. Register your app with a nickname
5. Copy the Firebase configuration object

## Step 4: Update Firebase Configuration

1. Open `src/firebase.js`
2. Replace the placeholder configuration with your actual Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-messaging-sender-id",
  appId: "your-app-id"
};
```

## Step 5: Install Dependencies

Run the following command in your project directory:

```bash
npm install
```

This will install the Firebase SDK that's already added to package.json.

## Step 6: Set Up Firestore Database

1. In your Firebase project, go to **Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (for development)
4. Select a location for your database

## Step 7: Configure Security Rules

### Firestore Rules
Update your Firestore security rules to allow authenticated users to access their data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Users can read/write their own tracks
    match /tracks/{trackId} {
      allow read, write: if request.auth != null && 
        resource.data.uploaderID == request.auth.uid;
    }
  }
}
```

### Storage Rules (Optional)
If you plan to use Firebase Storage for audio files:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /audio/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && 
        request.auth.uid == userId;
    }
  }
}
```

## Step 8: Test the Authentication

1. Start your development server: `npm start`
2. Navigate to your app
3. Click "Get Started"
4. Try signing up with email/password
5. Try signing in with Google
6. Test the guest mode

## Features Implemented

### Authentication Methods
- ✅ Email/Password sign up and sign in
- ✅ Google OAuth sign in
- ✅ Guest mode (no authentication required)
- ✅ Automatic user profile creation in Firestore

### User Management
- ✅ User profiles stored in Firestore
- ✅ Automatic profile creation for new users
- ✅ User authentication state management
- ✅ Secure logout functionality

### Error Handling
- ✅ Comprehensive error messages
- ✅ Loading states during authentication
- ✅ Form validation
- ✅ Password confirmation validation

### Security
- ✅ Firebase Authentication security
- ✅ Firestore security rules
- ✅ User data isolation

## User Data Structure

When a user signs up, a document is created in the `users` collection with the following structure:

```javascript
{
  uid: "user-id",
  email: "user@example.com",
  displayName: "User Name",
  photoURL: "https://...", // For Google users
  createdAt: Timestamp,
  lastLogin: Timestamp,
  trackCount: 0,
  isGuest: false
}
```

## Troubleshooting

### Common Issues

1. **"Firebase App named '[DEFAULT]' already exists"**
   - Make sure you're not initializing Firebase multiple times

2. **"Permission denied" errors**
   - Check your Firestore security rules
   - Ensure the user is authenticated

3. **Google Sign-In not working**
   - Verify your authorized domains in Firebase Console
   - Check that Google provider is enabled

4. **"auth/unauthorized-domain" error**
   - Add your domain to authorized domains in Firebase Console
   - For development, add `localhost`

### Development vs Production

- **Development**: Use `localhost` in authorized domains
- **Production**: Add your actual domain to authorized domains
- **Testing**: Use Firebase Emulator Suite for local testing

## Next Steps

1. **Customize User Profiles**: Add more fields to user documents
2. **Implement Password Reset**: Add "Forgot Password" functionality
3. **Add Email Verification**: Require email verification for new accounts
4. **Implement User Roles**: Add admin/user roles
5. **Add Social Providers**: Implement Facebook, Twitter, etc.
6. **Add Two-Factor Authentication**: Implement 2FA for enhanced security

## Security Best Practices

1. **Never expose API keys in client-side code** (Firebase handles this securely)
2. **Use Firestore security rules** to protect user data
3. **Implement proper error handling** to avoid exposing sensitive information
4. **Use HTTPS in production** (Firebase requires this)
5. **Regularly review Firebase security rules**
6. **Monitor authentication logs** in Firebase Console 