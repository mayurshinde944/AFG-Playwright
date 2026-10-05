const http = require('http');

const data = JSON.stringify({ url: 'https://example.com', validators: ['dns'] });

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/executions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${body}`);
    const { runId } = JSON.parse(body);
    
    // Test GET after a short delay
    setTimeout(() => {
      http.get(`http://localhost:3000/api/executions/${runId}`, res2 => {
        let body2 = '';
        res2.on('data', d => body2 += d);
        res2.on('end', () => {
          console.log(`GET Status: ${res2.statusCode}`);
          console.log(`GET Body: ${body2}`);
        });
      });
    }, 2000);
  });
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
