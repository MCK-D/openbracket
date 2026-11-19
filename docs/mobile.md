# Native Android

The manual explicitly rejects PWA/WebView wrappers. The foundation uses a small Kotlin Android Activity with native text and button controls, system text scaling and a versioned API client. Android is the single demonstration target. This avoids maintaining two mobile platforms and does not change the T3 web structure.

## Run and test

Install Android Studio with Android SDK 35, SDK build tools 35, and JDK 17. Create an Android emulator (API 28 or higher for the demo), start the web app, then open `mobile/` in Android Studio and run the app. The debug client uses `http://10.0.2.2:3000`, the emulator alias for the host machine. Cleartext HTTP is allowed only in the debug manifest; deployed services use HTTPS.

```sh
cd mobile
./gradlew testDebugUnitTest lintDebug assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

On Windows use `gradlew.bat`. The committed Gradle wrapper verifies the distribution checksum. The first build downloads Android/Maven dependencies. Unit tests use Robolectric and cover JSON parsing plus the native screen/refresh control without a running backend.

For a real Android device, use `adb reverse tcp:3000 tcp:3000` and build with `-PapiBaseUrl=http://127.0.0.1:3000`, or provide the staging HTTPS origin:

```sh
./gradlew assembleDebug -PapiBaseUrl=https://your-staging-project.vercel.app
```

Use a production HTTPS origin for production-targeted builds. Do not put auth secrets, deploy hooks or start.gg tokens in the APK. The API base URL is a public build-time value, never a credential.

CI runs Android unit/UI tests, lint and an APK build on every PR and protected-branch push. Download `openbracket-android-<commit>` from the workflow artifacts and install it on an emulator or device. This is a debug-signed test artifact; no store publication is required.

## Remaining scope

The foundation reads public tournaments and handles loading, empty, error and refresh states. It does not authenticate, stream results, submit predictions/Pick'em, show rankings/groups, or receive notifications. Those stories need secure native session handling and their own logic/UI tests. TalkBack, dynamic text, 48dp targets, focus order and notification accessibility require a manual device audit. A recorded emulator demonstration and notification-permission flow are final-delivery work.
