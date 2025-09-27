// api/classify-review.js
// Separate endpoint for classifying individual reviews (used by the test tab)

import { preClassifyReview } from './local-classifier.js';

function createMLClassificationReason(categories, scores) {
  if (categories.length === 0) {
    return 'No classification found';
  }
  
  // Find the highest confidence score for the predicted categories
  const categoryScores = categories.map(cat => {
    const score = scores[cat] || scores[`${cat} Review`] || 0; // Handle both "Useful" and "Useful Review"
    return `${cat}: ${(score * 100).toFixed(1)}%`;
  });
  
  return `Model prediction: ${categoryScores.join(', ')}`;
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed. Use POST.' 
    });
  }

  const { reviewText, rating, hasPhoto = 0, threshold = 0.5 } = req.body;

  if (!reviewText || reviewText.trim().length === 0) {
    return res.status(400).json({ 
      success: false,
      error: 'Review text is required' 
    });
  }

  if (rating === undefined || rating === null) {
    return res.status(400).json({
      success: false,
      error: 'Rating is required for testing (value between 1.0 and 5.0)'
    });
  }

  if (rating < 1.0 || rating > 5.0) {
    return res.status(400).json({
      success: false,
      error: 'Rating must be between 1.0 and 5.0'
    });
  }

  try {
    console.log(`[${new Date().toISOString()}] Classifying single review: "${reviewText.trim().substring(0, 50)}..."`);
    
    // Step 1: Try local classification first
    const localClassification = preClassifyReview(reviewText.trim());
    
    console.log(`[${new Date().toISOString()}] Review details:`, {
      textLength: reviewText.trim().length,
      rating: rating,
      features: {
        rating: rating,
        has_pics: hasPhoto
      }
    });
    
    console.log(`[${new Date().toISOString()}] Local classification result:`, {
      isClassified: localClassification.isClassified,
      categories: localClassification.categories,
      reason: localClassification.reason
    });
    
    if (localClassification.isClassified) {
      console.log(`[${new Date().toISOString()}] Local classification successful:`, localClassification.categories);
      return res.status(200).json({ 
        success: true, 
        data: {
          predictions: localClassification.categories.map(cat => ({ label: cat })),
          all_scores: { [localClassification.categories[0]]: localClassification.confidence },
          local_classification: true,
          classification_reason: localClassification.reason
        },
        message: 'Review classified locally'
      });
    }
    
    // Step 2: If not locally classified, use ML model
    console.log(`[${new Date().toISOString()}] Sending to ML model for classification`);
    const classification = await classifySingleReview(reviewText.trim(), rating, hasPhoto, threshold);
    
    return res.status(200).json({ 
      success: true, 
      data: {
        ...classification,
        local_classification: false,
        classification_reason: createMLClassificationReason(
          classification.predictions?.map(p => p.label) || [], 
          classification.all_scores || {}
        )
      },
      message: 'Review classified successfully'
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Classification error:`, error.message);
    
    return res.status(500).json({
      success: false,
      error: 'Classification failed',
      message: error.message
    });
  }
}

async function classifySingleReview(reviewText, rating = 5.0, hasPics = 0, threshold = 0.5, maxRetries = 3) {
  // Updated: Use the new Hugging Face space endpoint
  const HF_API_URL = 'https://louistzx-kaypoh-aunty-v2.hf.space/gradio_api/call/classify_review';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${new Date().toISOString()}] Attempt ${attempt}/${maxRetries}: Calling ${HF_API_URL}`);
      
      // Step 1: POST to get event ID
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(HF_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        body: JSON.stringify({
          data: [
            reviewText,              // text
            rating,                 // rating from the request
            hasPics,                // has_pics from the request (1 if photo uploaded, 0 if not)
            threshold
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const delay = Math.pow(2, attempt) * 2000;
        console.log(`Rate limit hit, waiting ${delay}ms before retry ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (response.status === 503) {
        const delay = 5000 * attempt;
        console.log(`Service unavailable, waiting ${delay}ms before retry ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
      }

      const result = await response.json();
      const eventId = result.event_id;
      
      if (!eventId) {
        throw new Error('No event_id in response: ' + JSON.stringify(result));
      }

      console.log(`[${new Date().toISOString()}] Got event ID: ${eventId}`);

      // Step 2: GET the results using event ID
      const resultUrl = `${HF_API_URL}/${eventId}`;
      const resultController = new AbortController();
      const resultTimeoutId = setTimeout(() => resultController.abort(), 60000);
      
      const resultResponse = await fetch(resultUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        },
        signal: resultController.signal
      });

      clearTimeout(resultTimeoutId);

      if (!resultResponse.ok) {
        throw new Error(`Result fetch failed: ${resultResponse.status} - ${await resultResponse.text()}`);
      }

      // Step 3: Parse the streaming response
      const responseText = await resultResponse.text();
      const lines = responseText.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataContent = line.substring(6); // Remove 'data: ' prefix
          try {
            const parsedData = JSON.parse(dataContent);
            // Gradio wraps results in an array, get the first element
            if (Array.isArray(parsedData) && parsedData.length > 0) {
              console.log(`[${new Date().toISOString()}] Classification successful`);
              return parsedData[0];
            } else {
              return parsedData;
            }
          } catch (parseError) {
            console.error('Failed to parse data:', parseError.message, 'Data:', dataContent);
            continue;
          }
        }
      }

      throw new Error('No data received from stream');

    } catch (error) {
      console.error(`Classification attempt ${attempt}/${maxRetries} failed:`, {
        message: error.message,
        name: error.name,
        cause: error.cause,
        stack: error.stack
      });
      if (attempt === maxRetries) {
        throw error;
      }
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}