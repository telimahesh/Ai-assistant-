#!/bin/bash

# Zoya App Universal Build Script for Termux/VCode
echo "Starting Zoya App Build Process..."

# 1. Fix JAVA_HOME and AAPT2 for Termux
if [ -d "/data/data/com.termux/files/usr/lib/jvm/openjdk-17" ]; then
    export JAVA_HOME="/data/data/com.termux/files/usr/lib/jvm/openjdk-17"
elif [ -n "$PREFIX" ] && [ -d "$PREFIX/lib/jvm/openjdk-17" ]; then
    export JAVA_HOME="$PREFIX/lib/jvm/openjdk-17"
fi

if [ -f "/data/data/com.termux/files/usr/bin/aapt2" ]; then
    echo "Setting AAPT2 path for Termux..."
    export GRADLE_OPTS="-Dandroid.aapt2.executable=/data/data/com.termux/files/usr/bin/aapt2"
fi

echo "Using JAVA_HOME: $JAVA_HOME"

# 2. Clean old builds
echo "Cleaning old build files..."
sh gradlew clean

# 3. Build Debug APK
echo "Building APK..."
sh gradlew assembleDebug

if [ $? -eq 0 ]; then
    echo "--------------------------------------------"
    echo "SUCCESS! APK is ready at:"
    echo "app/build/outputs/apk/debug/app-debug.apk"
    echo "--------------------------------------------"
else
    echo "BUILD FAILED! Please check the errors above."
fi
