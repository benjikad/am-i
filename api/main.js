// Modified API handler for ping-response system
import fs from 'fs';
import path from 'path';

// Use /tmp directory for serverless environments (writable)
const DATA_FILE = path.join('/tmp', 'data.json');

// Initialize data structure
const initData = {
  servers: {},
  userMessages: {},
  jobIdMessages: {},
  executedMessages: []
};

function readData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error reading data file:', error);
  }
  return { ...initData };
}

function writeData(data) {
  try {
    // Ensure /tmp directory exists
    const tmpDir = path.dirname(DATA_FILE);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing data file:', error);
  }
}

function generateMessageId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function cleanupOldMessages(data) {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes

  // Clean up user messages
  for (const username in data.userMessages) {
    data.userMessages[username] = data.userMessages[username].filter(msg => 
      now - msg.timestamp < maxAge
    );
    if (data.userMessages[username].length === 0) {
      delete data.userMessages[username];
    }
  }

  // Clean up job ID messages
  for (const jobId in data.jobIdMessages) {
    data.jobIdMessages[jobId] = data.jobIdMessages[jobId].filter(msg => 
      now - msg.timestamp < maxAge
    );
    if (data.jobIdMessages[jobId].length === 0) {
      delete data.jobIdMessages[jobId];
    }
  }

  // Clean up old executed messages
  data.executedMessages = data.executedMessages.filter(msg => 
    now - (msg.executedAt || msg.timestamp) < maxAge
  );
}

function cleanupInactiveServers(data) {a
  const now = Date.now();
  const maxInactiveTime = 5 * 60 * 1000; // 5 minutes
  
  const serversToRemove = [];
  
  // Find servers that haven't pinged in over 5 minutes
  for (const jobId in data.servers) {
    const server = data.servers[jobId];
    if (now - server.lastPing > maxInactiveTime) {
      serversToRemove.push(jobId);
    }
  }
  
  // Remove inactive servers
  for (const jobId of serversToRemove) {
    console.log(`Removing inactive server: ${jobId} (last ping: ${new Date(data.servers[jobId].lastPing).toISOString()})`);
    delete data.servers[jobId];
    
    // Also clean up any pending messages for this server
    if (data.jobIdMessages[jobId]) {
      console.log(`Cleaning up ${data.jobIdMessages[jobId].length} pending messages for inactive server: ${jobId}`);
      delete data.jobIdMessages[jobId];
    }
  }
  
  return serversToRemove.length > 0;
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, User-Agent, Referer');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse request body if it's a string
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    console.log('Request body:', body); // Debug logging
    
    const data = readData();
    
    // Clean up old messages and inactive servers periodically
    cleanupOldMessages(data);
    const serversRemoved = cleanupInactiveServers(data);
    
    // Write data back if servers were removed
    if (serversRemoved) {
      writeData(data);
    }

    switch (body.action) {
      case 'ping':
        // Handle ping from Roblox server - update server info and return messages
        const { jobId, placeId, playerCount, players, timestamp } = body;
        
        console.log('Ping received from jobId:', jobId); // Debug logging
        
        if (!jobId) {
          console.log('Missing jobId in ping request');
          return res.status(400).json({ error: 'Missing jobId' });
        }

        // Update server info
        data.servers[jobId] = {
          placeId: placeId || 'unknown',
          region: region || 'unknown',
          playerCount: playerCount || 0,
          players: players || [],
          lastPing: Date.now(),
          lastSeen: new Date().toISOString()
        };

        // Prepare response with messages
        const responseData = {
          userMessages: {},
          jobIdMessages: {}
        };

        // Get user messages for players in this server
        if (players && Array.isArray(players)) {
          for (const username of players) {
            if (data.userMessages[username] && data.userMessages[username].length > 0) {
              responseData.userMessages[username] = data.userMessages[username];
            }
          }
        }

        // Get job ID messages for this server
        if (data.jobIdMessages[jobId] && data.jobIdMessages[jobId].length > 0) {
          responseData.jobIdMessages[jobId] = data.jobIdMessages[jobId];
        }

        writeData(data);
        
        return res.status(200).json({
          success: true,
          data: responseData,
          serverTime: new Date().toISOString()
        });

      case 'executed':
        // Handle execution notification
        const { username, messageId, ran } = body;
        const executedJobId = body.jobId;

        if (!messageId) {
          return res.status(400).json({ error: 'Missing messageId' });
        }

        // Find and update the message
        let messageFound = false;

        if (username && data.userMessages[username]) {
          const msgIndex = data.userMessages[username].findIndex(msg => msg.id === messageId);
          if (msgIndex !== -1) {
            data.userMessages[username][msgIndex].ran = ran;
            data.userMessages[username][msgIndex].executedAt = Date.now();
            messageFound = true;
            
            // Move to executed messages and remove from pending
            data.executedMessages.push({
              ...data.userMessages[username][msgIndex],
              type: 'user',
              target: username
            });
            data.userMessages[username].splice(msgIndex, 1);
            
            if (data.userMessages[username].length === 0) {
              delete data.userMessages[username];
            }
          }
        }

        if (executedJobId && data.jobIdMessages[executedJobId]) {
          const msgIndex = data.jobIdMessages[executedJobId].findIndex(msg => msg.id === messageId);
          if (msgIndex !== -1) {
            data.jobIdMessages[executedJobId][msgIndex].ran = ran;
            data.jobIdMessages[executedJobId][msgIndex].executedAt = Date.now();
            messageFound = true;
            
            // Move to executed messages and remove from pending
            data.executedMessages.push({
              ...data.jobIdMessages[executedJobId][msgIndex],
              type: 'jobId',
              target: executedJobId
            });
            data.jobIdMessages[executedJobId].splice(msgIndex, 1);
            
            if (data.jobIdMessages[executedJobId].length === 0) {
              delete data.jobIdMessages[executedJobId];
            }
          }
        }

        if (!messageFound) {
          return res.status(404).json({ error: 'Message not found' });
        }

        writeData(data);
        
        return res.status(200).json({
          success: true,
          message: 'Execution status updated'
        });

      case 'status':
        // Return current status for dashboard
        const statusResponse = {
          servers: data.servers,
          message: {
            users: data.userMessages,
            jobids: data.jobIdMessages
          },
          executedMessages: data.executedMessages
        };

        return res.status(200).json({
          success: true,
          data: statusResponse
        });

      default:
        // Handle message sending from dashboard
        if (body.username && body.data) {
          // Send message to username
          const username = body.username;
          const messageData = {
            id: generateMessageId(),
            content: body.data,
            timestamp: Date.now(),
            ran: null,
            executedAt: null
          };

          if (!data.userMessages[username]) {
            data.userMessages[username] = [];
          }
          data.userMessages[username].push(messageData);

          writeData(data);

          return res.status(200).json({
            success: true,
            message: `Message queued for user: ${username}`,
            messageId: messageData.id
          });
        }

        if (body.jobId && body.data) {
          // Send message to job ID
          const jobId = body.jobId;
          const messageData = {
            id: generateMessageId(),
            content: body.data,
            timestamp: Date.now(),
            ran: null,
            executedAt: null
          };

          if (!data.jobIdMessages[jobId]) {
            data.jobIdMessages[jobId] = [];
          }
          data.jobIdMessages[jobId].push(messageData);

          writeData(data);

          return res.status(200).json({
            success: true,
            message: `Message queued for job ID: ${jobId}`,
            messageId: messageData.id
          });
        }

        return res.status(400).json({ error: 'Invalid request' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
