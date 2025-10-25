import { Request, Response } from 'express';
import { createCallService, CallService } from '../services/call.service';

// Create call controller with functional approach and unified provider support
export const createCallController = () => {
  const callService = createCallService();

  // Setup event listeners for real-time updates from both providers
  const setupEventListeners = () => {
    const asteriskService = callService.getAsteriskService();
    const twilioService = callService.getTwilioService();
    
    // Listen to Asterisk events
    asteriskService.on('callEvent', (callEvent) => {
      console.log('Asterisk call event received:', callEvent);
    });

    // Listen to Twilio events
    twilioService.on('callEvent', (callEvent) => {
      console.log('Twilio call event received:', callEvent);
    });
  };

  // Initialize event listeners
  setupEventListeners();

  return {
    // Unified call initiation - automatically selects provider or uses specified one
    makeCall: async (req: Request, res: Response) => {
      try {
        const { from, to, provider } = req.body;

        if (!from || !to) {
          return res.status(400).json({
            success: false,
            message: 'From and to numbers are required'
          });
        }

        const result = await callService.initiateCall(from, to, provider);
        
        res.json({
          success: true,
          data: result
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: (error as Error).message
        });
      }
    },

    // Unified call termination - works with both providers
    endCall: async (req: Request, res: Response) => {
      try {
        const { callId } = req.params;

        if (!callId) {
          return res.status(400).json({
            success: false,
            message: 'Call ID is required'
          });
        }

        const result = await callService.endCall(callId);
        
        res.json({
          success: true,
          data: result
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: (error as Error).message
        });
      }
    },

    // Accept call (primarily for Asterisk)
    acceptCall: async (req: Request, res: Response) => {
      try {
        const { callId } = req.params;

        if (!callId) {
          return res.status(400).json({
            success: false,
            message: 'Call ID is required'
          });
        }

        const result = await callService.acceptCall(callId);
        
        res.json({
          success: true,
          data: result
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: (error as Error).message
        });
      }
    },

    // Reject call (works with both providers)
    rejectCall: async (req: Request, res: Response) => {
      try {
        const { callId } = req.params;

        if (!callId) {
          return res.status(400).json({
            success: false,
            message: 'Call ID is required'
          });
        }

        const result = await callService.rejectCall(callId);
        
        res.json({
          success: true,
          data: result
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: (error as Error).message
        });
      }
    },

    // Get call details
    getCall: async (req: Request, res: Response) => {
      try {
        const { callId } = req.params;
        const call = await callService.getCall(callId);

        if (!call) {
          return res.status(404).json({
            success: false,
            message: 'Call not found'
          });
        }

        res.json({
          success: true,
          data: call
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: (error as Error).message
        });
      }
    },

    // Get all calls from both providers
    getAllCalls: async (req: Request, res: Response) => {
      try {
        const calls = await callService.getAllCalls();
        
        res.json({
          success: true,
          data: calls
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: (error as Error).message
        });
      }
    },

    // Get active connections from both providers
    getActiveConnections: async (req: Request, res: Response) => {
      try {
        const connections = await callService.getActiveConnections();
        
        res.json({
          success: true,
          data: connections
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: (error as Error).message
        });
      }
    },

    // Enhanced system status for both providers
    getStatus: async (req: Request, res: Response) => {
      try {
        const providerStatus = callService.getProviderStatus();
        const activeCalls = await callService.getActiveConnections();
        
        res.json({
          success: true,
          data: {
            timestamp: new Date().toISOString(),
            providers: providerStatus,
            activeCalls: activeCalls.length,
            callsByProvider: {
              asterisk: activeCalls.filter(call => call.provider === 'asterisk').length,
              twilio: activeCalls.filter(call => call.provider === 'twilio').length
            }
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: (error as Error).message
        });
      }
    },

    // Simulate incoming call (for testing)
    simulateIncomingCall: async (req: Request, res: Response) => {
      try {
        const { fromNumber, provider = 'asterisk' } = req.body;
        const from = fromNumber || '+977-9876543210';
        
        const callId = await callService.simulateIncomingCall(from, provider);
        
        res.json({
          success: true,
          data: {
            callId,
            message: `Incoming call simulated via ${provider}`,
            from,
            provider
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: (error as Error).message
        });
      }
    },

    // Service access functions (for integration with other services)
    getCallService: (): CallService => {
      return callService;
    },

    // Cleanup function
    cleanup: async (): Promise<void> => {
      await callService.cleanup();
    }
  };
};

// Export the type for the controller
export type CallController = ReturnType<typeof createCallController>;