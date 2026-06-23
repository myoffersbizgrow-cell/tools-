#!/usr/bin/env bash
set -o errexit

echo "📦 Setting up Node.js + Java..."

# Java download karo
mkdir -p java
cd java
wget -q https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.12%2B7/OpenJDK17U-jdk_x64_linux_hotspot_17.0.12_7.tar.gz
tar -xzf OpenJDK17U-jdk_x64_linux_hotspot_17.0.12_7.tar.gz
export JAVA_HOME=$(pwd)/jdk-17.0.12+7
export PATH=$JAVA_HOME/bin:$PATH
cd ..

echo "✅ Java installed:"
java -version

# ✅ Java PATH save karo for runtime
echo "✅ JAVA_HOME=$JAVA_HOME" >> $GITHUB_ENV 2>/dev/null || true
echo "✅ PATH=$PATH" >> $GITHUB_ENV 2>/dev/null || true

# Make aapt2 executable
chmod +x tools/aapt2 2>/dev/null || true

# Install Node dependencies
npm install

echo "✅ Build complete!"
