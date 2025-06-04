const fs = require('fs');
const path = require('path');

export default function handler(req, res) {
    const filePath = path.join(process.cwd(), 'private/api/main.js');
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/javascript');
        res.status(200).send(fs.readFileSync(filePath, 'utf8'));
    } else {
        res.status(404).send('File not found');
    }
}
