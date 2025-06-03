// api/404.js
export default function handler(req, res) {
  res.status(404).json({ message: 'Not found' });
}
