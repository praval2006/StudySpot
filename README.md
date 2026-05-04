# StudySpotter

StudySpotter is a beginner-friendly MVP web app for University of Sydney students. It asks for browser location, recommends the nearest study spot with seats available, and lets students update spot availability in Firebase Firestore.

## Features

- Browser geolocation for live distance calculations
- "Best Study Spot Near You" recommendation card
- Recommends closest `available` location first
- Falls back to closest `busy` location if no locations are available
- Shows every study spot with status, distance, and last update time
- Status update buttons: Available, Busy, Full
- Hard-coded University of Sydney study locations seeded into Firestore
- No login, payments, maps, AI, or booking system

## Firestore

Collection: `locations`

Document example:

```json
{
  "name": "Fisher Library",
  "lat": -33.8869,
  "lng": 151.1895,
  "status": "busy",
  "updatedAt": "Firestore timestamp"
}
```

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Create a Firebase project at <https://console.firebase.google.com/>.

3. Enable Firestore Database in test mode for the MVP.

For a no-login classroom MVP, your temporary Firestore rules can allow public reads and writes:

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

Do not use those rules for a real public launch.

4. Copy the example environment file:

```bash
cp .env.local.example .env.local
```

5. Add your Firebase web app config values to `.env.local`.

6. Start the app:

```bash
npm run dev
```

7. Open <http://localhost:3000>.

The first time the app runs, it seeds the `locations` collection if it is empty.

## Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel deployment steps, Firebase environment variables, and production testing notes.
