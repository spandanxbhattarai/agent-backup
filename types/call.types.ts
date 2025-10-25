export interface Call {
  id: string;
  from: string;
  to: string;
  status: 'incoming' | 'outgoing' | 'connected' | 'ended' | 'failed';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  channel?: string;
  twilioCallSid?: string; // For Twilio integration
  provider: 'asterisk' | 'twilio'; // Call provider (required)
}

export interface CallRequest {
  from: string;
  to: string;
  provider?: 'asterisk' | 'twilio'; // Optional, will auto-detect if not provided
}

export interface SipUser {
  username: string;
  password: string;
  domain: string;
  displayName?: string;
}

export interface CallEvent {
  type: 'incoming' | 'outgoing' | 'connected' | 'ended' | 'failed' | 'status_change';
  callId: string;
  data?: any;
}

export interface ProviderStatus {
  asterisk: {
    connected: boolean;
    connectionAttempts: number;
  };
  twilio: {
    available: boolean;
    configured: boolean;
  };
}