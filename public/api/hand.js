import { promises as fs } from 'fs';
import path from 'path';

export default async function handler(req, res) {
  try {
    // Normalize the requested path
    const urlPath = req.url === '/' ? '/index.html' : req.url;
    const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');

    // Build the private file path
    const filePath = path.join(process.cwd(), 'private', safePath);

    // Read the file
    const fileData = await fs.readFile(filePath);

    // Infer content-type (basic example)
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg'
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    // Send content
    res.status(200).send(fileData);
  } catch (err) {
    // Return 403 page or message if file not found
    res.status(404).sendFile(path.join(process.cwd(), 'public', '403.html'));
  }
}
