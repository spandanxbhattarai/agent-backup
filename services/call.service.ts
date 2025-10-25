import { createAsteriskService, AsteriskService } from './asterisk.service';
import { createTwilioService, TwilioService } from './twilio.service';
import { createCallRepository, CallRepository } from '../repositories/call.repository';
import { Call, CallRequest, ProviderStatus } from '../types/call.types';

// Unified call service that manages both Asterisk and Twilio
export const createCallService = () => {
  const callRepository = createCallRepository();
  const asteriskService = createAsteriskService(callRepository);
  const twilioService = createTwilioService(callRepository);

  // Helper function to determine provider based on phone number or explicit provider
  const determineProvider = (request: CallRequest): 'asterisk' | 'twilio' => {
    // If provider is explicitly specified, use it
    if (request.provider) {
      return request.provider;
    }

    // Auto-detect based on phone number format
    // If 'to' number starts with '+' or contains country code, use Twilio
    // Otherwise, use Asterisk for internal extensions
    if (request.to.startsWith('+') || request.to.length > 6) {
      return 'twilio';
    }
    
    return 'asterisk';
  };

  // Helper function to get provider status
  const getProviderStatus = (): ProviderStatus => {
    return {
      asterisk: {
        connected: asteriskService.getConnectionStatus(),
        connectionAttempts: asteriskService.connectionAttempts
      },
      twilio: {
        available: !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN,
        configured: !!process.env.TWILIO_PHONE_NUMBER
      }
    };
  };

  return {
    // Unified call initiation - automatically routes to appropriate provider
    initiateCall: async (from: string, to: string, provider?: 'asterisk' | 'twilio'): Promise<{ callId: string; message: string; provider: string }> => {
      try {
        const callRequest: CallRequest = { from, to, provider };
        const selectedProvider = determineProvider(callRequest);
        
        let callId: string;
        
        if (selectedProvider === 'twilio') {
          callId = await twilioService.makeOutgoingCall(from, to);
        } else {
          callId = await asteriskService.makeCall(from, to);
        }

        return {
          callId,
          message: `Call initiated successfully via ${selectedProvider}`,
          provider: selectedProvider
        };
      } catch (error) {
        throw new Error(`Failed to initiate call: ${(error as Error).message}`);
      }
    },

    // Unified call termination - works with both providers
    endCall: async (callId: string): Promise<{ message: string }> => {
      try {
        const call = await callRepository.getCall(callId);
        if (!call) {
          throw new Error('Call not found');
        }

        if (call.provider === 'twilio') {
          await twilioService.endTwilioCall(callId);
        } else {
          await asteriskService.hangupCall(callId);
        }

        return {
          message: `Call ended successfully via ${call.provider}`
        };
      } catch (error) {
        throw new Error(`Failed to end call: ${(error as Error).message}`);
      }
    },

    // Accept incoming call (primarily for Asterisk)
    acceptCall: async (callId: string): Promise<{ message: string }> => {
      try {
        const call = await callRepository.getCall(callId);
        if (!call) {
          throw new Error('Call not found');
        }

        if (call.provider === 'asterisk') {
          await asteriskService.acceptCall(callId);
        } else {
          throw new Error('Twilio calls are automatically handled by webhooks');
        }

        return {
          message: 'Call accepted successfully'
        };
      } catch (error) {
        throw new Error(`Failed to accept call: ${(error as Error).message}`);
      }
    },

    // Reject incoming call
    rejectCall: async (callId: string): Promise<{ message: string }> => {
      try {
        const call = await callRepository.getCall(callId);
        if (!call) {
          throw new Error('Call not found');
        }

        if (call.provider === 'asterisk') {
          await asteriskService.rejectCall(callId);
        } else {
          await twilioService.endTwilioCall(callId);
        }

        return {
          message: 'Call rejected successfully'
        };
      } catch (error) {
        throw new Error(`Failed to reject call: ${(error as Error).message}`);
      }
    },

    // Call data functions (unchanged)
    getCall: async (callId: string): Promise<Call | null> => {
      return await callRepository.getCall(callId);
    },

    getAllCalls: async (): Promise<Call[]> => {
      return await callRepository.getAllCalls();
    },

    getActiveConnections: async (): Promise<Call[]> => {
      return await callRepository.getActiveConnections();
    },

    // Enhanced system status with both providers
    getProviderStatus: (): ProviderStatus => {
      return getProviderStatus();
    },

    // Legacy compatibility method
    getConnectionStatus: (): { asterisk: boolean; twilio: boolean } => {
      const status = getProviderStatus();
      return {
        asterisk: status.asterisk.connected,
        twilio: status.twilio.available
      };
    },

    // Testing functions
    simulateIncomingCall: async (fromNumber: string, provider: 'asterisk' | 'twilio' = 'asterisk'): Promise<string> => {
      if (provider === 'asterisk') {
        return await asteriskService.simulateIncomingCall(fromNumber);
      } else {
        // For Twilio, we can't easily simulate incoming calls, so we'll create a call record
        throw new Error('Twilio incoming call simulation not supported - use real webhook');
      }
    },

    // Service access functions (for integration with other services)
    getAsteriskService: (): AsteriskService => {
      return asteriskService;
    },

    getTwilioService: (): TwilioService => {
      return twilioService;
    },

    getCallRepository: (): CallRepository => {
      return callRepository;
    },

    // Cleanup function
    cleanup: async (): Promise<void> => {
      asteriskService.cleanup();
      await callRepository.clearAllCalls();
    }
  };
};

// Export the type for the service
export type CallService = ReturnType<typeof createCallService>;