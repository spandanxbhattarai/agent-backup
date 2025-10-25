import twilio from 'twilio';
import { EventEmitter } from 'events';
import { Call, CallEvent } from '../types/call.types';
import { CallRepository } from '../repositories/call.repository';

const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

export const createTwilioService = (callRepository: CallRepository) => {
  const eventEmitter = new EventEmitter();
  
  // Check if Twilio credentials are available
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (!twilioSid || !twilioToken) {
    console.log('⚠️ Twilio credentials not found in environment variables. Twilio features will be disabled.');
    console.log('To enable Twilio: Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your .env file');
  }
  
  // Twilio client initialization (only if credentials are available)
  const client = twilioSid && twilioToken ? twilio(twilioSid, twilioToken) : null;

  // Handle incoming webhook from Twilio
  const handleIncomingWebhook = async (req: any): Promise<string> => {
    const { CallSid, From, To, CallStatus, Direction } = req.body;
    
    console.log('📞 Twilio webhook received:', {
      CallSid,
      From,
      To,
      CallStatus,
      Direction
    });

    const callId = CallSid || generateId();
    
    // Check if call already exists
    let existingCall = await callRepository.getCall(callId);
    
    if (!existingCall && (CallStatus === 'ringing' || CallStatus === 'in-progress')) {
      // Create new call record
      const call: Call = {
        id: callId,
        from: From,
        to: To,
        status: Direction === 'inbound' ? 'incoming' : 'outgoing',
        startTime: new Date(),
        channel: `Twilio/${CallSid}`,
        twilioCallSid: CallSid,
        provider: 'twilio'
      };

      await callRepository.createCall(call);
      
      const callEvent: CallEvent = {
        type: Direction === 'inbound' ? 'incoming' : 'outgoing',
        callId: call.id,
        data: call
      };

      eventEmitter.emit('callEvent', callEvent);
      console.log('📞 New Twilio call created:', call);
    } else if (existingCall) {
      // Update existing call status
      const updatedStatus = mapTwilioStatusToCallStatus(CallStatus);
      
      if (updatedStatus !== existingCall.status) {
        const updateData: Partial<Call> = { 
          status: updatedStatus
        };
        
        if (CallStatus === 'completed' || CallStatus === 'busy' || CallStatus === 'no-answer' || CallStatus === 'failed') {
          updateData.endTime = new Date();
          updateData.duration = existingCall.startTime ? 
            Math.floor((Date.now() - existingCall.startTime.getTime()) / 1000) : 0;
        }
        
        await callRepository.updateCall(callId, updateData);
        
        const callEvent: CallEvent = {
          type: updatedStatus === 'connected' ? 'connected' : 'ended',
          callId: callId,
          data: { status: updatedStatus, twilioStatus: CallStatus }
        };

        eventEmitter.emit('callEvent', callEvent);
        console.log('📞 Twilio call updated:', callId, 'Status:', updatedStatus);
      }
    }

    return callId;
  };

  // Generate TwiML response for incoming calls
  const generateTwiMLResponse = (callId: string): string => {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();
    
    // Play a greeting and dial to your application
    response.say('Hello! You are being connected to our restaurant system.');
    
    // Create a dial to connect to your Asterisk server
    const dial = response.dial({
      timeout: 30,
      action: `${process.env.WEBHOOK_BASE_URL}/api/twilio/webhook/dial-status`,
      method: 'POST'
    });
    
    // Dial to your Asterisk SIP endpoint
    dial.sip(`sip:1001@${process.env.ASTERISK_SIP_DOMAIN || 'localhost:5060'}`);
    
    return response.toString();
  };

  // Handle dial status from Twilio
  const handleDialStatus = async (req: any): Promise<string> => {
    const { CallSid, DialCallStatus, DialCallDuration } = req.body;
    
    console.log('📞 Twilio dial status:', {
      CallSid,
      DialCallStatus,
      DialCallDuration
    });

    if (CallSid) {
      const call = await callRepository.getCall(CallSid);
      if (call) {
        const updateData: Partial<Call> = {};
        
        if (DialCallStatus === 'completed') {
          updateData.status = 'ended';
          updateData.endTime = new Date();
          updateData.duration = Number.parseInt(DialCallDuration) || 0;
        } else if (DialCallStatus === 'busy' || DialCallStatus === 'no-answer') {
          updateData.status = 'ended';
          updateData.endTime = new Date();
        }
        
        if (Object.keys(updateData).length > 0) {
          await callRepository.updateCall(CallSid, updateData);
          
          const callEvent: CallEvent = {
            type: 'ended',
            callId: CallSid,
            data: { 
              cause: DialCallStatus,
              duration: updateData.duration 
            }
          };

          eventEmitter.emit('callEvent', callEvent);
        }
      }
    }

    // Return empty TwiML to end the call
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const response = new VoiceResponse();
    return response.toString();
  };

  // Make outgoing call through Twilio
  const makeOutgoingCall = async (from: string, to: string): Promise<string> => {
    if (!client) {
      throw new Error('Twilio client not initialized. Please check your Twilio credentials.');
    }

    try {
      const call = await client.calls.create({
        from: process.env.TWILIO_PHONE_NUMBER || from,
        to: to,
        url: `${process.env.WEBHOOK_BASE_URL}/api/twilio/webhook/outgoing-call`,
        statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/twilio/webhook/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST'
      });

      const callId = call.sid;
      
      // Create call record
      const callRecord: Call = {
        id: callId,
        from: call.from,
        to: call.to,
        status: 'outgoing',
        startTime: new Date(),
        channel: `Twilio/${call.sid}`,
        twilioCallSid: call.sid,
        provider: 'twilio'
      };

      await callRepository.createCall(callRecord);
      
      const callEvent: CallEvent = {
        type: 'outgoing',
        callId: callId,
        data: callRecord
      };

      eventEmitter.emit('callEvent', callEvent);
      console.log('📞 Twilio outgoing call initiated:', callRecord);
      
      return callId;
    } catch (error) {
      console.error('Failed to make Twilio call:', error);
      throw error;
    }
  };

  // End Twilio call
  const endTwilioCall = async (callId: string): Promise<void> => {
    if (!client) {
      throw new Error('Twilio client not initialized. Please check your Twilio credentials.');
    }

    try {
      const call = await callRepository.getCall(callId);
      if (call?.twilioCallSid) {
        await client.calls(call.twilioCallSid).update({ status: 'completed' });
        
        await callRepository.updateCall(callId, {
          status: 'ended',
          endTime: new Date()
        });
        
        const callEvent: CallEvent = {
          type: 'ended',
          callId: callId,
          data: { cause: 'hangup' }
        };

        eventEmitter.emit('callEvent', callEvent);
        console.log('📞 Twilio call ended:', callId);
      }
    } catch (error) {
      console.error('Failed to end Twilio call:', error);
      throw error;
    }
  };

  // Helper function to map Twilio status to our call status
  const mapTwilioStatusToCallStatus = (twilioStatus: string): 'incoming' | 'outgoing' | 'connected' | 'ended' | 'failed' => {
    switch (twilioStatus) {
      case 'queued':
      case 'ringing':
        return 'incoming';
      case 'in-progress':
        return 'connected';
      case 'completed':
      case 'busy':
      case 'no-answer':
      case 'failed':
      case 'canceled':
        return 'ended';
      default:
        return 'failed';
    }
  };

  // Event handling functions
  const on = (event: string, listener: (...args: any[]) => void) => {
    eventEmitter.on(event, listener);
  };

  const off = (event: string, listener: (...args: any[]) => void) => {
    eventEmitter.off(event, listener);
  };

  const emit = (event: string, ...args: any[]) => {
    eventEmitter.emit(event, ...args);
  };

  return {
    handleIncomingWebhook,
    generateTwiMLResponse,
    handleDialStatus,
    makeOutgoingCall,
    endTwilioCall,
    on,
    off,
    emit
  };
};

export type TwilioService = ReturnType<typeof createTwilioService>;