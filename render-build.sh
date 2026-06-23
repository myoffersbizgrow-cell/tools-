#!/usr/bin/env bash
set -o errexit

echo "📦 Setting up..."

# Install Java + Python
apt-get update -y
apt-get install -y openjdk-17-jdk-headless wget unzip python3-pip

# Install Python packages
pip3 install -r requirements.txt

echo "✅ Done!"
