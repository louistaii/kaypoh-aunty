// api/scrape-reviews.js

import { preClassifyBatch } from './local-classifier.js';

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
  const threshold = 0.5;

  for (const place of results) {
    const classifiedPlace = { ...place };
    if (place.reviews && place.reviews.length > 0) {
      console.log(`[${new Date().toISOString()}] Processing ${place.reviews.length} reviews for: ${place.title}`);
      
      // Step 1: Local classification first
      const localResults = preClassifyBatch(place.reviews);
      
      // Log reviews with photos
      const reviewsWithPhotos = place.reviews.filter(r => r.reviewerPhotos?.length > 0 || r.photos?.length > 0 || r.images?.length > 0);
      console.log(`[${new Date().toISOString()}] Reviews with photos:`, {
        total: place.reviews.length,
        withPhotos: reviewsWithPhotos.length,
        photoReviews: reviewsWithPhotos.map(r => ({
          text: (r.text || r.reviewText || '').substring(0, 30) + '...',
          photoCount: r.reviewerPhotos?.length || 0,
          rating: r.rating || r.stars
        }))
      });

      console.log(`[${new Date().toISOString()}] Local classification results:`, {
        total: localResults.summary.totalReviews,
        locallyClassified: localResults.summary.locallyClassified,
        needsML: localResults.summary.needsML,
        categories: localResults.summary.byCategory
      });

      let allClassifiedReviews = [...localResults.locallyClassified];
      
      console.log(`[${new Date().toISOString()}] Local classification flags check:`, 
        localResults.locallyClassified.map(r => ({
          text: (r.text || r.reviewText || '').substring(0, 30) + '...',
          localClassification: r.localClassification,
          categories: r.classifications
        }))
      );

      // Step 2: Send only unclassified reviews to ML model
      if (localResults.needsMLClassification.length > 0) {
        console.log(`[${new Date().toISOString()}] *** SENDING ${localResults.needsMLClassification.length} REVIEWS TO AI MODEL ***`);
        console.log(`[${new Date().toISOString()}] Reviews going to AI:`, localResults.needsMLClassification.map(r => `"${(r.text || r.reviewText || '').substring(0, 50)}..."`));
        
        try {
          const mlClassifiedReviews = await classifyWithMLModel(localResults.needsMLClassification, threshold);
          console.log(`[${new Date().toISOString()}] *** AI MODEL RETURNED ${mlClassifiedReviews.length} CLASSIFICATIONS ***`);
          
          // Debug: Log AI model categories to check normalization
          console.log(`[${new Date().toISOString()}] AI model categories after normalization:`, 
            mlClassifiedReviews.map(r => ({
              text: (r.text || r.reviewText || '').substring(0, 30) + '...',
              categories: r.classifications
            }))
          );
          
          allClassifiedReviews = allClassifiedReviews.concat(mlClassifiedReviews);
        } catch (error) {
          console.error(`ML classification failed for ${place.title}:`, error.message);
          // Fallback: mark ML reviews as unclassified
          const fallbackReviews = localResults.needsMLClassification.map(r => ({ 
            ...r, 
            classifications: ['Unclassified'], 
            classificationScores: {},
            localClassification: false,
            classificationReason: 'ML classification failed'
          }));
          allClassifiedReviews = allClassifiedReviews.concat(fallbackReviews);
        }
      } else {
        console.log(`[${new Date().toISOString()}] *** NO REVIEWS SENT TO AI MODEL - ALL ${localResults.summary.locallyClassified} WERE CLASSIFIED LOCALLY ***`);
      }

      // Restore original order of reviews by creating a more reliable mapping
      const reviewOrderMap = new Map();
      place.reviews.forEach((review, index) => {
        const reviewKey = `${review.text || review.reviewText || ''}_${review.author || review.authorName || ''}_${review.rating || 0}`;
        reviewOrderMap.set(reviewKey, index);
      });
      
      allClassifiedReviews.sort((a, b) => {
        const aKey = `${a.text || a.reviewText || ''}_${a.author || a.authorName || ''}_${a.rating || 0}`;
        const bKey = `${b.text || b.reviewText || ''}_${b.author || b.authorName || ''}_${b.rating || 0}`;
        const aIndex = reviewOrderMap.get(aKey) ?? 0;
        const bIndex = reviewOrderMap.get(bKey) ?? 0;
        return aIndex - bIndex;
      });

      classifiedPlace.reviews = allClassifiedReviews;
      
      console.log(`[${new Date().toISOString()}] Final review classification flags:`, 
        allClassifiedReviews.map(r => ({
          text: (r.text || r.reviewText || '').substring(0, 30) + '...',
          localClassification: r.localClassification,
          categories: r.classifications
        }))
      );
      classifiedPlace.classificationSummary = {
        ...localResults.summary,
        mlClassified: localResults.needsMLClassification.length
      };
    }
    classifiedResults.push(classifiedPlace);
  }
  return classifiedResults;
}

async function classifyWithMLModel(reviews, threshold) {
  const HF_BATCH_URL = 'https://louistzx-kaypoh-aunty-v2.hf.space/gradio_api/call/classify_batch';

  const reviewTexts = reviews.map(r => r.text || r.reviewText || '');
  const ratings = reviews.map(r => r.rating || 5.0);
  const hasPics = reviews.map(r => (r.reviewerPhotos?.length > 0 || r.photos?.length > 0 || r.images?.length > 0) ? 1 : 0);
  
  // Log the features being sent to the model
  console.log(`[${new Date().toISOString()}] Reviews being sent to ML model:`, reviews.map(r => ({
    text: (r.text || r.reviewText || '').substring(0, 30) + '...',
    rating: r.rating || 5.0,
    hasPhotos: (r.reviewerPhotos?.length > 0 || r.photos?.length > 0 || r.images?.length > 0) ? 'Yes' : 'No',
    photoCount: r.reviewerPhotos?.length || 0
  })));
  
  // Step 1: POST to get event ID
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  
  const response = await fetch(HF_BATCH_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    },
    body: JSON.stringify({ 
      data: [
        JSON.stringify(reviewTexts),
        JSON.stringify(ratings),
        JSON.stringify(hasPics),
        threshold
      ] 
    }),
    signal: controller.signal
  });

  clearTimeout(timeoutId);

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
  const resultController = new AbortController();
  const resultTimeoutId = setTimeout(() => resultController.abort(), 120000); // Longer timeout for batch processing
  
  const resultResponse = await fetch(resultUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    },
    signal: resultController.signal
  });

  clearTimeout(resultTimeoutId);

  if (!resultResponse.ok) {
    throw new Error(`Batch result fetch failed: ${resultResponse.status} - ${await resultResponse.text()}`);
  }

  // Step 3: Parse the streaming response
  const responseText = await resultResponse.text();
  const lines = responseText.split('\n');
  
  let batchResults = null;
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const dataContent = line.substring(6); 
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

  if (!batchResults || !batchResults.batch_results) {
    throw new Error('Invalid batch API response format: ' + JSON.stringify(batchResults));
  }

  // Merge ML classifications into reviews
  const classifiedReviews = reviews.map((review, i) => {
    const batchRes = batchResults.batch_results[i] || {};
    
    // Normalize category names to match local classifier styling
    const normalizedCategories = (batchRes.predictions || []).map(p => {
      const label = p.label;
      // Convert "Useful Review" to "Useful" to match local classifier styling
      if (label === "Useful Review") {
        return "Useful";
      }
      return label;
    });
    
    return {
      ...review,
      classifications: normalizedCategories,
      classificationScores: batchRes.all_scores || {},
      localClassification: false,
      classificationReason: createMLClassificationReason(normalizedCategories, batchRes.all_scores || {})
    };
  });

  return classifiedReviews;
}

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
        
        // Log detailed structure of first place and its first review
        if (results.length > 0) {
          const firstPlace = results[0];
          console.log(`[${new Date().toISOString()}] Apify API Response Structure:`, {
            placeFields: Object.keys(firstPlace),
            reviewFields: firstPlace.reviews && firstPlace.reviews.length > 0 
              ? Object.keys(firstPlace.reviews[0])
              : 'No reviews',
            firstReviewSample: firstPlace.reviews && firstPlace.reviews.length > 0 
              ? firstPlace.reviews[0]
              : 'No reviews'
          });

          // Log full raw response for the first place and detailed review structure
          console.log(`[${new Date().toISOString()}] Full Raw Apify Response for first place:`, 
            JSON.stringify(firstPlace, null, 2)
          );
          
          // Log detailed review structure if available
          if (firstPlace.reviews && firstPlace.reviews.length > 0) {
            const firstReview = firstPlace.reviews[0];
            console.log(`[${new Date().toISOString()}] Detailed Review Structure:`, {
              hasPhotosField: firstReview.hasPhotos ? 'Yes' : 'No',
              reviewerPhotosField: firstReview.reviewerPhotos ? 'Yes' : 'No',
              photosField: firstReview.photos ? 'Yes' : 'No',
              imagesField: firstReview.images ? 'Yes' : 'No',
              allFields: Object.keys(firstReview).filter(key => key.toLowerCase().includes('photo') || key.toLowerCase().includes('image'))
            });
        }
        
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