#!/usr/bin/env bash
set -o errexit

echo "📦 Setting up..."

# ✅ Render build environment ke hisaab se Java download
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH

# ✅ Pre-installed Java use karein
if command -v java &> /dev/null; then
    echo "✅ Java already installed!"
    java -version
else
    echo "⚠️ Java not found. Using system default..."
fi

# ✅ Python dependencies install
pip3 install --upgrade pip
pip3 install -r requirements.txt

echo "✅ Done!"
