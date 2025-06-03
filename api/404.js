// // api/404.js
// export default function handler(req, res) {
//   res.status(404).json({ message: 'Not found' });
// }

// api/404.js
export default function handler(req, res) {
  res.redirect(302, '/html/404.html');
}
