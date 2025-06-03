import jwt from 'jsonwebtoken';

// In-memory storage for user messages
const userMessages = new Map();
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
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
    if (body.action === 'executed' && body.username && body.messageId) {
      // Roblox is telling us code was executed - update and optionally remove the message
      const success = handleCodeExecuted(body.username, body.messageId, body.ran);
      return res.status(200).json({ 
        success: true, 
        message: success ? 'Code execution acknowledged' : 'Message not found',
        updated: success
      });
    } else if (body.action === 'fetch' || (!body.username && !body.data)) {
      // Roblox or client is requesting data - return current table
      const tableData = {
        success: true,
        data: {
          message: Object.fromEntries(userMessages)
        }
      };
      console.log('Returning table data:', tableData);
      return res.status(200).json(tableData);
    } else if (body.username && body.data) {
      // New message from web interface - add to user's table
      addUserMessage(body.username, body.data);
      return res.status(200).json({ 
        success: true, 
        message: 'Data added to user table',
        username: body.username,
        data: body.data
      });
    } else if (body.action === 'purge' && body.username) {
      // Manual purge request - remove all messages for user
      purgeUserMessages(body.username);
      return res.status(200).json({
        success: true,
        message: `Purged all messages for user ${body.username}`
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

function addUserMessage(username, data) {
  // Initialize user array if it doesn't exist
  if (!userMessages.has(username)) {
    userMessages.set(username, []);
    messageTimers.set(username, []);
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
    removeMessageById(username, messageId);
    console.log(`Auto-removed message ${messageId} for user ${username} after 60 seconds`);
  }, 60000);

  // Store timer reference
  messageTimers.get(username).push({
    messageId: messageId,
    timerId: timerId
  });

  console.log(`Added message for user ${username}:`, data);
}

function handleCodeExecuted(username, messageId, ranSuccessfully) {
  console.log(`Handling execution notification: ${username}, ${messageId}, ${ranSuccessfully}`);
  
  if (!userMessages.has(username)) {
    return false;
  }
  
  // Find and update the message status
  const messages = userMessages.get(username);
  const message = messages.find(msg => msg.id === messageId);
  
  if (message) {
    message.ran = ranSuccessfully;
    message.executedAt = Date.now();
    console.log(`Updated message ${messageId} for user ${username} - ran: ${ranSuccessfully}`);
    
    // IMMEDIATE REMOVAL OPTION: Uncomment the line below to remove immediately
    // removeMessageById(username, messageId);
    
    // DELAYED REMOVAL: Keep for 5 seconds to allow status display, then remove
    setTimeout(() => {
      removeMessageById(username, messageId);
      console.log(`Removed executed message ${messageId} for user ${username} after status display`);
    }, 5000); // Reduced from 10 to 5 seconds
    
    return true;
  } else {
    console.log(`Message ${messageId} not found for user ${username}`);
    return false;
  }
}

function removeMessageById(username, messageId) {
  if (!userMessages.has(username)) return;

  // Remove message from user's array
  const messages = userMessages.get(username);
  const messageIndex = messages.findIndex(msg => msg.id === messageId);
  
  if (messageIndex !== -1) {
    messages.splice(messageIndex, 1);
    console.log(`Removed message ${messageId} for user ${username}`);
    
    // If no more messages for this user, clean up the user entry
    if (messages.length === 0) {
      userMessages.delete(username);
      // Clear any remaining timers for this user
      const timers = messageTimers.get(username) || [];
      timers.forEach(timer => clearTimeout(timer.timerId));
      messageTimers.delete(username);
      console.log(`Cleaned up user ${username} - no more messages`);
    }
  }

  // Remove and clear the timer for this message
  if (messageTimers.has(username)) {
    const timers = messageTimers.get(username);
    const timerIndex = timers.findIndex(timer => timer.messageId === messageId);
    
    if (timerIndex !== -1) {
      clearTimeout(timers[timerIndex].timerId);
      timers.splice(timerIndex, 1);
      
      if (timers.length === 0) {
        messageTimers.delete(username);
      }
    }
  }
}

function purgeUserMessages(username) {
  if (!userMessages.has(username)) return;
  
  // Clear all timers for this user
  const timers = messageTimers.get(username) || [];
  timers.forEach(timer => clearTimeout(timer.timerId));
  
  // Remove all messages and timers for this user
  userMessages.delete(username);
  messageTimers.delete(username);
  
  console.log(`Purged all messages for user ${username}`);
}

// Simplified validation - less restrictive for testing
function isValidRobloxUserAgent(userAgent) {
  // More permissive - allow browser requests for testing
  if (userAgent.includes('RobloxStudio') || 
      userAgent.includes('RobloxApp') ||
      userAgent.includes('Mozilla') || // Browser requests
      userAgent.includes('Chrome')) {
    console.log('Valid user agent detected:', userAgent);
    return true;
  }
  return false;
}

function hasRobloxHeaders(headers) {
  // More permissive header validation
  const contentType = headers['content-type'];
  if (!contentType) {
    console.log('POST request missing content-type');
    return false;
  }

  const validContentTypes = [
    'application/json',
    'application/x-www-form-urlencoded',
    'text/plain'
  ];

  const hasValidContentType = validContentTypes.some(type => 
    contentType.includes(type)
  );

  if (!hasValidContentType) {
    console.log('POST request has invalid content-type:', contentType);
    return false;
  }

  return true; // Simplified - less restrictive
}

function isValidRobloxRequest(req) {
  // More permissive validation for testing
  return true;
}

// Utility function to get current state (for debugging)
export function getServerState() {
  return {
    userMessages: Object.fromEntries(userMessages),
    activeTimers: Object.fromEntries(
      Array.from(messageTimers.entries()).map(([username, timers]) => [
        username, 
        timers.map(t => ({ messageId: t.messageId, hasTimer: !!t.timerId }))
      ])
    )
  };
}
