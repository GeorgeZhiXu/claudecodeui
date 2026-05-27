#!/usr/bin/env bash
set -e

# Initialize and build kiro-sdk submodule (required — not published to npm)
git submodule update --init --recursive
npm run build:sdk

# Install dependencies (use gcc10 on Amazon Linux 2 if available)
if command -v gcc10-g++ &>/dev/null; then
  export CC=gcc10-gcc CXX=gcc10-g++
fi

npm install
