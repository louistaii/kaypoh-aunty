# Kaypoh Aunty 🕵️‍♀️

A web application for scraping and classifying location reviews with AI-powered sentiment analysis. "Kaypoh" means nosy in Singaporean slang, and this app helps you be nosy about places by analyzing their reviews!

## Features

- 🔍 **Smart Review Scraping**: Search for locations and scrape reviews from various sources
- 🤖 **AI-Powered Classification**: Automatically classify reviews using machine learning
- 🌏 **Local & Global Search**: Search within Singapore or worldwide
- 📊 **Review Analysis**: Categorize reviews as useful, spam, rants, etc.
- 🎨 **Modern UI**: Clean, responsive interface built with vanilla HTML/CSS/JS

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Apify API token (for review scraping)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd kaypoh-aunty
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```
Edit `.env` and add your Apify API token:
```
APIFY_API_TOKEN=your_apify_api_token_here
```

4. Start the development server:
```bash
npm run dev
```

5. Open your browser and visit `http://localhost:3000`

## Scripts

- `npm start` - Start the production server
- `npm run dev` - Start the development server with nodemon
- `npm run serve` - Serve static files only (for testing frontend)
- `npm run lint` - Run ESLint
- `npm test` - Run tests (placeholder)

## Project Structure

```
kaypoh-aunty/
├── api/                    # API endpoints
│   ├── classify-review.js  # Review classification endpoint
│   └── scrape-reviews.js   # Review scraping endpoint
├── public/                 # Static frontend files
│   ├── index.html         # Main HTML file
│   ├── style.css          # Styles
│   ├── app.js            # Frontend JavaScript
│   └── media/            # Images and icons
├── server.js              # Express server
├── package.json           # npm configuration
└── README.md             # This file
```

## API Endpoints

### POST /api/scrape-reviews
Scrape reviews for a location.

**Request body:**
```json
{
  "searchQuery": "Restaurant name",
  "location": "Singapore"
}
```

### POST /api/classify-review
Classify a single review.

**Request body:**
```json
{
  "reviewText": "Great food and service!",
  "rating": 5,
  "threshold": 0.5
}
```
*   **Spam**
*   **Rants Without Visits**
*   **Irrelevant Content**

This document outlines the development process and technical architecture of the machine learning model that powers the Kaypoh Aunty website.

## Development and Deployment Process

### Step 1: Data Sourcing and Preparation

The model was trained on a dataset sourced from the **McAuley Lab at UC San Diego**, specifically the Massachusetts dataset from their Google Local Review collection.

*   **Initial Data Cleaning**: The raw data was first processed to remove entries with empty or invalid text fields. This initial cleaning step resulted in a dataset of approximately **2 million reviews**.
*   **Data Sampling**: Due to computational constraints for model training, a random sample of approximately 13,000 reviews was selected from the cleaned 2-million-review pool. This sampled dataset was used for training and validation.

### Step 2: Model Training

A multi-label classification model was trained to perform the categorization task.

**1. Addressing Class Imbalance**

The sampled dataset exhibited a significant class imbalance, with a disproportionately high number of "Useful Review" labels. To mitigate model bias towards the majority class, a **weighted loss function** (`torch.nn.BCEWithLogitsLoss` with a `pos_weight` parameter) was implemented. Weights were calculated based on the inverse frequency of each class:

*   **Advertisement**: 2.349
*   **Irrelevant Content**: 2.221
*   **Rant Without Visit**: 2.070
*   **Spam**: 2.492
*   **Useful Review**: 0.278

**2. Technical Specifications**

*   **Model Architecture**: `distilbert-base-uncased` from the Hugging Face library was used as the base model.
*   **Data Split**: The sampled data was split into an 80/20 train/validation set.
*   **Training Framework**: The model was trained using the Hugging Face `Trainer` API. The best model checkpoint was saved based on the `f1_macro` score to ensure balanced performance across all categories.

### Step 3: Performance Evaluation

The trained model was evaluated on the unseen validation set. The results are detailed in the classification report below.

**Classification Report:**

| Class | Precision | Recall | F1-Score | Support |
| :--- | :--- | :--- | :--- | :--- |
| **Advertisement** | 0.99 | 0.99 | 0.99 | 223 |
| **Irrelevant Content** | 0.95 | 0.92 | 0.94 | 196 |
| **Rant Without Visit** | 0.78 | 0.45 | 0.57 | 257 |
| **Spam** | 0.98 | 0.98 | 0.98 | 196 |
| **Useful Review** | 0.92 | 0.97 | 0.94 | 1840 |

The model demonstrates high performance in identifying "Advertisement" and "Spam" categories. The "Rant Without Visit" class presented the most challenge, as indicated by its lower F1-score.

### Step 4: Deployment and Integration

The final model was deployed and integrated into the Kaypoh Aunty website following a modern, API-driven architecture.

*   **Model Hosting**: The trained model and its tokenizer were uploaded to the **Hugging Face Hub**.
*   **Inference**: Real-time classification is handled via the **Hugging Face Inference API**. This provides a scalable, serverless endpoint for model predictions.
*   **Application Architecture**:
    1.  The Kaypoh Aunty website, which is deployed on **Vercel**, scrapes reviews based on user input.
    2.  The website's backend sends an API request for each review text to the Hugging Face Inference API endpoint.
    3.  The API returns the classification results in JSON format.
    4.  The frontend then dynamically displays the review with its corresponding category tags, enabling user filtering.
