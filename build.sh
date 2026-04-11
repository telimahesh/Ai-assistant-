#!/bin/bash

# Zoya App Universal Build Script for Termux/VCode
echo "Starting Zoya App Build Process..."

# 1. Fix AAPT2 for Termux
if [ -f "/data/data/com.termux/files/usr/bin/aapt2" ]; then
    echo "Setting AAPT2 path for Termux..."
    export GRADLE_OPTS="-Dandroid.aapt2.executable=/data/data/com.termux/files/usr/bin/aapt2"
fi

# 2. Clean old builds
echo "Cleaning old build files..."
./gradlew clean

# 3. Build Debug APK
echo "Building APK..."
./gradlew assembleDebug

if [ $? -eq 0 ]; then
    echo "--------------------------------------------"
    echo "SUCCESS! APK is ready at:"
    echo "app/build/outputs/apk/debug/app-debug.apk"
    echo "--------------------------------------------"
else
    echo "BUILD FAILED! Please check the errors above."
fi
