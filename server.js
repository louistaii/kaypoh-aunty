import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.post('/api/scrape-reviews', async (req, res) => {
  try {
    // Import the handler dynamically
    const { default: handler } = await import('./api/scrape-reviews.js');
    await handler(req, res);
  } catch (error) {
    console.error('Error in scrape-reviews API:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

app.post('/api/classify-review', async (req, res) => {
  try {
    // Import the handler dynamically
    const { default: handler } = await import('./api/classify-review.js');
    await handler(req, res);
  } catch (error) {
    console.error('Error in classify-review API:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Serve the main HTML file for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Kaypoh Aunty server running on http://localhost:${PORT}`);
  console.log(`📁 Serving static files from: ${path.join(__dirname, 'public')}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});
