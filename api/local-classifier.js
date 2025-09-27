// Local rule-based classification before sending to ML model

export function preClassifyReview(reviewText) {
    const text = reviewText.toLowerCase().trim();
    
    const result = {
        isClassified: false,
        categories: [],
        confidence: 0,
        categoryScores: {},
        triggeredRules: [] // Track which rules were triggered
    };

    console.log(`[LOCAL CLASSIFIER] Checking review: "${text.substring(0, 100)}..." (length: ${text.length})`);

    // Advertisements: Look for URLs, phone numbers, promotional language
    const hasURL = /\bwww\.\w+\.\w+|http|\.com\b/gi.test(text);
    const hasPhone = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(text);
    const hasPromo = text.includes('promo') || text.includes('discount') || text.includes('% off') || text.includes('deal');
    const hasCallToAction = text.includes('click here') || text.includes('call now') || text.includes('shop now')|| text.includes('visit our website')|| text.includes('get yours')|| text.includes('learn more');
    
    if (hasURL || hasPhone || (hasPromo && hasCallToAction)) {
        result.categories.push('Advertisements');
        result.categoryScores['Advertisements'] = 0.9;
        
        const triggers = [];
        if (hasURL) triggers.push('URLs detected');
        if (hasPhone) triggers.push('phone numbers detected');
        if (hasPromo && hasCallToAction) triggers.push('promotional language + call-to-action');
        result.triggeredRules.push(`Advertisements: ${triggers.join(', ')}`);
        
        console.log(`[LOCAL CLASSIFIER] MATCHED Rule 1 - Advertisements: URL=${hasURL}, Phone=${hasPhone}, Promo+CTA=${hasPromo && hasCallToAction}`);
    }

    // Spam: Look for excessive punctuation, all caps, very short generic reviews
    const hasExcessivePunctuation = (text.match(/[!?,.]{4,}/g) || []).length > 0;
    const hasExcessiveCaps = (text.match(/[A-Z]{8,}/g) || []).length > 0;
    const isVeryShortGeneric = text.length < 15 && /^(good|bad|great)!*$/gi.test(text.trim());
    
    if ((hasExcessivePunctuation && hasExcessiveCaps) || isVeryShortGeneric) {
        result.categories.push('Spam');
        result.categoryScores['Spam'] = 0.85;
        
        const triggers = [];
        if (hasExcessivePunctuation && hasExcessiveCaps) triggers.push('excessive punctuation + caps');
        if (isVeryShortGeneric) triggers.push('very short generic text');
        result.triggeredRules.push(`Spam: ${triggers.join(', ')}`);
        
        console.log(`[LOCAL CLASSIFIER] MATCHED Rule 2 - Spam: ExcessPunct=${hasExcessivePunctuation}, ExcessCaps=${hasExcessiveCaps}, SpamUsername=${hasSpamUsername}, ShortGeneric=${isVeryShortGeneric}`);
    }

    // Rant Without Visit: Look for phrases indicating no visit
    const hasNeverBeen = text.includes('never been') || text.includes('never went') || text.includes('never visited');
    const hasHearsay = text.includes('heard from') || text.includes('people say') || text.includes('my friend said');
    const lacksDetail = text.length > 50 && !/\b(I|we|my|our|ordered|bought|tried|service|staff|food|drink)\b/gi.test(text);
    
    if(hasNeverBeen || hasHearsay || lacksDetail) {
        result.categories.push('Rant Without Visit');
        result.categoryScores['Rant Without Visit'] = 0.8;
        
        const triggers = [];
        if (hasNeverBeen) triggers.push('never visited phrases');
        if (hasHearsay) triggers.push('hearsay language');
        if (lacksDetail) triggers.push('lacks personal details');
        result.triggeredRules.push(`Rant Without Visit: ${triggers.join(', ')}`);
        
        console.log(`[LOCAL CLASSIFIER] MATCHED Rule 3 - Rant Without Visit: NeverBeen=${hasNeverBeen}, Hearsay=${hasHearsay}, LacksDetail=${lacksDetail}`);
    }

    // Irrelevant Content: Very short, generic, or nonsensical reviews
    const isSingleWord = text.length < 3; // Very short, like "ok" or "no"
    const isOnlyTest = /^test(ing)?[\.!]*$/gi.test(text.trim()); // Only "test" or "testing" by itself
    const isOnlyQuestion = /^(does anyone know|is this place open|when do you open)\?*$/gi.test(text.trim()); // Only standalone questions
    const isGibberish = /^[^a-zA-Z]*$/.test(text) && text.length < 10; // Only symbols/numbers, very short
    
    if (isSingleWord || isOnlyTest || isOnlyQuestion || isGibberish) {
        result.categories.push('Irrelevant Content');
        result.categoryScores['Irrelevant Content'] = 0.85;
        
        const triggers = [];
        if (isSingleWord) triggers.push('too short');
        if (isOnlyTest) triggers.push('test content');
        if (isOnlyQuestion) triggers.push('standalone question');
        if (isGibberish) triggers.push('gibberish/symbols only');
        result.triggeredRules.push(`Irrelevant Content: ${triggers.join(', ')}`);
        
        console.log(`[LOCAL CLASSIFIER] MATCHED Rule 4 - Irrelevant Content: SingleWord=${isSingleWord}, OnlyTest=${isOnlyTest}, OnlyQuestion=${isOnlyQuestion}, Gibberish=${isGibberish}`);
    }

    // Useful Reviews: Look for detailed reviews with specifics or recommendations
    const isDetailed = text.length > 100;
    const hasSpecifics = (text.match(/\b(ordered|tried|bought|service|manager|waiter|waitress|cashier)\b/gi) || []).length > 1;
    const hasRecommendation = /\b(recommend|highly recommend|would go back|will be back|loved the)\b/gi.test(text);
    const hasMixedSentiment = /\b(but|however|although)\b/gi.test(text) && /\b(good|great|bad|poor)\b/gi.test(text);
    
    if (isDetailed && (hasSpecifics || hasRecommendation || hasMixedSentiment)) {
        result.categories.push('Useful');
        result.categoryScores['Useful'] = 0.8;
        
        const triggers = [];
        if (isDetailed) triggers.push('detailed review');
        if (hasSpecifics) triggers.push('specific details');
        if (hasRecommendation) triggers.push('recommendation language');
        if (hasMixedSentiment) triggers.push('balanced opinion');
        result.triggeredRules.push(`Useful: ${triggers.join(', ')}`);
        
        console.log(`[LOCAL CLASSIFIER] MATCHED Rule 5 - Useful: Detailed=${isDetailed}, Specifics=${hasSpecifics}, Recommendation=${hasRecommendation}, MixedSentiment=${hasMixedSentiment}`);
    }

    // Finalize result
    if (result.categories.length > 0) {
        result.isClassified = true;
        result.confidence = Math.max(...Object.values(result.categoryScores));
        result.reason = result.triggeredRules.join(' | ');
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
            review.text || review.reviewText || ''
        );

        if (classification.isClassified) {
            // Add to locally classified results
            results.locallyClassified.push({
                ...review,
                classifications: classification.categories,
                classificationScores: classification.categoryScores,
                localClassification: true,
                classificationReason: classification.reason
            });
            results.summary.locallyClassified++;

            // Update category counts
            classification.categories.forEach(category => {
                results.summary.byCategory[category] = (results.summary.byCategory[category] || 0) + 1;
            });
        } else {
            // Only add to needsMLClassification if not classified locally
            results.needsMLClassification.push(review);
            results.summary.needsML++;
        }
    });

    return results;
}
