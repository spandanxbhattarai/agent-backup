import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import dotenv from 'dotenv';
import createCallRoutes from './routes/call.routes';
import { createCallController } from './controllers/call.controller';
import { createSocketService } from './services/socket.service';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize unified services
const callController = createCallController();
const socketService = createSocketService(server, callController);

// Get services from the call controller
const callService = callController.getCallService();
const twilioService = callService.getTwilioService();

// Unified Routes - handles both Asterisk and Twilio calls
app.use('/api/calls', createCallRoutes(callController, twilioService));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: socketService.getConnectionInfo()
  });
});

// Default route with API information
app.get('/', (req, res) => {
  res.json({
    message: 'Unified VoIP Backend Server',
    version: '3.0.0',
    description: 'Supports both Asterisk and Twilio calling',
    endpoints: {
      health: '/health',
      calls: '/api/calls',
      websocket: 'ws://localhost:' + PORT
    },
    features: {
      asterisk: 'Direct SIP calling via Asterisk server',
      twilio: 'PSTN calling via Twilio service',
      autoRouting: 'Automatic provider selection based on number format',
      unifiedAPI: 'Single API for both providers'
    },
    connections: socketService.getConnectionInfo()
  });
});

// Comprehensive system status endpoint
app.get('/api/system/status', async (req, res) => {
  try {
    const providerStatus = callService.getProviderStatus();
    const activeCalls = await callService.getActiveConnections();
    
    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        providers: providerStatus,
        activeCalls: activeCalls.length,
        callsByProvider: {
          asterisk: activeCalls.filter(call => call.provider === 'asterisk').length,
          twilio: activeCalls.filter(call => call.provider === 'twilio').length
        },
        connections: socketService.getConnectionInfo()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message
    });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('🔄 Gracefully shutting down...');
  
  try {
    await callController.cleanup();
    socketService.cleanup();
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
  
  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Unified VoIP Backend Server v3.0 Started');
  console.log('='.repeat(60));
  console.log(`📞 Server running on port ${PORT}`);
  console.log(`� API endpoints: http://localhost:${PORT}/api/calls`);
  console.log(`� WebSocket: ws://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('📋 Available Features:');
  console.log('  • Unified API for Asterisk & Twilio');
  console.log('  • Automatic provider routing');
  console.log('  • Real-time call events via WebSocket');
  console.log('  • Call management (make, end, accept, reject)');
  console.log('');
  
  // Log provider status after initialization
  setTimeout(() => {
    const status = callService.getProviderStatus();
    console.log('📡 Provider Status:');
    console.log(`  • Asterisk: ${status.asterisk.connected ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`  • Twilio: ${status.twilio.available ? '✅ Available' : '❌ Not configured'}`);
    console.log(`🔌 WebSocket connections: ${socketService.getConnectionInfo().connectedClients}`);
    console.log('='.repeat(60));
  }, 3000);
});

export default app;