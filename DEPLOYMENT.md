# StudySpotter Deployment

This app is a Next.js project and is easiest to deploy on Vercel.

## 1. Check Local Build

Run this before deploying:

```bash
npm run build
```

If the build passes locally, the Vercel build should also pass.

## 2. Firebase Requirements

StudySpotter needs these Firebase web app environment variables:

```txt
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

You can find these in Firebase Console:

Project settings -> General -> Your apps -> Firebase SDK config

## 3. Firestore Rules For MVP Demo

For a no-login MVP demo, these temporary rules allow the app to read and update study spot statuses:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /locations/{locationId} {
      allow read, write: if true;
    }
  }
}
```

Do not use these rules for a real public launch. Before sharing widely, add safer rules, anonymous auth, or rate limiting.

## 4. Deploy With Vercel Dashboard

1. Push this project to GitHub.
2. Go to <https://vercel.com/new>.
3. Import the GitHub repository.
4. Keep the framework preset as `Next.js`.
5. Add the Firebase environment variables from section 2.
6. Click `Deploy`.

After deployment, open the production URL and test:

- The location popup appears.
- Current location works.
- Typed campus location works.
- Study spots show immediately.
- Status buttons update Firestore.
- Dark/light mode persists after refresh.

## 5. Deploy With Vercel CLI

You can also deploy from the terminal:

```bash
npx vercel
```

For production:

```bash
npx vercel --prod
```

The CLI may ask you to log in, select a team, and link the project.

## 6. Add Environment Variables In Vercel CLI

If using the CLI, add each variable:

```bash
npx vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
npx vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
npx vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID
npx vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
npx vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
npx vercel env add NEXT_PUBLIC_FIREBASE_APP_ID
```

Then redeploy:

```bash
npx vercel --prod
```

## 7. Common Issues

### CSS Looks Missing

Use the production Vercel URL, or run locally at:

```txt
http://127.0.0.1:3000
```

Then hard refresh the browser.

### Study Spots Do Not Update

Check:

- Firebase environment variables are present in Vercel.
- Firestore Database is enabled.
- Firestore rules allow writes for the MVP.
- The `locations` collection exists or the app has permission to seed it.

### Location Permission Does Not Work

Browser geolocation requires HTTPS in production. Vercel provides HTTPS automatically.
