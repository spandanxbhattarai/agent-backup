#!/usr/bin/env node

/**
 * VoIP System Test Script
 * Tests both Twilio webhook integration and Asterisk AMI connection
 */

const axios = require('axios');
const WebSocket = require('ws');

const BASE_URL = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001';

async function testSystemStatus() {
  console.log('🔍 Testing system status...');
  try {
    const response = await axios.get(`${BASE_URL}/api/system/status`);
    console.log('✅ System Status:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ System status test failed:', error.message);
    return null;
  }
}

async function testSimulateCall() {
  console.log('📞 Testing call simulation...');
  try {
    const response = await axios.post(`${BASE_URL}/api/test/simulate-call`, {
      fromNumber: '+977-9876543210'
    });
    console.log('✅ Call simulation successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Call simulation failed:', error.message);
    return null;
  }
}

async function testAsteriskCall() {
  console.log('📞 Testing Asterisk call...');
  try {
    const response = await axios.post(`${BASE_URL}/api/calls/asterisk/make`, {
      from: '1001',
      to: '1002'
    });
    console.log('✅ Asterisk call test successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Asterisk call test failed:', error.message);
    return null;
  }
}

async function testTwilioWebhook() {
  console.log('📞 Testing Twilio webhook simulation...');
  try {
    // Simulate Twilio webhook payload
    const twilioPayload = {
      CallSid: 'CA' + Math.random().toString(36).substr(2, 9),
      From: '+1234567890',
      To: '+1987654321',
      CallStatus: 'ringing',
      Direction: 'inbound'
    };

    const response = await axios.post(`${BASE_URL}/api/twilio/webhook/incoming`, twilioPayload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    console.log('✅ Twilio webhook test successful');
    return response.data;
  } catch (error) {
    console.error('❌ Twilio webhook test failed:', error.message);
    return null;
  }
}

function testWebSocket() {
  return new Promise((resolve) => {
    console.log('🔌 Testing WebSocket connection...');
    const ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
      console.log('✅ WebSocket connected successfully');
      ws.close();
      resolve(true);
    });
    
    ws.on('error', (error) => {
      console.error('❌ WebSocket connection failed:', error.message);
      resolve(false);
    });
    
    ws.on('message', (data) => {
      console.log('📨 WebSocket message received:', data.toString());
    });
    
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      resolve(false);
    }, 5000);
  });
}

async function testGetAllCalls() {
  console.log('📋 Testing get all calls...');
  try {
    const response = await axios.get(`${BASE_URL}/api/calls`);
    console.log('✅ Get all calls successful:', response.data.data?.length || 0, 'calls found');
    return response.data;
  } catch (error) {
    console.error('❌ Get all calls failed:', error.message);
    return null;
  }
}

async function runAllTests() {
  console.log('🚀 Starting VoIP System Tests...\n');
  
  const results = {};
  
  // Test 1: System Status
  results.systemStatus = await testSystemStatus();
  console.log('');
  
  // Test 2: WebSocket Connection
  results.websocket = await testWebSocket();
  console.log('');
  
  // Test 3: Call Simulation
  results.simulation = await testSimulateCall();
  console.log('');
  
  // Test 4: Asterisk Call
  results.asterisk = await testAsteriskCall();
  console.log('');
  
  // Test 5: Twilio Webhook
  results.twilio = await testTwilioWebhook();
  console.log('');
  
  // Test 6: Get All Calls
  results.getAllCalls = await testGetAllCalls();
  console.log('');
  
  // Summary
  console.log('📊 Test Results Summary:');
  console.log('========================');
  console.log(`System Status: ${results.systemStatus ? '✅' : '❌'}`);
  console.log(`WebSocket: ${results.websocket ? '✅' : '❌'}`);
  console.log(`Call Simulation: ${results.simulation ? '✅' : '❌'}`);
  console.log(`Asterisk Integration: ${results.asterisk ? '✅' : '❌'}`);
  console.log(`Twilio Webhook: ${results.twilio ? '✅' : '❌'}`);
  console.log(`Get All Calls: ${results.getAllCalls ? '✅' : '❌'}`);
  
  const passedTests = Object.values(results).filter(result => !!result).length;
  const totalTests = Object.keys(results).length;
  
  console.log(`\n🎯 Overall: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! Your VoIP system is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the error messages above.');
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testSystemStatus,
  testSimulateCall,
  testAsteriskCall,
  testTwilioWebhook,
  testWebSocket,
  testGetAllCalls
};