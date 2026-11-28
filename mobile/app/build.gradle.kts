plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
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
    testOptions { unitTests.isIncludeAndroidResources = true }
    lint { abortOnError = true }
}
dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
}
