export default async function handler(req, res) {
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

    // Return table data for Roblox
    const tableData = {
      success: true,
      data: {
        message: {
          "print('a')",
        },
      }
    };

    return res.status(200).json(tableData);

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
}

function isValidRobloxUserAgent(userAgent) {
  const robloxPatterns = [
    /^Roblox\/Linux$/,
    /^Roblox\/WinInet$/,
    /^RobloxStudio\/[\d\.]+/,
    /^Roblox\/[\d\.]+ \(Windows NT/
  ];
  
  return robloxPatterns.some(pattern => pattern.test(userAgent));
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
