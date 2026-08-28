const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// In-Memory Real-Time Server State (Synchronized across all network clients)
let serverIncidents = [];
let serverSensors = [
  { id: 'FIRE-101', type: 'Fire/Smoke', zone: 'Library - Ground Floor', status: 'Active', lastTested: '2026-08-20' },
  { id: 'FIRE-102', type: 'Fire/Smoke', zone: 'Hostel Block A - 2nd Floor', status: 'Active', lastTested: '2026-08-22' },
  { id: 'FIRE-103', type: 'Fire/Smoke', zone: 'Main Canteen', status: 'Active', lastTested: '2026-08-24' },
  { id: 'FIRE-104', type: 'Fire/Smoke', zone: 'Computer Lab 3', status: 'Active', lastTested: '2026-08-25' },
  { id: 'FIRE-105', type: 'Fire/Smoke', zone: 'Auditorium', status: 'Active', lastTested: '2026-08-26' },
  { id: 'MED-201', type: 'Medical', zone: 'Sick Room', status: 'Active', lastTested: '2026-08-27' },
  { id: 'MED-202', type: 'Medical', zone: 'Hostel Block B', status: 'Active', lastTested: '2026-08-28' }
];

let serverDirectory = [
  { id: 'STU-2024-001', name: 'Kavitha Ramanathan', role: 'Student', department: 'Computer Science', phone: '+91 98450 11223' },
  { id: 'STU-2024-042', name: 'Rahul Verma', role: 'Student', department: 'Mechanical Engineering', phone: '+91 98450 22334' },
  { id: 'STU-2024-089', name: 'Ananya Krishnan', role: 'Student', department: 'Electronics & Comm', phone: '+91 98450 33445' },
  { id: 'STU-2025-015', name: 'Rohan Sen', role: 'Student', department: 'Biotechnology', phone: '+91 98450 44556' },
  { id: 'FAC-2021-012', name: 'Dr. Sarah Paul', role: 'Faculty', department: 'Computer Science', phone: '+91 98450 55667' },
  { id: 'WRD-2018-009', name: 'Warden M. Jagadeesan', role: 'Responder (Fire)', department: 'Fire & Safety Warden', phone: '+91 98450 88990' },
  { id: 'MED-2020-002', name: 'Dr. Priya Nair', role: 'Responder (Medical)', department: 'Campus Medical Bay', phone: '+91 98450 77889' },
  { id: 'SAF-2019-011', name: 'Prof. S. Meenakshi', role: 'Responder (Safety)', department: "Women's Safety Cell", phone: '+91 98450 55443' },
  { id: 'ACC-2022-004', name: 'Officer Vikram Singh', role: 'Responder (Accident)', department: 'Emergency Trauma Patrol', phone: '+91 98450 33221' },
  { id: 'SEC-2019-005', name: 'Officer Rajesh Sharma', role: 'Responder (Security)', department: 'Campus Security', phone: '+91 98450 66778' },
  { id: 'ADM-2015-001', name: 'Dean Dr. V. Sundaram', role: 'Admin', department: 'Administration', phone: '+91 98450 99001' }
];

let serverAuditLogs = [
  { id: 'log-1', timestamp: new Date().toISOString(), message: '🛡️ CampusGuard Server Online. Multi-Device Real-time Broadcast Engine Active.' }
];

// Connected SSE Clients list
let sseClients = [];

// Helper: Broadcast event to all connected network clients (phones, laptops, tablets)
function broadcastToAllClients(eventType, data) {
  const payload = JSON.stringify({ type: eventType, data, timestamp: Date.now() });
  sseClients.forEach(client => {
    try {
      client.res.write(`data: ${payload}\n\n`);
    } catch (e) {
      console.warn('Error sending to SSE client:', e.message);
    }
  });
}

// Helper: Get Local IPv4 Address for LAN Multi-Device access
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const server = http.createServer((req, res) => {
  // CORS Headers for multi-device cross-origin support
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // =========================================================================
  // API ROUTE 1: Server-Sent Events (SSE) Stream for Live Cross-Device Sync
  // =========================================================================
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const clientId = Date.now() + Math.random();
    sseClients.push({ id: clientId, res });

    // Initial handshake sync
    res.write(`data: ${JSON.stringify({ type: 'SYNC_STATE', data: { incidents: serverIncidents, sensors: serverSensors } })}\n\n`);

    req.on('close', () => {
      sseClients = sseClients.filter(c => c.id !== clientId);
    });
    return;
  }

  // =========================================================================
  // API ROUTE 2: Incidents (GET, POST)
  // =========================================================================
  if (pathname === '/api/incidents') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(serverIncidents));
      return;
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const newIncident = JSON.parse(body);
          serverIncidents.unshift(newIncident);
          
          // Broadcast to ALL devices on the network immediately!
          broadcastToAllClients('INCIDENT_CREATED', newIncident);
          
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, incident: newIncident }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }
  }

  // API ROUTE 3: Incident Status Update (Acknowledge, En Route, Resolved)
  if (pathname === '/api/incidents/update' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { incidentId, status, responder, timelineEntry } = JSON.parse(body);
        const inc = serverIncidents.find(i => i.id === incidentId);
        if (inc) {
          inc.status = status;
          if (status === 'Resolved') inc.resolvedAt = new Date().toISOString();
          if (responder && !inc.assignedTo) {
            inc.assignedTo = { name: responder.name, role: responder.responderType || responder.role };
          }
          if (timelineEntry) {
            inc.timeline = inc.timeline || [];
            inc.timeline.unshift(timelineEntry);
          }
          // Broadcast update to all network clients
          broadcastToAllClients('INCIDENT_UPDATED', inc);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, incident: inc }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Incident not found' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // API ROUTE 4: Server & Network Information
  if (pathname === '/api/server-info') {
    const localIp = getLocalIpAddress();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      localIp: localIp,
      port: PORT,
      lanUrl: `http://${localIp}:${PORT}`,
      localhostUrl: `http://localhost:${PORT}`,
      activeClients: sseClients.length
    }));
    return;
  }

  // =========================================================================
  // Static File Serving
  // =========================================================================
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// Bind to 0.0.0.0 so all network devices (laptops, phones, tablets) can connect!
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log('================================================================');
  console.log('🛡️  CampusGuard Emergency Command Server is LIVE');
  console.log('================================================================');
  console.log(`💻 Local Host URL:      http://localhost:${PORT}`);
  console.log(`🌐 Network / Wi-Fi URL:  http://${localIp}:${PORT}`);
  console.log('================================================================');
  console.log(`Share http://${localIp}:${PORT} with friends on the same Wi-Fi!`);
  console.log('================================================================');
});
