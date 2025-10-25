import { Router } from 'express';
import { CallController } from '../controllers/call.controller';
import { TwilioService } from '../services/twilio.service';

// Create unified routes that handle both Asterisk and Twilio calls
export default function createCallRoutes(callController: CallController, twilioService: TwilioService) {
  const router = Router();

  // ========== UNIFIED CALL MANAGEMENT ==========
  
  // Make outgoing call - automatically selects provider based on number format
  router.post('/make', callController.makeCall);
  
  // End any call (works with both providers)
  router.post('/:callId/end', callController.endCall);
  
  // Accept incoming call (primarily for Asterisk)
  router.post('/:callId/accept', callController.acceptCall);
  
  // Reject incoming call (works with both providers)
  router.post('/:callId/reject', callController.rejectCall);
  
  // ========== CALL INFORMATION ==========
  
  // Get specific call details
  router.get('/:callId', callController.getCall);
  
  // Get all calls from both providers
  router.get('/', callController.getAllCalls);
  
  // Get active connections
  router.get('/active/connections', callController.getActiveConnections);
  
  // ========== SYSTEM STATUS ==========
  
  // Get system status for both providers
  router.get('/system/status', callController.getStatus);
  
  // ========== PROVIDER-SPECIFIC ENDPOINTS ==========
  
  // Explicit Asterisk call (if you want to force Asterisk)
  router.post('/asterisk/make', (req, res) => {
    req.body.provider = 'asterisk';
    callController.makeCall(req, res);
  });
  
  // Explicit Twilio call (if you want to force Twilio)
  router.post('/twilio/make', (req, res) => {
    req.body.provider = 'twilio';
    callController.makeCall(req, res);
  });
  
  // ========== TWILIO WEBHOOKS ==========
  
  // Webhook endpoint for incoming calls from Twilio
  router.post('/twilio/webhook/incoming', async (req, res) => {
    try {
      console.log('📞 Incoming Twilio webhook:', req.body);
      
      const callId = await twilioService.handleIncomingWebhook(req);
      const twimlResponse = twilioService.generateTwiMLResponse(callId);
      
      res.type('text/xml');
      res.send(twimlResponse);
    } catch (error) {
      console.error('Error handling Twilio webhook:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // Webhook endpoint for call status updates
  router.post('/twilio/webhook/status', async (req, res) => {
    try {
      console.log('📞 Twilio status webhook:', req.body);
      
      await twilioService.handleIncomingWebhook(req);
      
      res.status(200).send('OK');
    } catch (error) {
      console.error('Error handling Twilio status webhook:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // Webhook endpoint for dial status
  router.post('/twilio/webhook/dial-status', async (req, res) => {
    try {
      console.log('📞 Twilio dial status webhook:', req.body);
      
      const twimlResponse = await twilioService.handleDialStatus(req);
      
      res.type('text/xml');
      res.send(twimlResponse);
    } catch (error) {
      console.error('Error handling Twilio dial status:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // Webhook endpoint for outgoing calls
  router.post('/twilio/webhook/outgoing-call', async (req, res) => {
    try {
      console.log('📞 Twilio outgoing call webhook:', req.body);
      
      // Generate TwiML for outgoing call
      const VoiceResponse = require('twilio').twiml.VoiceResponse;
      const response = new VoiceResponse();
      
      response.say('Hello! Your call is being connected.');
      response.dial(req.body.To);
      
      res.type('text/xml');
      res.send(response.toString());
    } catch (error) {
      console.error('Error handling outgoing call webhook:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // ========== TESTING ENDPOINTS ==========
  
  // Simulate incoming call (for testing)
  router.post('/test/simulate-incoming', callController.simulateIncomingCall);
  
  // Test endpoint to simulate call with specific provider
  router.post('/test/simulate-provider', async (req, res) => {
    try {
      const { fromNumber, provider = 'asterisk' } = req.body;
      const from = fromNumber || '+977-9876543210';
      
      const callService = callController.getCallService();
      const callId = await callService.simulateIncomingCall(from, provider as 'asterisk' | 'twilio');
      
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
  });

  return router;
}