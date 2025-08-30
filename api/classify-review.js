// api/classify-review.js
// Separate endpoint for classifying individual reviews (used by the test tab)

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

  const { reviewText, rating, threshold = 0.5 } = req.body;

  if (!reviewText || reviewText.trim().length === 0) {
    return res.status(400).json({ 
      success: false,
      error: 'Review text is required' 
    });
  }

  try {
    console.log(`[${new Date().toISOString()}] Classifying single review`);
    
    const classification = await classifySingleReview(reviewText.trim(), threshold);
    
    return res.status(200).json({ 
      success: true, 
      data: classification,
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

async function classifySingleReview(reviewText, threshold = 0.5, maxRetries = 3) {
  // Fixed: Use the correct Gradio API endpoint
  const HF_API_URL = 'https://louistzx-kaypoh-aunty.hf.space/gradio_api/call/classify_review';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${new Date().toISOString()}] Attempt ${attempt}/${maxRetries}: Calling ${HF_API_URL}`);
      
      // Step 1: POST to get event ID
      const response = await fetch(HF_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: [reviewText, threshold]
        }),
        signal: AbortSignal.timeout(30000)
      });

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
      const resultResponse = await fetch(resultUrl, {
        signal: AbortSignal.timeout(60000)
      });

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
      console.error(`Classification attempt ${attempt}/${maxRetries} failed:`, error.message);
      if (attempt === maxRetries) {
        throw error;
      }
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}