// api/login.js - Vercel serverless function
import jwt from 'jsonwebtoken';

// In production, use environment variables for these
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const ADMIN_USERS = {
  'benjikad': '6a25e3e9-a6de-45b1-8ad0-772e169303ed',
  'gabe': 'gabeisgud',
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
    const tokenExpiry = rememberMe ? '30d' : '24h';
    const token = jwt.sign(
      { username, loginTime: Date.now() },
      JWT_SECRET,
      { expiresIn: tokenExpiry }
    );

    // Set cookie options
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000, // 30 days or 24 hours in ms
      path: '/'
    };

    // Set the cookie
    res.setHeader('Set-Cookie', `auth-token=${token}; ${Object.entries(cookieOptions)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')}`);

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
