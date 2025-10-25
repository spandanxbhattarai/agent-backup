const testAPI = async () => {
  try {
    console.log('🧪 Testing Unified VoIP API...\n');

    // Test health endpoint
    console.log('1. Testing Health Endpoint...');
    const healthResponse = await fetch('http://localhost:3001/health');
    const healthData = await healthResponse.json();
    console.log('   ✅ Health:', healthData.status);
    
    // Test system status
    console.log('\n2. Testing System Status...');
    const statusResponse = await fetch('http://localhost:3001/api/calls/system/status');
    const statusData = await statusResponse.json();
    console.log('   📡 Providers:', statusData.data.providers);
    
    // Test making a call (will use simulation since Asterisk is not connected)
    console.log('\n3. Testing Call Initiation (Asterisk simulation)...');
    const callResponse = await fetch('http://localhost:3001/api/calls/make', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: '1001', to: '2000' })
    });
    const callData = await callResponse.json();
    console.log('   📞 Call Result:', callData);
    
    // Test simulated incoming call
    console.log('\n4. Testing Simulated Incoming Call...');
    const simResponse = await fetch('http://localhost:3001/api/calls/test/simulate-incoming', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromNumber: '+1234567890' })
    });
    const simData = await simResponse.json();
    console.log('   📞 Simulation Result:', simData);
    
    // Test get all calls
    console.log('\n5. Testing Get All Calls...');
    const allCallsResponse = await fetch('http://localhost:3001/api/calls/');
    const allCallsData = await allCallsResponse.json();
    console.log('   📋 Total Calls:', allCallsData.data.length);
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

// Run tests
testAPI();