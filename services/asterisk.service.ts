import { EventEmitter } from 'events';
import * as net from 'net';
import { Call, CallEvent } from '../types/call.types';
import { CallRepository } from '../repositories/call.repository';

// Generate unique ID function
const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

interface AmiResponse {
  Response?: string;
  ActionID?: string;
  Message?: string;
  [key: string]: any;
}

export const createAsteriskService = (callRepository: CallRepository) => {
  const eventEmitter = new EventEmitter();
  let isConnected = false;
  let connectionAttempts = 0;
  let amiSocket: net.Socket | null = null;
  let actionId = 0;
  const pendingActions = new Map<string, (response: AmiResponse) => void>();
  const maxRetries = 5;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let simulationIntervals: NodeJS.Timeout[] = [];

  const config = {
    host: process.env.ASTERISK_HOST || 'localhost',
    port: parseInt(process.env.ASTERISK_PORT || '5038'),
    username: process.env.ASTERISK_USERNAME || 'admin',
    password: process.env.ASTERISK_PASSWORD || 'asterisk'
  };

  // Generate action ID for AMI commands
  const generateActionId = (): string => {
    return `action_${++actionId}_${Date.now()}`;
  };

  // Parse AMI message
  const parseAmiMessage = (data: string): AmiResponse => {
    const lines = data.trim().split('\r\n');
    const result: AmiResponse = {};
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        result[key] = value;
      }
    }
    
    return result;
  };

  // Send AMI command
  const sendAmiCommand = (command: string, params: Record<string, any> = {}): Promise<AmiResponse> => {
    return new Promise((resolve, reject) => {
      if (!isConnected || !amiSocket) {
        reject(new Error('Not connected to Asterisk AMI'));
        return;
      }

      const actionIdValue = generateActionId();
      let message = `Action: ${command}\r\nActionID: ${actionIdValue}\r\n`;
      
      for (const [key, value] of Object.entries(params)) {
        message += `${key}: ${value}\r\n`;
      }
      
      message += '\r\n';

      // Store callback for this action
      pendingActions.set(actionIdValue, resolve);
      
      // Set timeout for the action
      setTimeout(() => {
        if (pendingActions.has(actionIdValue)) {
          pendingActions.delete(actionIdValue);
          reject(new Error(`AMI command timeout: ${command}`));
        }
      }, 10000);

      amiSocket.write(message);
    });
  };

  // Connect to Asterisk AMI
  const connectToAsterisk = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      console.log(`🔌 Attempting to connect to Asterisk AMI at ${config.host}:${config.port}...`);
      
      amiSocket = new net.Socket();
      
      amiSocket.on('connect', async () => {
        console.log('✅ Connected to Asterisk AMI');
        try {
          // Login to AMI
          await sendAmiCommand('Login', {
            Username: config.username,
            Secret: config.password
          });
          
          isConnected = true;
          connectionAttempts = 0;
          eventEmitter.emit('connect');
          setupEventListeners();
          resolve();
        } catch (error) {
          console.error('❌ Failed to login to AMI:', error);
          isConnected = false;
          reject(error);
        }
      });

      amiSocket.on('error', (error) => {
        console.error('❌ AMI connection error:', error);
        isConnected = false;
        if (connectionAttempts === 0) {
          reject(error);
        }
        scheduleReconnect();
      });

      amiSocket.on('close', () => {
        console.log('🔌 AMI connection closed');
        isConnected = false;
        scheduleReconnect();
      });

      let buffer = '';
      amiSocket.on('data', (data) => {
        buffer += data.toString();
        
        // Process complete messages (ending with \r\n\r\n)
        let messageEnd;
        while ((messageEnd = buffer.indexOf('\r\n\r\n')) !== -1) {
          const messageData = buffer.substring(0, messageEnd);
          buffer = buffer.substring(messageEnd + 4);
          
          const message = parseAmiMessage(messageData);
          handleAmiMessage(message);
        }
      });

      // Attempt connection
      amiSocket.connect(config.port, config.host);
    });
  };

  // Handle incoming AMI messages
  const handleAmiMessage = (message: AmiResponse) => {
    // Handle responses to our actions
    if (message.ActionID && pendingActions.has(message.ActionID)) {
      const callback = pendingActions.get(message.ActionID)!;
      pendingActions.delete(message.ActionID);
      callback(message);
      return;
    }

    // Handle events
    if (message.Event) {
      handleAmiEvent(message);
    }
  };

  // Handle AMI events
  const handleAmiEvent = async (event: AmiResponse) => {
    const eventType = event.Event;
    
    console.log('📡 AMI Event:', eventType, event);

    switch (eventType) {
      case 'Newchannel':
        // New channel created
        if (event.Exten && event.CallerIDNum) {
          await handleIncomingCall(event);
        }
        break;
      
      case 'Hangup':
        // Call ended
        if (event.Uniqueid) {
          await handleCallHangup(event);
        }
        break;
        
      case 'Newstate':
        // Channel state changed
        if (event.ChannelState === '6') { // Up state
          await handleCallConnected(event);
        }
        break;
    }
  };

  // Handle incoming call from AMI event
  const handleIncomingCall = async (event: AmiResponse) => {
    const callId = event.Uniqueid || generateId();
    const call: Call = {
      id: callId,
      from: event.CallerIDNum || 'Unknown',
      to: event.Exten || '1001',
      status: 'incoming',
      startTime: new Date(),
      channel: event.Channel,
      provider: 'asterisk'
    };

    await callRepository.createCall(call);
    
    const callEvent: CallEvent = {
      type: 'incoming',
      callId: call.id,
      data: call
    };

    eventEmitter.emit('callEvent', callEvent);
    console.log('📞 Incoming call via AMI:', call);
  };

  // Handle call hangup
  const handleCallHangup = async (event: AmiResponse) => {
    const callId = event.Uniqueid;
    if (!callId) return;

    const call = await callRepository.getCall(callId);
    if (call) {
      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - call.startTime.getTime()) / 1000);
      
      await callRepository.updateCall(callId, {
        status: 'ended',
        endTime,
        duration
      });
      
      const callEvent: CallEvent = {
        type: 'ended',
        callId: callId,
        data: { cause: event.Cause, duration }
      };

      eventEmitter.emit('callEvent', callEvent);
    }
  };

  // Handle call connected
  const handleCallConnected = async (event: AmiResponse) => {
    const callId = event.Uniqueid;
    if (!callId) return;

    const call = await callRepository.getCall(callId);
    if (call && call.status !== 'connected') {
      await callRepository.updateCall(callId, { status: 'connected' });
      
      const callEvent: CallEvent = {
        type: 'connected',
        callId: callId,
        data: { channel: event.Channel }
      };

      eventEmitter.emit('callEvent', callEvent);
    }
  };

  // Setup event listeners for real AMI
  const setupEventListeners = async () => {
    try {
      // Subscribe to events
      await sendAmiCommand('Events', { EventMask: 'call,system' });
      console.log('✅ Subscribed to AMI events');
    } catch (error) {
      console.error('❌ Failed to subscribe to AMI events:', error);
    }
  };

  // Schedule reconnection
  const scheduleReconnect = () => {
    if (reconnectTimer) return;
    
    connectionAttempts++;
    if (connectionAttempts >= maxRetries) {
      console.log(`❌ Max reconnection attempts (${maxRetries}) reached. Asterisk will remain disconnected.`);
      console.log(`🔄 Will continue operating in simulation mode.`);
      return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, connectionAttempts), 30000);
    console.log(`🔄 Scheduling reconnection in ${delay}ms (attempt ${connectionAttempts})`);
    
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectToAsterisk().catch(console.error);
    }, delay);
  };

  // Fallback to simulation if AMI fails
  const setupSimulatedEventListeners = () => {
    const interval = setInterval(() => {
      if (Math.random() < 0.1 && !isConnected) {
        simulateRandomIncomingCall();
      }
    }, 30000);
    
    simulationIntervals.push(interval);
  };

  // Simulate random incoming call (fallback)
  const simulateRandomIncomingCall = async () => {
    const fromNumber = '+977-98' + Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    await simulateIncomingCall(fromNumber);
  };

  // Simulate incoming call (for testing)
  const simulateIncomingCall = async (fromNumber: string, toNumber: string = '1001'): Promise<string> => {
    const callId = generateId();
    const call: Call = {
      id: callId,
      from: fromNumber,
      to: toNumber,
      status: 'incoming',
      startTime: new Date(),
      channel: `SIP/simulated-${Math.floor(Math.random() * 1000)}`,
      provider: 'asterisk'
    };

    await callRepository.createCall(call);
    
    const callEvent: CallEvent = {
      type: 'incoming',
      callId: call.id,
      data: call
    };

    eventEmitter.emit('callEvent', callEvent);
    console.log('📞 Simulated incoming call:', call);
    return callId;
  };

  // Make outgoing call
  const makeCall = async (from: string, to: string): Promise<string> => {
    const callId = generateId();
    
    try {
      if (isConnected) {
        // Use real AMI
        const response = await sendAmiCommand('Originate', {
          Channel: `SIP/${from}`,
          Context: 'default',
          Exten: to,
          Priority: 1,
          CallerID: from,
          Timeout: 30000,
          ActionID: callId
        });

        if (response.Response === 'Success') {
          console.log('📞 Real call initiated via AMI');
        } else {
          throw new Error(`AMI Originate failed: ${response.Message}`);
        }
      } else {
        // Fallback to simulation
        console.log(`📞 Simulating call from ${from} to ${to} (AMI not available)`);
      }

      const call: Call = {
        id: callId,
        from,
        to,
        status: 'outgoing',
        startTime: new Date(),
        channel: `SIP/${from}-${Math.floor(Math.random() * 1000)}`,
        provider: 'asterisk'
      };

      await callRepository.createCall(call);
      
      const callEvent: CallEvent = {
        type: 'outgoing',
        callId: call.id,
        data: call
      };

      eventEmitter.emit('callEvent', callEvent);
      return callId;
    } catch (error) {
      console.error('Failed to make call:', error);
      throw error;
    }
  };

  // Hangup call
  const hangupCall = async (callId: string): Promise<void> => {
    const call = await callRepository.getCall(callId);
    if (!call || !call.channel) {
      throw new Error('Call not found or no channel');
    }

    try {
      if (isConnected) {
        await sendAmiCommand('Hangup', {
          Channel: call.channel
        });
      }
      
      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - call.startTime.getTime()) / 1000);
      
      await callRepository.updateCall(callId, {
        status: 'ended',
        endTime,
        duration
      });
      
      const callEvent: CallEvent = {
        type: 'ended',
        callId: callId,
        data: { cause: 'hangup', duration }
      };

      eventEmitter.emit('callEvent', callEvent);
      console.log('📞 Call hung up:', callId);
    } catch (error) {
      console.error('Failed to hangup call:', error);
      throw error;
    }
  };

  // Accept incoming call
  const acceptCall = async (callId: string): Promise<void> => {
    const call = await callRepository.getCall(callId);
    if (!call) {
      throw new Error('Call not found');
    }

    if (call.status !== 'incoming') {
      throw new Error('Call is not in incoming state');
    }

    await callRepository.updateCall(callId, { status: 'connected' });
    
    const callEvent: CallEvent = {
      type: 'connected',
      callId: call.id,
      data: { channel: call.channel }
    };

    eventEmitter.emit('callEvent', callEvent);
    console.log('📞 Call accepted:', callId);
  };

  // Reject incoming call
  const rejectCall = async (callId: string): Promise<void> => {
    const call = await callRepository.getCall(callId);
    if (!call) {
      throw new Error('Call not found');
    }

    if (call.status !== 'incoming') {
      throw new Error('Call is not in incoming state');
    }

    if (isConnected && call.channel) {
      try {
        await sendAmiCommand('Hangup', {
          Channel: call.channel
        });
      } catch (error) {
        console.error('Failed to hangup channel via AMI:', error);
      }
    }

    const endTime = new Date();
    await callRepository.updateCall(callId, {
      status: 'ended',
      endTime
    });
    
    const callEvent: CallEvent = {
      type: 'ended',
      callId: callId,
      data: { cause: 'rejected' }
    };

    eventEmitter.emit('callEvent', callEvent);
    console.log('📞 Call rejected:', callId);
  };

  // Get connection status
  const getConnectionStatus = (): boolean => {
    return isConnected;
  };

  // Reconnect function
  const reconnect = () => {
    connectionAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    connectToAsterisk().catch(console.error);
  };

  // Cleanup function
  const cleanup = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    
    simulationIntervals.forEach(interval => clearInterval(interval));
    simulationIntervals = [];
    
    if (amiSocket) {
      amiSocket.destroy();
      amiSocket = null;
    }
    
    pendingActions.clear();
    eventEmitter.removeAllListeners();
    isConnected = false;
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

  // Initialize connection
  connectToAsterisk().catch((error) => {
    console.error('❌ Failed to connect to Asterisk AMI, falling back to simulation:', error);
    setupSimulatedEventListeners();
  });

  return {
    // Core call functions
    makeCall,
    hangupCall,
    acceptCall,
    rejectCall,
    
    // Connection functions
    getConnectionStatus,
    reconnect,
    cleanup,
    
    // Event functions
    on,
    off,
    emit,
    
    // Testing functions
    simulateIncomingCall,
    
    // AMI functions
    sendAmiCommand,
    
    // Getters
    get isConnected() { return isConnected; },
    get connectionAttempts() { return connectionAttempts; }
  };
};

// Export the type for the service
export type AsteriskService = ReturnType<typeof createAsteriskService>;