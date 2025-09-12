// local-classifier.js
// Local rule-based classification before sending to ML model

export function preClassifyReview(reviewText, rating = 0, authorName = '') {
    const text = reviewText.toLowerCase().trim();
    const author = authorName.toLowerCase().trim();
    
    // Initialize result - now supports multiple categories
    const result = {
        isClassified: false,
        categories: [],
        confidence: 0,
        categoryScores: {}
    };

    // Debug: Log what we're checking
    console.log(`[LOCAL CLASSIFIER] Checking review: "${text.substring(0, 100)}..." (length: ${text.length})`);
    console.log(`[LOCAL CLASSIFIER] Author: "${author}"`);
    console.log(`[LOCAL CLASSIFIER] Rating: ${rating}`);

    // Rule 1: OBVIOUS Advertisements (very clear indicators only)
    const hasURL = /\bwww\.\w+\.\w+|http|\.com\b/gi.test(text);
    const hasPhone = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(text);
    const hasPromo = text.includes('promo') || text.includes('discount') || text.includes('50% off') || text.includes('deal');
    const hasCallToAction = text.includes('click here') || text.includes('call now') || text.includes('visit our website');
    
    if (hasURL || hasPhone || (hasPromo && hasCallToAction)) {
        result.categories.push('Advertisements');
        result.categoryScores['Advertisements'] = 0.9;
        console.log(`[LOCAL CLASSIFIER] MATCHED Rule 1 - Advertisements: URL=${hasURL}, Phone=${hasPhone}, Promo+CTA=${hasPromo && hasCallToAction}`);
    }

    // Rule 2: OBVIOUS Spam (very clear indicators only)
    const hasExcessivePunctuation = (text.match(/!{4,}/g) || []).length > 0;
    const hasExcessiveCaps = (text.match(/[A-Z]{8,}/g) || []).length > 0;
    const hasSpamUsername = /\d{3,}|promo|deal|discount/gi.test(author);
    const isVeryShortGeneric = text.length < 15 && /^(good|bad|great)!*$/gi.test(text.trim());
    
    if ((hasExcessivePunctuation && hasExcessiveCaps) || hasSpamUsername || isVeryShortGeneric) {
        result.categories.push('Spam');
        result.categoryScores['Spam'] = 0.85;
        console.log(`[LOCAL CLASSIFIER] MATCHED Rule 2 - Spam: ExcessPunct=${hasExcessivePunctuation}, ExcessCaps=${hasExcessiveCaps}, SpamUsername=${hasSpamUsername}, ShortGeneric=${isVeryShortGeneric}`);
    }

    // Rule 3: OBVIOUS Rant Without Visit (very clear indicators only)
    const hasNeverBeen = text.includes('never been') || text.includes('never went') || text.includes('never visited');
    const hasHearsay = text.includes('heard from') || text.includes('people say') || text.includes('my friend said');
    
    if (hasNeverBeen || hasHearsay) {
        result.categories.push('Rant Without Visit');
        result.categoryScores['Rant Without Visit'] = 0.8;
        console.log(`[LOCAL CLASSIFIER] MATCHED Rule 3 - Rant Without Visit: NeverBeen=${hasNeverBeen}, Hearsay=${hasHearsay}`);
    }

    // Rule 4: OBVIOUS Irrelevant Content (very strict - only truly irrelevant)
    const isSingleWord = text.length < 3; // Very short, like "ok" or "no"
    const isOnlyTest = /^test(ing)?[\.!]*$/gi.test(text.trim()); // Only "test" or "testing" by itself
    const isOnlyQuestion = /^(does anyone know|is this place open|when do you open)\?*$/gi.test(text.trim()); // Only standalone questions
    const isGibberish = /^[^a-zA-Z]*$/.test(text) && text.length < 10; // Only symbols/numbers, very short
    
    if (isSingleWord || isOnlyTest || isOnlyQuestion || isGibberish) {
        result.categories.push('Irrelevant Content');
        result.categoryScores['Irrelevant Content'] = 0.85;
        console.log(`[LOCAL CLASSIFIER] MATCHED Rule 4 - Irrelevant Content: SingleWord=${isSingleWord}, OnlyTest=${isOnlyTest}, OnlyQuestion=${isOnlyQuestion}, Gibberish=${isGibberish}`);
    }

    // Rule 5: OBVIOUS Useful Reviews (very clear indicators only)
    const isDetailed = text.length > 100;
    const hasSpecifics = text.includes('ordered') && text.includes('service');
    const hasRecommendation = text.includes('recommend') || text.includes('highly recommend');
    
    if (isDetailed && (hasSpecifics || hasRecommendation)) {
        result.categories.push('Useful');
        result.categoryScores['Useful'] = 0.8;
        console.log(`[LOCAL CLASSIFIER] MATCHED Rule 5 - Useful: Detailed=${isDetailed}, Specifics=${hasSpecifics}, Recommendation=${hasRecommendation}`);
    }

    // Finalize result
    if (result.categories.length > 0) {
        result.isClassified = true;
        result.confidence = Math.max(...Object.values(result.categoryScores));
        result.reason = `Local classification: ${result.categories.join(', ')} (confidence: ${result.confidence})`;
        console.log(`[LOCAL CLASSIFIER] FINAL: LOCALLY CLASSIFIED as ${result.categories.join(', ')}`);
    } else {
        result.reason = 'No local classification rules matched - will use ML model';
        console.log(`[LOCAL CLASSIFIER] FINAL: NO LOCAL MATCH - WILL SEND TO AI MODEL`);
    }

    return result;
}

// Batch process reviews with local classification
export function preClassifyBatch(reviews) {
    const results = {
        locallyClassified: [],
        needsMLClassification: [],
        summary: {
            totalReviews: reviews.length,
            locallyClassified: 0,
            needsML: 0,
            byCategory: {}
        }
    };

    reviews.forEach(review => {
        const classification = preClassifyReview(
            review.text || review.reviewText || '', 
            review.rating || 0,
            review.author || review.authorName || ''
        );

        if (classification.isClassified) {
            results.locallyClassified.push({
                ...review,
                classifications: classification.categories,
                classificationScores: classification.categoryScores,
                localClassification: true,
                classificationReason: 'Local rule-based classification'
            });
            results.summary.locallyClassified++;
            
            // Update category counts
            classification.categories.forEach(category => {
                results.summary.byCategory[category] = (results.summary.byCategory[category] || 0) + 1;
            });
        } else {
            results.needsMLClassification.push(review);
            results.summary.needsML++;
        }
    });

    return results;
}
