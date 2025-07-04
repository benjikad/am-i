// api/login.js - Vercel serverless function
import jwt from 'jsonwebtoken';

// In production, use environment variables for these
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const ADMIN_USERS = {
  'benjikad': '6a25e3e9-a6de-45b1-8ad0-772e169303ed',
  'ben': '6dgamepl@y',
  'gaber': 'gabeisgud',
  'tygo': 'cheese',
};

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
    const { username, password, rememberMe } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ 
        message: 'Username and password are required' 
      });
    }

    // Check credentials
    if (ADMIN_USERS[username] !== password) {
      return res.status(401).json({ 
        message: 'Invalid username or password' 
      });
    }

    // Create JWT token
    const tokenExpiry = rememberMe ? '6h' : '30m';
    const token = jwt.sign(
      { username, loginTime: Date.now() },
      JWT_SECRET,
      { expiresIn: tokenExpiry }
    );

    // Set cookie options with matching expiration times
    const maxAgeMs = rememberMe ? 6 * 60 * 60 * 1000 : 30 * 60 * 1000; // 6 hours or 30 minutes in ms
    
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict',
      maxAge: maxAgeMs,
      path: '/'
    };

    // Properly construct cookie string
    const cookieString = [
      `auth-token=${token}`,
      `Max-Age=${Math.floor(maxAgeMs / 1000)}`, // Max-Age expects seconds, not milliseconds
      `Path=${cookieOptions.path}`,
      cookieOptions.httpOnly ? 'HttpOnly' : '',
      cookieOptions.secure ? 'Secure' : '',
      `SameSite=${cookieOptions.sameSite}`
    ].filter(Boolean).join('; ');

    // Set the cookie
    res.setHeader('Set-Cookie', cookieString);

    return res.status(200).json({
      message: 'Login successful',
      user: { username },
      expiresIn: tokenExpiry
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      message: 'Internal server error' 
    });
  }
}
