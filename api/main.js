import jwt from 'jsonwebtoken';

// In-memory storage for user messages and server status
const userMessages = new Map(); // users -> {username -> [messages]}
const jobIdMessages = new Map(); // jobids -> {jobId -> [messages]}
const serverStatus = new Map(); // jobId -> {players, lastPing, etc}
const messageTimers = new Map();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, User-Agent, Referer');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  const userAgent = req.headers['user-agent'];
  
  // INLINE authentication check (instead of fetch call)
  let isAuthenticated = false;
  try {
    const cookies = req.headers.cookie;
    if (cookies) {
      const tokenCookie = cookies
        .split(';')
        .find(cookie => cookie.trim().startsWith('auth-token='));
      
      if (tokenCookie) {
        const token = tokenCookie.split('=')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        isAuthenticated = true;
      }
    }
  } catch (error) {
    console.error('Auth verification failed:', error);
  }
  
  if (!isAuthenticated && !isValidRobloxUserAgent(userAgent)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Parse request body
    const body = req.body;
    console.log('Received request body:', body);
    
    // Handle different types of requests
    if (body.action === 'ping_fetch' && body.jobId) {
      // Roblox server is pinging and requesting commands
      handleServerPing(body);
      const commands = getCommandsForServer(body.jobId, body.players);
      return res.status(200).json({
        success: true,
        data: {
          message: commands
        }
      });
      
    } else if (body.action === 'executed') {
      // Roblox is telling us code was executed
      const success = handleCodeExecuted(body.target, body.targetType, body.messageId, body.ran);
      return res.status(200).json({ 
        success: true, 
        message: success ? 'Code execution acknowledged' : 'Message not found',
        updated: success
      });
      
    } else if (body.action === 'fetch' || (!body.username && !body.jobId && !body.data)) {
      // Legacy fetch request - return current table
      const tableData = {
        success: true,
        data: {
          message: {
            users: Object.fromEntries(userMessages),
            jobids: Object.fromEntries(jobIdMessages)
          }
        }
      };
      console.log('Returning table data:', tableData);
      return res.status(200).json(tableData);
      
    } else if (body.username && body.data) {
      // New message from web interface for specific user
      addUserMessage(body.username, body.data);
      return res.status(200).json({ 
        success: true, 
        message: 'Data added to user table',
        username: body.username,
        data: body.data
      });
      
    } else if (body.jobId && body.data) {
      // New message from web interface for specific job ID
      addJobIdMessage(body.jobId, body.data);
      return res.status(200).json({ 
        success: true, 
        message: 'Data added to job ID table',
        jobId: body.jobId,
        data: body.data
      });
      
    } else if (body.action === 'purge' && body.username) {
      // Manual purge request - remove all messages for user
      purgeUserMessages(body.username);
      return res.status(200).json({
        success: true,
        message: `Purged all messages for user ${body.username}`
      });
      
    } else if (body.action === 'purge' && body.jobId) {
      // Manual purge request - remove all messages for job ID
      purgeJobIdMessages(body.jobId);
      return res.status(200).json({
        success: true,
        message: `Purged all messages for job ID ${body.jobId}`
      });
      
    } else if (body.action === 'status') {
      // Get server status for web interface
      return res.status(200).json({
        success: true,
        data: {
          servers: Object.fromEntries(serverStatus),
          userMessages: Object.fromEntries(userMessages),
          jobIdMessages: Object.fromEntries(jobIdMessages)
        }
      });
      
    } else {
      // Invalid request format
      return res.status(400).json({
        success: false,
        error: 'Invalid request format'
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
}

function handleServerPing(pingData) {
  const { jobId, players, playerCount, timestamp } = pingData;
  
  // Update server status
  serverStatus.set(jobId, {
    players: players || [],
    playerCount: playerCount || 0,
    lastPing: timestamp || Date.now(),
    lastSeen: new Date().toISOString()
  });
  
  console.log(`Server ${jobId} pinged with ${playerCount} players:`, players);
}

function getCommandsForServer(jobId, currentPlayers = []) {
  const commands = {
    users: {},
    jobids: {}
  };
  
  // Get commands for users currently in the server
  for (const playerName of currentPlayers) {
    if (userMessages.has(playerName)) {
      commands.users[playerName] = userMessages.get(playerName);
    }
  }
  
  // Get commands for this specific job ID
  if (jobIdMessages.has(jobId)) {
    commands.jobids[jobId] = jobIdMessages.get(jobId);
  }
  
  return commands;
}

function addUserMessage(username, data) {
  // Initialize user array if it doesn't exist
  if (!userMessages.has(username)) {
    userMessages.set(username, []);
    messageTimers.set(username + '_user', []);
  }
  
  // Create message object with unique ID and timestamp
  const messageId = Date.now() + Math.random().toString(36).substr(2, 9);
  const message = {
    id: messageId,
    content: data,
    timestamp: Date.now(),
    ran: null, // null = not executed yet, true = success, false = failed
    executedAt: null
  };
  
  // Add message to user's array
  userMessages.get(username).push(message);
  
  // Set up auto-removal timer (60 seconds - fallback cleanup)
  const timerId = setTimeout(() => {
    removeUserMessage(username, messageId);
    console.log(`Auto-removed user message ${messageId} for ${username} after 60 seconds`);
  }, 60000);
  
  // Store timer reference
  const timerKey = username + '_user';
  if (!messageTimers.has(timerKey)) {
    messageTimers.set(timerKey, []);
  }
  messageTimers.get(timerKey).push({
    messageId: messageId,
    timerId: timerId
  });
  
  console.log(`Added message for user ${username}:`, data);
}

function addJobIdMessage(jobId, data) {
  // Initialize job ID array if it doesn't exist
  if (!jobIdMessages.has(jobId)) {
    jobIdMessages.set(jobId, []);
    messageTimers.set(jobId + '_job', []);
  }
  
  // Create message object with unique ID and timestamp
  const messageId = Date.now() + Math.random().toString(36).substr(2, 9);
  const message = {
    id: messageId,
    content: data,
    timestamp: Date.now(),
    ran: null,
    executedAt: null
  };
  
  // Add message to job ID's array
  jobIdMessages.get(jobId).push(message);
  
  // Set up auto-removal timer (60 seconds - fallback cleanup)
  const timerId = setTimeout(() => {
    removeJobIdMessage(jobId, messageId);
    console.log(`Auto-removed job message ${messageId} for ${jobId} after 60 seconds`);
  }, 60000);
  
  // Store timer reference
  const timerKey = jobId + '_job';
  if (!messageTimers.has(timerKey)) {
    messageTimers.set(timerKey, []);
  }
  messageTimers.get(timerKey).push({
    messageId: messageId,
    timerId: timerId
  });
  
  console.log(`Added message for job ID ${jobId}:`, data);
}

function handleCodeExecuted(target, targetType, messageId, ranSuccessfully) {
  console.log(`Handling execution notification: ${target} (${targetType}), ${messageId}, ${ranSuccessfully}`);
  
  let success = false;
  
  if (targetType === 'username') {
    success = updateUserMessageStatus(target, messageId, ranSuccessfully);
  } else if (targetType === 'jobid') {
    success = updateJobIdMessageStatus(target, messageId, ranSuccessfully);
  }
  
  return success;
}

function updateUserMessageStatus(username, messageId, ranSuccessfully) {
  if (!userMessages.has(username)) {
    return false;
  }
  
  const messages = userMessages.get(username);
  const message = messages.find(msg => msg.id === messageId);
  
  if (message) {
    message.ran = ranSuccessfully;
    message.executedAt = Date.now();
    console.log(`Updated user message ${messageId} for ${username} - ran: ${ranSuccessfully}`);
    
    // Remove after 5 seconds to allow status display
    setTimeout(() => {
      removeUserMessage(username, messageId);
      console.log(`Removed executed user message ${messageId} for ${username}`);
    }, 5000);
    
    return true;
  }
  
  return false;
}

function updateJobIdMessageStatus(jobId, messageId, ranSuccessfully) {
  if (!jobIdMessages.has(jobId)) {
    return false;
  }
  
  const messages = jobIdMessages.get(jobId);
  const message = messages.find(msg => msg.id === messageId);
  
  if (message) {
    message.ran = ranSuccessfully;
    message.executedAt = Date.now();
    console.log(`Updated job message ${messageId} for ${jobId} - ran: ${ranSuccessfully}`);
    
    // Remove after 5 seconds to allow status display
    setTimeout(() => {
      removeJobIdMessage(jobId, messageId);
      console.log(`Removed executed job message ${messageId} for ${jobId}`);
    }, 5000);
    
    return true;
  }
  
  return false;
}

function removeUserMessage(username, messageId) {
  if (!userMessages.has(username)) return;
  
  const messages = userMessages.get(username);
  const messageIndex = messages.findIndex(msg => msg.id === messageId);
  
  if (messageIndex !== -1) {
    messages.splice(messageIndex, 1);
    console.log(`Removed user message ${messageId} for ${username}`);
    
    if (messages.length === 0) {
      userMessages.delete(username);
      clearUserTimers(username);
    }
  }
  
  clearMessageTimer(username + '_user', messageId);
}

function removeJobIdMessage(jobId, messageId) {
  if (!jobIdMessages.has(jobId)) return;
  
  const messages = jobIdMessages.get(jobId);
  const messageIndex = messages.findIndex(msg => msg.id === messageId);
  
  if (messageIndex !== -1) {
    messages.splice(messageIndex, 1);
    console.log(`Removed job message ${messageId} for ${jobId}`);
    
    if (messages.length === 0) {
      jobIdMessages.delete(jobId);
      clearJobTimers(jobId);
    }
  }
  
  clearMessageTimer(jobId + '_job', messageId);
}

function clearMessageTimer(timerKey, messageId) {
  if (messageTimers.has(timerKey)) {
    const timers = messageTimers.get(timerKey);
    const timerIndex = timers.findIndex(timer => timer.messageId === messageId);
    
    if (timerIndex !== -1) {
      clearTimeout(timers[timerIndex].timerId);
      timers.splice(timerIndex, 1);
      
      if (timers.length === 0) {
        messageTimers.delete(timerKey);
      }
    }
  }
}

function clearUserTimers(username) {
  const timerKey = username + '_user';
  if (messageTimers.has(timerKey)) {
    const timers = messageTimers.get(timerKey);
    timers.forEach(timer => clearTimeout(timer.timerId));
    messageTimers.delete(timerKey);
  }
}

function clearJobTimers(jobId) {
  const timerKey = jobId + '_job';
  if (messageTimers.has(timerKey)) {
    const timers = messageTimers.get(timerKey);
    timers.forEach(timer => clearTimeout(timer.timerId));
    messageTimers.delete(timerKey);
  }
}

function purgeUserMessages(username) {
  if (!userMessages.has(username)) return;
  
  clearUserTimers(username);
  userMessages.delete(username);
  
  console.log(`Purged all messages for user ${username}`);
}

function purgeJobIdMessages(jobId) {
  if (!jobIdMessages.has(jobId)) return;
  
  clearJobTimers(jobId);
  jobIdMessages.delete(jobId);
  
  console.log(`Purged all messages for job ID ${jobId}`);
}

// Simplified validation - less restrictive for testing
function isValidRobloxUserAgent(userAgent) {
  if (userAgent.includes('RobloxStudio') || 
      userAgent.includes('Roblox/Linux') ||
      userAgent.includes('RobloxApp') ||
      userAgent.includes('Mozilla') || // Browser requests
      userAgent.includes('Chrome')) {
    console.log('Valid user agent detected:', userAgent);
    return true;
  }
  return false;
}

// Utility function to get current state (for debugging)
export function getServerState() {
  return {
    userMessages: Object.fromEntries(userMessages),
    jobIdMessages: Object.fromEntries(jobIdMessages),
    serverStatus: Object.fromEntries(serverStatus),
    activeTimers: Object.fromEntries(
      Array.from(messageTimers.entries()).map(([key, timers]) => [
        key, 
        timers.map(t => ({ messageId: t.messageId, hasTimer: !!t.timerId }))
      ])
    )
  };
}
