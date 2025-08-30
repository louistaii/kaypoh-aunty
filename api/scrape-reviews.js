// api/scrape-reviews.js
// This file should be placed in the 'api' folder in your Vercel project root

export default async function handler(req, res) {
  // Enable CORS for your frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed. Use POST.' 
    });
  }

  const { searchQuery, location = 'New York, USA' } = req.body;

  if (!searchQuery) {
    return res.status(400).json({ 
      success: false,
      error: 'Search query is required' 
    });
  }

  // Get environment variables
  const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
  const APIFY_ACTOR_ID = 'nwua9Gu5YrADL7ZDj'; // Google Maps Reviews Scraper

  if (!APIFY_API_TOKEN) {
    console.error('APIFY_API_TOKEN not found in environment variables');
    return res.status(500).json({ 
      success: false,
      error: 'Apify API token not configured. Please set APIFY_API_TOKEN in environment variables.' 
    });
  }

  try {
    console.log(`[${new Date().toISOString()}] Starting scraper for query: "${searchQuery}"`);

    // Start the Apify run
    const runResponse = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIFY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        searchStringsArray: [searchQuery],
        locationQuery: location,
        maxCrawledPlacesPerSearch: 3,
        language: "en",
        searchMatching: "all",
        maxReviews: 15, // Increased to account for filtering
        reviewsSort: "newest",
        scrapeReviewsPersonalData: true,
        reviewsOrigin: "all",
        onlyDataFromSearchPage: false,
        maxCrawledPlaces: 5
      })
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error('Failed to start Apify run:', runResponse.status, errorText);
      throw new Error(`Failed to start scraping: ${runResponse.status} - ${errorText}`);
    }

    const run = await runResponse.json();
    const runId = run.data.id;
    console.log(`[${new Date().toISOString()}] Apify run started with ID: ${runId}`);

    // Wait for completion with timeout
    const results = await waitForRunCompletion(runId, APIFY_API_TOKEN, APIFY_ACTOR_ID);
    
    console.log(`[${new Date().toISOString()}] Scraping completed. Found ${results.length} places. Starting classification...`);
    
    // Classify reviews using Hugging Face API
    const classifiedResults = await classifyReviewsInResults(results);
    
    console.log(`[${new Date().toISOString()}] Classification completed successfully.`);
    
    return res.status(200).json({ 
      success: true, 
      data: classifiedResults,
      message: `Found ${classifiedResults.length} places with classified reviews`
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error:`, error.message);
    
    // Return detailed error information
    return res.status(500).json({ 
      success: false,
      error: 'Processing failed', 
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

async function classifyReviewsInResults(results) {
  const classifiedResults = [];
  // Fixed: Use the correct Gradio API endpoint for batch processing
  const HF_BATCH_URL = 'https://louistzx-kaypoh-aunty.hf.space/gradio_api/call/classify_batch';
  const threshold = 0.5;

  for (const place of results) {
    const classifiedPlace = { ...place };
    if (place.reviews && place.reviews.length > 0) {
      console.log(`[${new Date().toISOString()}] Classifying ${place.reviews.length} reviews for: ${place.title}`);
      
      // Prepare batch payload
      const reviewTexts = place.reviews.map(r => r.text || r.reviewText || '');
      
      try {
        // Step 1: POST to get event ID
        const response = await fetch(HF_BATCH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            data: [JSON.stringify(reviewTexts), threshold] 
          }),
          signal: AbortSignal.timeout(60000)
        });

        if (!response.ok) {
          throw new Error(`Batch API POST error: ${response.status} - ${await response.text()}`);
        }

        const result = await response.json();
        const eventId = result.event_id;
        
        if (!eventId) {
          throw new Error('No event_id in batch response: ' + JSON.stringify(result));
        }

        console.log(`[${new Date().toISOString()}] Got batch event ID: ${eventId}`);

        // Step 2: GET the results using event ID
        const resultUrl = `${HF_BATCH_URL}/${eventId}`;
        const resultResponse = await fetch(resultUrl, {
          signal: AbortSignal.timeout(120000) // Longer timeout for batch processing
        });

        if (!resultResponse.ok) {
          throw new Error(`Batch result fetch failed: ${resultResponse.status} - ${await resultResponse.text()}`);
        }

        // Step 3: Parse the streaming response
        const responseText = await resultResponse.text();
        const lines = responseText.split('\n');
        
        let batchResults = null;
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataContent = line.substring(6); // Remove 'data: ' prefix
            try {
              const parsedData = JSON.parse(dataContent);
              // Gradio wraps results in an array, get the first element
              if (Array.isArray(parsedData) && parsedData.length > 0) {
                batchResults = parsedData[0];
              } else {
                batchResults = parsedData;
              }
              break;
            } catch (parseError) {
              console.error('Failed to parse batch data:', parseError.message);
              continue;
            }
          }
        }

        if (batchResults && batchResults.batch_results) {
          // Merge classifications into reviews
          const classifiedReviews = place.reviews.map((review, i) => {
            const batchRes = batchResults.batch_results[i] || {};
            return {
              ...review,
              classifications: (batchRes.predictions || []).map(p => p.label),
              classificationScores: batchRes.all_scores || {}
            };
          });
          classifiedPlace.reviews = classifiedReviews;
        } else {
          throw new Error('Invalid batch API response format: ' + JSON.stringify(batchResults));
        }
      } catch (error) {
        console.error(`Batch classification failed for ${place.title}:`, error.message);
        // Fallback: mark all as unclassified
        classifiedPlace.reviews = place.reviews.map(r => ({ 
          ...r, 
          classifications: ['Unclassified'], 
          classificationScores: {} 
        }));
      }
    }
    classifiedResults.push(classifiedPlace);
  }
  return classifiedResults;
}

async function classifySingleReview(reviewText, rating = 0, threshold = 0.5, maxRetries = 3) {
  // Fixed: Use the correct Gradio API endpoint
  const HF_API_URL = 'https://louistzx-kaypoh-aunty.hf.space/gradio_api/call/classify_review';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
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
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Rate limit hit, waiting ${delay}ms before retry ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const eventId = result.event_id;
      
      if (!eventId) {
        throw new Error('No event_id in response: ' + JSON.stringify(result));
      }

      // Step 2: GET the results using event ID
      const resultUrl = `${HF_API_URL}/${eventId}`;
      const resultResponse = await fetch(resultUrl, {
        signal: AbortSignal.timeout(60000)
      });

      if (!resultResponse.ok) {
        throw new Error(`Result fetch failed: ${resultResponse.status}`);
      }

      // Step 3: Parse the streaming response
      const responseText = await resultResponse.text();
      const lines = responseText.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataContent = line.substring(6);
          try {
            const parsedData = JSON.parse(dataContent);
            // Gradio wraps results in an array, get the first element
            if (Array.isArray(parsedData) && parsedData.length > 0) {
              return parsedData[0];
            } else {
              return parsedData;
            }
          } catch (parseError) {
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
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Fallback classification function
function fallbackClassification(reviewText, rating) {
  const text = reviewText.toLowerCase();
  const categories = [];

  if (text.includes('click here') || text.includes('visit') || text.includes('discount') || 
      text.includes('www.') || text.includes('http') || text.includes('promo')) {
    categories.push('Advertisement');
  }

  if (text.includes('!!!') || text.match(/[A-Z]{3,}/) || 
      text.includes('free money') || text.includes('prizes')) {
    categories.push('Spam');
  }

  if (rating <= 2 && (text.includes('worst') || text.includes('terrible') || 
      text.includes('never going') || text.includes('awful')) && 
      text.length > 200) {
    categories.push('Rant Without Visit');
  }

  if (text.length < 30 || text.includes('okay i guess') || 
      text.includes('nothing special') || text.includes('meh')) {
    categories.push('Irrelevant Content');
  }

  if (categories.length === 0) {
    categories.push('Useful Review');
  }

  return categories;
}

async function waitForRunCompletion(runId, apiToken, actorId, maxWaitTime = 300000) {
  const startTime = Date.now();
  const checkInterval = 5000; // Check every 5 seconds
  
  console.log(`[${new Date().toISOString()}] Waiting for run ${runId} to complete...`);
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      // Check run status
      const statusResponse = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
        }
      });
      
      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }
      
      const runStatus = await statusResponse.json();
      const status = runStatus.data.status;
      
      console.log(`[${new Date().toISOString()}] Run status: ${status}`);
      
      if (status === 'SUCCEEDED') {
        console.log(`[${new Date().toISOString()}] Run completed successfully. Fetching results...`);
        
        // Get the results from dataset
        const datasetId = runStatus.data.defaultDatasetId;
        const resultsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
          }
        });
        
        if (!resultsResponse.ok) {
          throw new Error(`Results fetch failed: ${resultsResponse.status}`);
        }
        
        const results = await resultsResponse.json();
        console.log(`[${new Date().toISOString()}] Successfully fetched ${results.length} results`);
        
        return results;
        
      } else if (status === 'FAILED') {
        const failedReason = runStatus.data.statusMessage || 'Unknown error';
        console.error(`[${new Date().toISOString()}] Run failed:`, failedReason);
        throw new Error(`Scraping failed: ${failedReason}`);
        
      } else if (status === 'ABORTED') {
        console.error(`[${new Date().toISOString()}] Run was aborted`);
        throw new Error('Scraping was aborted');
        
      } else if (status === 'TIMED-OUT') {
        console.error(`[${new Date().toISOString()}] Run timed out`);
        throw new Error('Scraping timed out');
      }
      
      // Status is still RUNNING or READY, wait and check again
      console.log(`[${new Date().toISOString()}] Still running... waiting ${checkInterval/1000} seconds`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error checking run status:`, error.message);
      throw error;
    }
  }
  
  // If we've reached here, we've timed out
  console.error(`[${new Date().toISOString()}] Timeout after ${maxWaitTime/1000} seconds`);
  throw new Error(`Timeout waiting for scraping to complete after ${maxWaitTime/1000} seconds`);
}