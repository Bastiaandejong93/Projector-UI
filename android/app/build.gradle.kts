plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "nl.bastiaandejong.luna"
    compileSdk = 34

    defaultConfig {
        applicationId = "nl.bastiaandejong.luna"
        minSdk = 30
        targetSdk = 34
        versionCode = 8
        versionName = "0.2.6"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets {
        getByName("main").assets.srcDir(rootProject.file("../dist"))
    }
}

val verifyLunaAssets by tasks.registering {
    doLast {
        check(rootProject.file("../dist/index.html").isFile) {
            "Run the Luna web build before assembling the Android app."
        }
    }
}

tasks.named("preBuild").configure {
    dependsOn(verifyLunaAssets)
}

dependencies {
    implementation("androidx.webkit:webkit:1.10.0")
}

kotlin {
    jvmToolchain(17)
}
