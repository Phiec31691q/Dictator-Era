#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
SDK=/home/user/workspace/toolchain/sdk
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-35/android.jar"
mkdir -p android/build/classes android/build/dex android/build/assets android/keys release
node -e "require('sharp')('branding.svg').resize(512,512).png().toFile('android/res/drawable/icon.png')"
cp index.html style.css engine.js ui.js online.js android/build/assets/
cp -R vendor android/build/assets/
mkdir -p android/build/assets/assets
find assets -maxdepth 1 -type f \( -name '*.webp' -o -name '*.ttf' -o -name '*.txt' -o -name 'world.json' -o -name 'cells.bin' -o -name '*.wav' \) -exec cp {} android/build/assets/assets/ \;
cp -R assets/flags assets/icons android/build/assets/assets/
cp licenses.md android/build/assets/assets/licenses.md
"$BT/aapt2" compile --dir android/res -o android/build/compiled.zip
"$BT/aapt2" link -I "$JAR" --manifest android/AndroidManifest.xml --java android/build -o android/build/base.apk android/build/compiled.zip -A android/build/assets -0 wav -0 bin --auto-add-overlay
javac -source 8 -target 8 -classpath "$JAR" -d android/build/classes android/src/com/dictatorera/game/MainActivity.java
"$BT/d8" --lib "$JAR" --output android/build/dex --min-api 26 android/build/classes/com/dictatorera/game/*.class
cp android/build/base.apk android/build/unsigned.apk
(cd android/build/dex && zip -q -0 ../unsigned.apk classes.dex)
if [ ! -f android/keys/release.jks ]; then
  openssl rand -hex 24 > android/keys/.password
  chmod 600 android/keys/.password
  keytool -genkeypair -keystore android/keys/release.jks -storepass:file android/keys/.password -keypass:file android/keys/.password -alias dictator-era -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Dictator Era Local Release, O=Independent Game Build, C=TR' >/dev/null 2>&1
fi
"$BT/zipalign" -f 4 android/build/unsigned.apk android/build/aligned.apk
"$BT/apksigner" sign --ks android/keys/release.jks --ks-pass file:android/keys/.password --v4-signing-enabled false --out release/Dictator-Era-0.2.0-Online.apk android/build/aligned.apk
node finalize-size.mjs
"$BT/apksigner" verify --verbose --print-certs release/Dictator-Era-0.2.0-Online.apk
"$BT/zipalign" -c 4 release/Dictator-Era-0.2.0-Online.apk
stat -c '%n %s bytes' release/Dictator-Era-0.2.0-Online.apk
