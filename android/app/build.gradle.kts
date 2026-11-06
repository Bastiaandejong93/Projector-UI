import java.util.zip.ZipFile
import java.util.zip.CRC32

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Variants share the package; G is a single continuous celestial motion trial.
val lunaTestVariant = providers.gradleProperty("lunaTestVariant").orElse("").get()
require(lunaTestVariant.isEmpty() || lunaTestVariant in setOf("", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V")) { "lunaTestVariant must be A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U or V" }

android {
    namespace = "nl.bastiaandejong.luna"
    compileSdk = 34

    defaultConfig {
        applicationId = "nl.bastiaandejong.luna"
        minSdk = 30
        targetSdk = 34
        versionCode = if (lunaTestVariant.isEmpty()) 14 else if (lunaTestVariant == "V") 13 else 12
        versionName = if (lunaTestVariant.isEmpty()) "0.4.1" else "0.3.3-$lunaTestVariant"
        manifestPlaceholders["lunaLabel"] = if (lunaTestVariant.isEmpty()) "Luna" else "Luna $lunaTestVariant"
        buildConfigField("boolean", "LUNA_GAS_TRIAL", (lunaTestVariant.isEmpty() || lunaTestVariant in setOf("B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V")).toString())
        buildConfigField("boolean", "LUNA_FLOOR_TRIAL", (lunaTestVariant.isEmpty() || lunaTestVariant in setOf("C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V")).toString())
        buildConfigField("boolean", "LUNA_STRONGER_GAS_TRIAL", (lunaTestVariant.isEmpty() || lunaTestVariant in setOf("D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V")).toString())
        buildConfigField("boolean", "LUNA_LIVING_TRIAL", (lunaTestVariant.isEmpty() || lunaTestVariant in setOf("E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V")).toString())
        buildConfigField("boolean", "LUNA_CINEMATIC_TRIAL", (lunaTestVariant.isEmpty() || lunaTestVariant in setOf("F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V")).toString())
        buildConfigField("boolean", "LUNA_ORBITAL_TRIAL", (lunaTestVariant.isEmpty() || lunaTestVariant in setOf("G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V")).toString())
    }

    buildTypes {
        // The existing projector installation uses this local signing key;
        // using it preserves the app's identity and data during the upgrade.
        getByName("release") { signingConfig = signingConfigs.getByName("debug") }
    }

    buildFeatures { buildConfig = true }

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

// Gradle's incremental asset merge can otherwise report success even when a
// web build changed its input directory while the merge was taking a snapshot.
// Verify the actual APK entries, not just the presence of dist/index.html.
tasks.matching { it.name == "assembleDebug" || it.name == "assembleRelease" }.configureEach {
    doLast {
        val dist = rootProject.file("../dist")
        val variant = if (name == "assembleRelease") "release" else "debug"
        val apk = layout.buildDirectory.file("outputs/apk/$variant/app-$variant.apk").get().asFile
        ZipFile(apk).use { zip ->
            val invalid = dist.walkTopDown().filter { it.isFile }.mapNotNull { file ->
                val path = "assets/" + file.relativeTo(dist).invariantSeparatorsPath
                val entry = zip.getEntry(path)
                val crc = CRC32()
                file.inputStream().buffered().use { input ->
                    val buffer = ByteArray(8192)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        crc.update(buffer, 0, count)
                    }
                }
                if (entry == null || entry.size != file.length() || entry.crc != crc.value) path else null
            }.toList()
            check(invalid.isEmpty()) {
                "APK has missing or stale web assets: ${invalid.take(12).joinToString()}"
            }
        }
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.10.0")
}

kotlin {
    jvmToolchain(17)
}
