#!/usr/bin/env bash
set -o errexit

echo "📦 Setting up Java and Python..."

# Create directories
mkdir -p tools
mkdir -p java

# Download and install Java
echo "☕ Downloading Java..."
cd java
wget -q --show-progress https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.12%2B7/OpenJDK17U-jdk_x64_linux_hotspot_17.0.12_7.tar.gz
tar -xzf OpenJDK17U-jdk_x64_linux_hotspot_17.0.12_7.tar.gz
export JAVA_HOME=$(pwd)/jdk-17.0.12+7
export PATH=$JAVA_HOME/bin:$PATH
cd ..

# Verify Java
echo "✅ Java version:"
java -version

# Download Android tools with error checking
echo "🔧 Downloading Android tools..."
cd tools

# APKTool
echo "  📥 Downloading apktool.jar..."
wget -q --show-progress -O apktool.jar https://raw.githubusercontent.com/iBotPeaches/Apktool/master/scripts/windows/apktool.bat || { echo "❌ Failed to download apktool.jar"; exit 1; }

# Bundletool
echo "  📥 Downloading bundletool.jar..."
wget -q --show-progress -O bundletool.jar https://github.com/google/bundletool/releases/download/1.16.1/bundletool-all-1.16.1.jar || { echo "❌ Failed to download bundletool.jar"; exit 1; }

# Android.jar
echo "  📥 Downloading android.jar..."
wget -q --show-progress -O android.jar https://github.com/airwire/android-platforms/raw/main/android-33.jar || { echo "❌ Failed to download android.jar"; exit 1; }

# AAPT2
echo "  📥 Downloading aapt2..."
wget -q --show-progress -O aapt2.zip https://dl.google.com/dl/android/maven2/com/android/tools/build/aapt2/7.1.0-7984345/aapt2-7.1.0-7984345-linux.zip || { echo "❌ Failed to download aapt2.zip"; exit 1; }
unzip -q aapt2.zip || { echo "❌ Failed to unzip aapt2.zip"; exit 1; }
chmod +x aapt2
rm aapt2.zip

cd ..

# Verify tools
echo "✅ Tools downloaded:"
ls -la tools/

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip3 install --upgrade pip
pip3 install -r requirements.txt

echo "✅ Build completed!"
