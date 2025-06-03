// api/verify.js - Vercel serverless function to verify authentication
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Get token from cookie
    const cookies = req.headers.cookie;
    if (!cookies) {
      return res.status(401).json({ 
        authenticated: false, 
        message: 'No authentication cookie found' 
      });
    }

    const tokenCookie = cookies
      .split(';')
      .find(cookie => cookie.trim().startsWith('auth-token='));

    if (!tokenCookie) {
      return res.status(401).json({ 
        authenticated: false, 
        message: 'No authentication token found' 
      });
    }

    const token = tokenCookie.split('=')[1];

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    return res.status(200).json({
      authenticated: true,
      user: { username: decoded.username },
      loginTime: decoded.loginTime
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        authenticated: false, 
        message: 'Invalid or expired token' 
      });
    }

    console.error('Verification error:', error);
    return res.status(500).json({ 
      authenticated: false,
      message: 'Internal server error' 
    });
  }
}
