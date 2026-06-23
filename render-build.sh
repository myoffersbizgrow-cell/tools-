#!/usr/bin/env bash
set -o errexit

echo "📦 Setting up Java..."

# Create directories
mkdir -p java

# Download and install Java
echo "☕ Downloading Java..."
cd java
wget -q https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.12%2B7/OpenJDK17U-jdk_x64_linux_hotspot_17.0.12_7.tar.gz
tar -xzf OpenJDK17U-jdk_x64_linux_hotspot_17.0.12_7.tar.gz
export JAVA_HOME=$(pwd)/jdk-17.0.12+7
export PATH=$JAVA_HOME/bin:$PATH
cd ..

# Verify Java
echo "✅ Java version:"
java -version

# ✅ Tools already in repo
echo "✅ Tools already present:"
ls -la tools/

# Make aapt2 executable
chmod +x tools/aapt2

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip3 install --upgrade pip
pip3 install -r requirements.txt

echo "✅ Build completed!"
