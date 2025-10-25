@echo off
echo 🚀 Setting up VoIP Backend...

cd backend

echo 📦 Installing Node.js dependencies...
npm install

echo 🔧 Installing TypeScript globally...
npm install -g typescript nodemon

echo 📋 Checking Asterisk installation...
where asterisk >nul 2>nul
if %errorlevel% == 0 (
    echo ✅ Asterisk is installed
    asterisk -V
) else (
    echo ❌ Asterisk is not installed
    echo Please install Asterisk for Windows or use WSL with Linux installation
)

echo 📁 Creating necessary directories...
if not exist logs mkdir logs
if not exist temp mkdir temp

echo 🔐 Environment setup...
if exist .env (
    echo ⚠️  .env file already exists. Please configure your settings.
) else (
    echo ✅ .env file created. Please update with your configuration.
)

echo 🎯 Building the project...
npm run build

echo.
echo 🎉 Backend setup complete!
echo.
echo Next steps:
echo 1. Install Asterisk (use WSL for Windows)
echo 2. Configure Asterisk using files in asterisk-config/
echo 3. Update .env with your DID provider settings
echo 4. Start the backend server: npm run dev
echo 5. Access the test interface at: http://localhost:3000/voip-test
echo.

pause