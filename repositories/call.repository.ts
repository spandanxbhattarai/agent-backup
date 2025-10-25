import { Call } from '../types/call.types';

// Create a closure to maintain the calls state
export const createCallRepository = () => {
  const calls = new Map<string, Call>();

  return {
    createCall: async (call: Call): Promise<Call> => {
      calls.set(call.id, call);
      return call;
    },

    getCall: async (id: string): Promise<Call | null> => {
      return calls.get(id) || null;
    },

    updateCall: async (id: string, updates: Partial<Call>): Promise<Call | null> => {
      const call = calls.get(id);
      if (!call) return null;

      const updatedCall = { ...call, ...updates };
      calls.set(id, updatedCall);
      return updatedCall;
    },

    getAllCalls: async (): Promise<Call[]> => {
      return Array.from(calls.values());
    },

    getActiveConnections: async (): Promise<Call[]> => {
      return Array.from(calls.values()).filter(
        call => call.status === 'connected' || call.status === 'incoming'
      );
    },

    deleteCall: async (id: string): Promise<boolean> => {
      return calls.delete(id);
    },

    // Additional utility functions
    clearAllCalls: async (): Promise<void> => {
      calls.clear();
    },

    getCallCount: async (): Promise<number> => {
      return calls.size;
    }
  };
};

// Export the type for the repository
export type CallRepository = ReturnType<typeof createCallRepository>;