import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handler as searchHandler } from './search.js';
import { handler as youtubeHandler } from './youtube-search.js';

// Since we are using ES modules, __dirname is not available. This is the workaround.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

// Middleware to parse JSON bodies
app.use(express.json());

// API routes
app.get('/api/search', searchHandler);
app.get('/api/youtube-search', youtubeHandler);

// Serve static files from the 'public' directory, which is one level up from /api
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// For any other request, serve the index.html file.
// This allows the client-side routing to take over.
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

