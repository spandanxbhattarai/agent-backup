#!/bin/bash

echo "🚀 Setting up VoIP Backend..."

# Navigate to backend directory
cd backend

echo "📦 Installing Node.js dependencies..."
npm install

echo "🔧 Installing TypeScript globally..."
npm install -g typescript nodemon

echo "📋 Checking Asterisk installation..."
if command -v asterisk &> /dev/null; then
    echo "✅ Asterisk is already installed"
    asterisk -V
else
    echo "❌ Asterisk is not installed"
    echo "Please install Asterisk:"
    echo "  Ubuntu/Debian: sudo apt-get install asterisk"
    echo "  CentOS/RHEL: sudo yum install asterisk"
    echo "  macOS: brew install asterisk"
fi

echo "📁 Creating necessary directories..."
mkdir -p logs
mkdir -p temp

echo "🔐 Setting up environment..."
if [ ! -f .env ]; then
    echo "⚠️  .env file already exists. Please configure your settings."
else
    echo "✅ .env file created. Please update with your configuration."
fi

echo "🎯 Build the project..."
npm run build

echo ""
echo "🎉 Backend setup complete!"
echo ""
echo "Next steps:"
echo "1. Configure Asterisk using files in asterisk-config/"
echo "2. Update .env with your DID provider settings"
echo "3. Start the backend server: npm run dev"
echo "4. Access the test interface at: http://localhost:3000/voip-test"
echo ""