
# Kaypoh Aunty - Google Review Classifier

**Kaypoh Aunty** is a web application that automatically scrapes and classifies Google Maps reviews for any business or location. It integrates the power of the **Apify** scraping service with a sophisticated, dual-layer classification engine to provide deep insights into user feedback. The name "Kaypoh Aunty" is a playful nod to the Singaporean colloquial term for a nosy, inquisitive person, reflecting the application's ability to thoroughly examine and understand user-generated content.

The application is built with a JavaScript-based stack and leverages a fine-tuned **DistilBERT** model hosted on **Hugging Face**, which is called via an API.

**Live Application:** [https://kaypoh-aunty.vercel.app/](https://kaypoh-aunty.vercel.app/)

---

## 🚀 How it Works: The User Workflow

The entire process, from scraping to analysis, is streamlined within the web application:

1.  **Input a Name:** The user enters the name of any **business, landmark, or location** they want to analyze into the search bar.
2.  **Scrape Reviews via Apify:** The application's backend triggers an integrated **Apify API** call. Apify then searches for the specified location on Google Maps and scrapes its reviews in real-time.
3.  **Classify Each Review:** As reviews are collected, each one is passed through the Kaypoh Aunty classification engine.
4.  **View Results:** The application displays the scraped reviews along with the labels assigned by the classifier, allowing for immediate analysis and filtering.

---

## ⚙️ The Classification Engine: A Two-Stage Process

To ensure both speed and accuracy, every review is processed through a two-stage pipeline. A single review can be assigned **multiple labels** if it meets the criteria for different categories.

### Stage 1: Rule-Based Classification

For immediate and efficient filtering, a fast, rule-based classifier written in JavaScript runs first. This initial step is designed to quickly catch obvious cases using predefined patterns and keywords.

### Stage 2: AI Model Classification (via Hugging Face API)

If a review does not match any of the predefined rules, it is then sent for a more nuanced analysis. The application makes an **API call** to a powerful, fine-tuned **DistilBERT model** hosted on the Hugging Face Hub. DistilBERT is a smaller, faster, and lighter version of BERT, making it ideal for a responsive web application as it retains over 95% of BERT's language understanding capabilities while being significantly more performant.

---

## 🧐 Classification Categories

Kaypoh Aunty classifies reviews into the following categories:

*   **Advertisements:** Identifies promotional content.
*   **Spam:** Filters out undesirable or low-quality content.
*   **Rant Without Visit:** Catches feedback from users who may not have had a firsthand experience.
*   **Irrelevant Content:** Flags reviews that are nonsensical or do not contribute meaningful feedback.
*   **Useful Reviews:** Recognizes detailed, helpful reviews that can inform business decisions or provide insights to other users.

---

## 🤖 AI Model Training and Dataset

The high accuracy of the classification model is the result of a meticulous training process designed to overcome real-world data challenges.

### The Dataset

The model was trained on a large dataset of Google local reviews from the **UC San Diego McAuley Lab**, available [here](https://mcauleylab.ucsd.edu/public_datasets/gdrive/googlelocal/).

### The Challenge: Severe Class Imbalance

After analyzing over 1 million reviews, the initial distribution of labeled data was extremely imbalanced:

*   **Useful:** 3,910 samples
*   **Spam:** 87 samples
*   **Irrelevant:** 48 samples
*   **Rant without visit:** 10 samples
*   **Advertisement:** 4 samples

Training a model on such a skewed dataset would lead to poor performance, as the model would be heavily biased towards the "Useful" category and fail to recognize the minority classes.

### The Solution: LLM-Generated Synthetic Data

To solve the imbalance, a **Large Language Model (LLM)** was used to generate high-quality, realistic synthetic data for the underrepresented categories. This process involved creating thousands of new, diverse examples for Spam, Irrelevant, Rant, and Advertisement reviews, resulting in a perfectly balanced class composition:

*   **Advertisement:** ~3,914 samples
*   **Rant without visit:** ~3,920 samples
*   **Irrelevant:** ~3,958 samples
*   **Spam:** ~3,997 samples
*   **Useful:** 3,910 samples

This crucial step ensured the model was trained on an equal number of examples for each category, allowing it to learn the unique features of each class effectively.

### Textual Feature Engineering

To give the model more context, structured data was engineered into the text itself. Features like the review's `rating` and whether it included pictures (`has_pics`) were converted into a string and appended to the original review text, separated by a special `[SEP]` token.

**Example of Enriched Text Input:**
`"Very good place nice things... [SEP] rating:5.0 has_pics:0"`

This technique allows the **DistilBERT** model to learn the meaning and importance of these features in relation to the review text.

### Final Performance

This comprehensive training strategy resulted in an exceptionally reliable and accurate model.

*   **Overall F1-Score (eval\_f1\_micro): 99.64%** - An outstanding balance between precision and recall.
*   **Perfect Match Accuracy (eval\_accuracy\_subset): 99.57%** - The model predicted the exact combination of labels with 100% accuracy for over 99.5% of the reviews in the test set.