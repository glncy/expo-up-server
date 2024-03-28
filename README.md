# expo-up-server

## Description

This is a simple server package that allow you to upload Expo Updates to your custom server and cloud storage.

## Features

- Easily upload Expo Updates to your custom server and cloud storage by using [expo-up CLI]()
- Can plug in to any Node.js server. (Express, Koa, etc.) by using the provided functions. [Tested with Next.js API routes]

## Prerequisites

- Firebase Admin SDK (for now, only Firebase is supported)

## Installation

For npm users:

```bash
npm install expo-up-server
```

For yarn users:

```bash
yarn add expo-up-server
```

## Usage

For Firebase Storage, you need to initialize the Firebase Admin SDK first.

Source: [https://firebase.google.com/docs/admin/setup#initialize_the_sdk_in_non-google_environments](https://firebase.google.com/docs/admin/setup#initialize_the_sdk_in_non-google_environments)

```typescript
import { initializeApp } from "firebase-admin";

initializeApp({
  credential: applicationDefault(),
  databaseURL: "https://<DATABASE_NAME>.firebaseio.com",
  storageBucket: "<BUCKET_NAME>.appspot.com",
});

export const bucket = getStorage();
```

Then, setup Expo Up Package:

```typescript
import { ExpoUp } from "expo-up-server";
import { bucket } from "path/to/firebaseInitialize";

export const expoUp = ExpoUp({
  bucket,
  // customize file names and storage root folder if needed
  // below are the default values
  // rollbackEmbeddedFileName: "rollback_embedded"
  // rollbackFileName: "rollback",
  // storageRootFolder: "_expo_up_storage",
  // authFileName: "AUTH_TOKEN",
});
```

Use the `expoUp` functions in your server. For example, in Next.js API routes:

Please this follow this API format for the [expo-up CLI]() to work properly.

- `GET /api/expo-up` - Initialize the auth file
- `POST /api/expo-up` - Upload and rollback the Expo Updates
- `GET /api/expo-up/manifest` - Send the updates to Expo Update Client

```typescript
// app/api/expo-up/routes.ts
import { expoUp } from "path/to/expoUp";

export async function GET() {
  // This function will initialize the auth file for the first time.
  return expoUp.initializeAuthFile();
}

export async function POST(req: Request) {
  // This function will do the upload and rollback process.
  return expoUp.uploadAndRollback(req);
}
```

```typescript
// app/api/expo-up/manifest/routes.ts
export async function GET(req: Request) {
  // This function will send the updates to Expo Update Client
  return expoUp.sendUpdate(req);
}
```

After that, you can use the `expo-up CLI` to upload the Expo Updates to your server.

```bash
expo-up release --platform [android|ios] --token [your-token]
```

Learn more about the `expo-up CLI` [here]().

## Authorization Token

Once you run `GET /api/expo-up`, it will generate an auth file in cloud storage and return the token.

This file will be used to authorize the `expo-up CLI` to upload the Expo Updates to your server.

To retrieve the token, you can download the Auth file from your cloud storage.

## Authorization Token Rotation

To rotate the authorization token, visit your cloud storage and delete the auth file.

Then, run `GET /api/expo-up` again to generate a new auth file.

## Roadmap

- [x] Support for Firebase Storage
- [x] Support for Vercel Serverless Functions
- [ ] Support for AWS S3
- [ ] Unit Tests
- [ ] Authentication using Authentication Providers Like Firebase Auth, Supabase, etc.
- [ ] Add Code Signing Certificates for updates

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
