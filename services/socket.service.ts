import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { CallController } from '../controllers/call.controller';

// Create socket service with functional approach
export const createSocketService = (server: HTTPServer, callController: CallController) => {
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
      methods: ["GET", "POST"]
    }
  });

  // Setup event handlers
  const setupEventHandlers = () => {
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      // Handle SIP registration from client
      socket.on('sip-register', (data) => {
        console.log('SIP registration request:', data);
        socket.join('sip-users');
        socket.emit('sip-registered', { status: 'success' });
      });

      // Handle call acceptance from client
      socket.on('accept-call', async (data) => {
        try {
          console.log('Call accepted by client:', data);
          
          if (data.callId) {
            await callController.getCallService().acceptCall(data.callId);
          }
          
          // Notify other clients about call acceptance
          socket.broadcast.emit('call-accepted', data);
        } catch (error) {
          socket.emit('error', { message: (error as Error).message });
        }
      });

      // Handle call rejection from client
      socket.on('reject-call', async (data) => {
        try {
          console.log('Call rejected by client:', data);
          
          if (data.callId) {
            await callController.getCallService().rejectCall(data.callId);
          }
          
          socket.broadcast.emit('call-rejected', data);
        } catch (error) {
          socket.emit('error', { message: (error as Error).message });
        }
      });

      // Handle call end from client
      socket.on('end-call', async (data) => {
        try {
          console.log('Call ended by client:', data);
          
          if (data.callId) {
            await callController.getCallService().endCall(data.callId);
          }
          
          socket.broadcast.emit('call-ended', data);
        } catch (error) {
          socket.emit('error', { message: (error as Error).message });
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  };

  // Setup Asterisk event forwarding
  const setupAsteriskEventForwarding = () => {
    const asteriskService = callController.getCallService().getAsteriskService();
    
    asteriskService.on('callEvent', (callEvent) => {
      console.log('Forwarding call event to clients:', callEvent);
      
      // Emit to all connected clients
      io.emit('call-event', callEvent);
      
      // Emit specific events for easier handling on client side
      switch (callEvent.type) {
        case 'incoming':
          io.emit('incoming-call', callEvent.data);
          break;
        case 'connected':
          io.emit('call-connected', callEvent.data);
          break;
        case 'ended':
          io.emit('call-ended', callEvent.data);
          break;
        case 'failed':
          io.emit('call-failed', callEvent.data);
          break;
      }
    });
  };

  // Initialize event handlers and forwarding
  setupEventHandlers();
  setupAsteriskEventForwarding();

  return {
    // Notification functions
    notifyIncomingCall: (userId: string, callData: any) => {
      io.to(userId).emit('incoming-call', callData);
    },

    broadcastCallStatus: (callId: string, status: string, data?: any) => {
      io.emit('call-status-update', {
        callId,
        status,
        data,
        timestamp: new Date().toISOString()
      });
    },

    // Broadcast functions
    broadcastToAll: (event: string, data: any) => {
      io.emit(event, data);
    },

    broadcastToRoom: (room: string, event: string, data: any) => {
      io.to(room).emit(event, data);
    },

    // Client management functions
    getConnectedClients: (): number => {
      return io.sockets.sockets.size;
    },

    // Connection info
    getConnectionInfo: () => {
      return {
        connectedClients: io.sockets.sockets.size,
        rooms: Array.from(io.sockets.adapter.rooms.keys())
      };
    },

    // Cleanup function
    cleanup: () => {
      io.removeAllListeners();
      io.close();
    },

    // Direct access to io instance if needed
    getIO: () => io
  };
};

// Export the type for the service
export type SocketService = ReturnType<typeof createSocketService>;