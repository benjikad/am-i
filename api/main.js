// In-memory storage for user messages
const userMessages = new Map();
const messageTimers = new Map();

export default async function handler(req, res) {
  // Add CORS headers for browser requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, User-Agent, Referer');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Validate user agent
    const userAgent = req.headers['user-agent'] || '';
    if (!isValidRobloxUserAgent(userAgent)) {
      console.log('User agent validation failed for:', userAgent);
      return res.status(403).json({ error: 'Access is restricted.' });
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Validate Roblox-specific headers
    if (!hasRobloxHeaders(req.headers)) {
      console.log('Header validation failed');
      return res.status(403).json({ error: 'Missing required headers' });
    }

    // Validate request patterns
    if (!isValidRobloxRequest(req)) {
      console.log('Request pattern validation failed');
      return res.status(403).json({ error: 'Invalid request pattern' });
    }

    // Parse request body
    const body = req.body;
    
    // Handle different types of requests
    if (body.action === 'executed' && body.username && body.messageId) {
      // Roblox is telling us code was executed - remove the specific message
      handleCodeExecuted(body.username, body.messageId);
      return res.status(200).json({ 
        success: true, 
        message: 'Code execution acknowledged' 
      });
    } else if (body.action === 'fetch' || !body.username || !body.data) {
      // Roblox is requesting data - return current table
      const tableData = {
        success: true,
        data: {
          message: Object.fromEntries(userMessages)
        }
      };
      return res.status(200).json(tableData);
    } else {
      // New message from web interface - add to user's table
      addUserMessage(body.username, body.data);
      return res.status(200).json({ 
        success: true, 
        message: 'Data added to user table',
        username: body.username,
        data: body.data
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
    timestamp: Date.now()
  };

  // Add message to user's array
  userMessages.get(username).push(message);
  
  // Set up auto-removal timer (5 seconds)
  const timerId = setTimeout(() => {
    removeMessageById(username, messageId);
    console.log(`Auto-removed message ${messageId} for user ${username} after 5 seconds`);
  }, 5000);

  // Store timer reference
  messageTimers.get(username).push({
    messageId: messageId,
    timerId: timerId
  });

  console.log(`Added message for user ${username}:`, data);
  console.log(`Current messages for ${username}:`, userMessages.get(username));
}

function handleCodeExecuted(username, messageId) {
  removeMessageById(username, messageId);
  console.log(`Removed executed message ${messageId} for user ${username}`);
}

function removeMessageById(username, messageId) {
  if (!userMessages.has(username)) return;

  // Remove message from user's array
  const messages = userMessages.get(username);
  const messageIndex = messages.findIndex(msg => msg.id === messageId);
  
  if (messageIndex !== -1) {
    messages.splice(messageIndex, 1);
    
    // If no more messages for this user, clean up the user entry
    if (messages.length === 0) {
      userMessages.delete(username);
      // Clear any remaining timers for this user
      const timers = messageTimers.get(username) || [];
      timers.forEach(timer => clearTimeout(timer.timerId));
      messageTimers.delete(username);
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

function isValidRobloxUserAgent(userAgent) {
  if (userAgent.includes('RobloxStudio') || userAgent.includes('RobloxApp')) {
    // Handle Roblox Studio requests
    console.log('Roblox Studio detected');
    return true;
  }
  return false;
}

function hasRobloxHeaders(headers) {
  // Check for valid content-type
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

  // Check for suspicious automation tools
  const suspiciousIndicators = [
    headers['user-agent']?.includes('curl'),
    headers['user-agent']?.includes('wget'),
    headers['user-agent']?.includes('python'),
    headers['postman-token'],
    headers['x-postman-interceptor-id']
  ];

  if (suspiciousIndicators.some(Boolean)) {
    console.log('Suspicious headers detected');
    return false;
  }

  return true;
}

function isValidRobloxRequest(req) {
  const referer = req.headers.referer || req.headers.referrer;
  
  // Allow requests without referer or from valid sources
  if (referer && !referer.includes('roblox.com') && !referer.includes('localhost')) {
    console.log('Invalid referer:', referer);
    return false;
  }

  // Block definitely suspicious headers
  const suspiciousHeaders = ['postman-token', 'x-postman-interceptor-id'];
  
  for (const header of suspiciousHeaders) {
    if (req.headers[header]) {
      console.log(`Suspicious header found: ${header}`);
      return false;
    }
  }

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
