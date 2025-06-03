// api/dashboard.js
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Check authentication using your existing logic
    const cookies = req.headers.cookie;
    if (!cookies) {
      return res.redirect(302, '/login');
    }

    const tokenCookie = cookies
      .split(';')
      .find(cookie => cookie.trim().startsWith('auth-token='));
    
    if (!tokenCookie) {
      return res.redirect(302, '/login');
    }

    const token = tokenCookie.split('=')[1];
    
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // If authenticated, serve the HTML file
    const htmlPath = "/html/dashboard.html";
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Optional: inject user data into HTML
    // htmlContent = htmlContent.replace('{{USERNAME}}', decoded.username);
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(htmlContent);
    
  } catch (error) {
    console.error('Dashboard auth error:', error);
    return res.redirect(302, '/login');
  }
}
