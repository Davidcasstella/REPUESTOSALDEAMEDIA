#!/bin/bash
# ============================================================
# ChatWiFi Deploy Script
# Pulls latest code from GitHub and restarts services.
# Data in DynamoDB and S3 remains untouched.
# ============================================================
set -e

APP_DIR="/home/ubuntu/CHAT-WIFI"
BUCKET="chatwifi-storage-379611523139"

echo "🚀 Iniciando deploy..."
echo "📅 $(date)"

cd "$APP_DIR"

# 1. Backup WhatsApp session to S3 (safety net)
echo "💾 Backing up WhatsApp session to S3..."
aws s3 sync backend/session/ "s3://$BUCKET/session-backups/" --quiet 2>/dev/null || echo "⚠️ Session backup skipped"

# 2. Pull latest code from GitHub
echo "📥 Pulling latest code..."
git pull origin main

# 3. Install/update backend dependencies
echo "📦 Installing backend dependencies..."
cd backend && npm ci --production && cd ..

# 4. Build frontend
echo "🏗️ Building frontend..."
cd frontend && npm ci && npm run build && cd ..

# 5. Copy frontend build to backend public directory
echo "📂 Deploying frontend build..."
rm -rf backend/public/*
cp -r frontend/dist/* backend/public/

# 6. Restart PM2 process
echo "🔄 Restarting PM2..."
pm2 restart ecosystem.config.js --update-env

echo ""
echo "✅ Deploy completado exitosamente!"
echo "📊 Estado de PM2:"
pm2 status
