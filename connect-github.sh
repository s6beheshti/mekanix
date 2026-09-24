#!/bin/bash
# MEKANIX — GitHub Connection Helper
# 
# This script helps you connect this project to GitHub.
#
# Prerequisites:
# 1. Create a GitHub account (if you don't have one)
# 2. Create a Personal Access Token (PAT) at:
#    https://github.com/settings/tokens/new
#    - Select scopes: repo (full), workflow
#    - Set expiration as you wish
# 3. Copy the token (starts with ghp_...)
#
# Usage:
#   ./connect-github.sh

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║     MEKANIX — GitHub Connection Helper                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check if already connected
if git remote get-url origin 2>/dev/null; then
  echo "⚠️  Already connected to: $(git remote get-url origin)"
  echo ""
  read -p "Do you want to remove and reconnect? (y/N): " RECONNECT
  if [ "$RECONNECT" != "y" ]; then
    echo "Keeping existing connection."
    exit 0
  fi
  git remote remove origin
fi

echo "📝 You need:"
echo "   1. A GitHub Personal Access Token (PAT)"
echo "      → https://github.com/settings/tokens/new"
echo "      → Select scope: repo (full)"
echo "   2. A repository name (e.g. mekanix)"
echo ""
read -p "Enter your GitHub username: " GH_USER
read -p "Enter repository name (default: mekanix): " REPO_NAME
REPO_NAME=${REPO_NAME:-mekanix}
read -p "Make repository private? (y/N): " PRIVATE
read -s -p "Enter your GitHub token (ghp_...): " GH_TOKEN
echo ""
echo ""

echo "🔧 Configuring git..."
git config user.name "$GH_USER"
git config user.email "$GH_USER@users.noreply.github.com"

echo "📦 Creating repository on GitHub..."
# Create repo via GitHub API
if [ "$PRIVATE" = "y" ]; then
  VISIBILITY="true"
else
  VISIBILITY="false"
fi

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://api.github.com/user/repos \
  -H "Authorization: token $GH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$REPO_NAME\",\"private\":$VISIBILITY,\"description\":\"MEKANIX — On-demand mobile repair & maintenance platform\"}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "201" ]; then
  echo "✅ Repository created: https://github.com/$GH_USER/$REPO_NAME"
elif [ "$HTTP_CODE" = "422" ]; then
  echo "ℹ️  Repository already exists, using it."
else
  echo "❌ Failed to create repository (HTTP $HTTP_CODE)"
  echo "$BODY" | head -5
  exit 1
fi

echo "🔗 Adding remote..."
git remote add origin "https://$GH_USER:$GH_TOKEN@github.com/$GH_USER/$REPO_NAME.git"

echo "📤 Pushing code to GitHub..."
git push -u origin main 2>&1 | tail -5

# Remove token from remote URL (security)
git remote set-url origin "https://github.com/$GH_USER/$REPO_NAME.git"

# Configure credential helper so future pushes don't need token
git config credential.helper store
echo "https://$GH_USER:$GH_TOKEN@github.com" > ~/.git-credentials
chmod 600 ~/.git-credentials

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅  SUCCESS! Your project is now on GitHub!             ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Repository: https://github.com/$GH_USER/$REPO_NAME"
echo "║                                                          ║"
echo "║  Future pushes:                                          ║"
echo "║    git add .                                             ║"
echo "║    git commit -m 'your message'                          ║"
echo "║    git push                                              ║"
echo "╚══════════════════════════════════════════════════════════╝"
