// api/logout.js - Vercel serverless function for logout
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Clear the authentication cookie by setting it to expire immediately
    const cookieString = [
      'auth-token=',
      'Max-Age=0',
      'Path=/',
      'HttpOnly',
      process.env.NODE_ENV === 'production' ? 'Secure' : '',
      'SameSite=strict'
    ].filter(Boolean).join('; ');

    // Set the cookie to clear it
    res.setHeader('Set-Cookie', cookieString);

    return res.status(200).json({
      message: 'Logout successful',
      authenticated: false
    });

  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ 
      message: 'Internal server error' 
    });
  }
}
