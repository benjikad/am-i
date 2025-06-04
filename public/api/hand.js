import { promises as fs } from 'fs';
import path from 'path';

export default async function handler(req, res) {
  try {
    // Extract requested path without query string
    const urlPath = req.url.split('?')[0]; 

    // Map URLs to private files
    const routesMap = {
      '/login': '/html/login.html',
      '/dashboard': '/html/dashboard.html',
      '/api/login': '/api/login.js',
      '/api/verify': '/api/verify.js',
      '/': '/html/index.html',  // root to index
      // Add more mappings here as needed
    };

    // Find the mapped path, or fallback to urlPath as is
    let mappedPath = routesMap[urlPath] || urlPath;

    // Normalize and prevent path traversal
    const safePath = path.normalize(mappedPath).replace(/^(\.\.(\/|\\|$))+/, '');

    // Construct full path inside private folder
    const filePath = path.join(process.cwd(), 'private', safePath);

    // Read the file content
    const fileData = await fs.readFile(filePath);

    // Infer content type based on extension
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    // Send the file content
    res.status(200).send(fileData);

  } catch (err) {
    // Fallback 403 or 404 page
    console.log(err)
    res.status(404).send('File not found');
  }
}
