plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }

// Robolectric 4.14.1 uses API 28 for TournamentTest and API 35 for compile-time resources.
// Resolve each SDK separately so Gradle keeps both versions of android-all-instrumented.
val robolectricSdks = listOf("9-robolectric-4913185-2-i7", "15-robolectric-12650502-i7").map { version ->
    configurations.detachedConfiguration(
        dependencies.create("org.robolectric:android-all-instrumented:$version@jar")
    )
}
val robolectricSdkDirectory = layout.buildDirectory.dir("robolectric-sdks")
val prepareRobolectricSdks by tasks.registering(Sync::class) {
    from(*robolectricSdks.toTypedArray())
    into(robolectricSdkDirectory)
}

android {
    namespace = "dev.openbracket"
    compileSdk = 35
    defaultConfig {
        applicationId = "dev.openbracket"
        minSdk = 28
        targetSdk = 35
        versionCode = 100
        versionName = "0.1.0"
        val apiBaseUrl = providers.gradleProperty("apiBaseUrl").orElse("http://10.0.2.2:3000").get()
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
    }
    buildFeatures { buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all { test ->
            test.dependsOn(prepareRobolectricSdks)
            test.inputs.files(prepareRobolectricSdks)
            test.systemProperty("robolectric.dependency.dir", robolectricSdkDirectory.get().asFile.absolutePath)
        }
    }
    lint { abortOnError = true }
}
dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
}
