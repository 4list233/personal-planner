#!/bin/bash

# Quick deployment script for forestli.me
# This will help you push your code to GitHub and trigger Vercel deployment

echo "🚀 Forest Planner - Quick Deploy Script"
echo "========================================"
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "❌ Git not initialized. Initializing..."
    git init
    echo "✅ Git initialized"
fi

# Check if remote exists
if ! git remote | grep -q "origin"; then
    echo ""
    echo "📝 Please enter your GitHub repository URL:"
    echo "   Format: https://github.com/YOUR-USERNAME/personal-planner.git"
    read -p "   URL: " repo_url
    git remote add origin "$repo_url"
    echo "✅ Remote added"
fi

echo ""
echo "📦 Checking for changes..."
git status

echo ""
read -p "📝 Enter commit message (or press Enter for default): " commit_msg
if [ -z "$commit_msg" ]; then
    commit_msg="Update: Deploy to forestli.me"
fi

echo ""
echo "🔄 Adding files..."
git add .

echo "💾 Committing changes..."
git commit -m "$commit_msg"

echo "⬆️  Pushing to GitHub..."
git push -u origin main || git push -u origin master

echo ""
echo "✅ Done! Your code is now on GitHub."
echo ""
echo "🌐 Next steps:"
echo "   1. Go to https://vercel.com"
echo "   2. Import your GitHub repo"
echo "   3. Add environment variables (see DEPLOYMENT.md)"
echo "   4. Deploy!"
echo ""
echo "📖 Full guide: Read DEPLOYMENT.md"
