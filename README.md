# PassionPay - Find Your Dream Career

PassionPay is an innovative web application designed to help users discover careers that truly align with their passions. Leveraging the power of AI-driven semantic search, PassionPay goes beyond keyword matching to understand the nuances of user queries and job descriptions, providing highly relevant job recommendations, educational pathways, and insights into potential career fields.

## AI in Action Hackathon

This project was developed for the **AI in Action Hackathon**. PassionPay demonstrates the practical application of AI and cloud technologies to solve a real-world problem: connecting individuals with fulfilling career opportunities. It showcases the integration of Google Cloud Vertex AI for intelligent embeddings and MongoDB Atlas for scalable data storage and powerful vector search capabilities, all hosted on Google Cloud Run.

## Core Features

*   **Semantic Job Search**: Enter a query describing your ideal job or passion, and get relevant job listings based on semantic similarity, not just keywords.
*   **AI-Powered Embeddings**: Utilizes Google Cloud Vertex AI (e.g., `text-embedding-005`) to generate rich embeddings for user queries and job descriptions.
*   **MongoDB Atlas Vector Search**: Performs efficient similarity searches on job embeddings stored in MongoDB Atlas.
*   **Dynamic Education & Certification Suggestions**: Recommends relevant university degrees and professional certifications based on the identified career path.
*   **"Day in the Life" Videos**: Integrates with YouTube (via HTMX) to show users what a day in their potential new career might look like.
*   **Advanced Filtering**: Filter job search results by remote work status and minimum salary.
*   **Interactive UI**: Built with HTMX for a responsive and dynamic user experience without complex client-side JavaScript frameworks.

## Technology Stack

*   **Backend**: Node.js (Serverless Functions on Google Cloud Run)
*   **Frontend**: HTML, Tailwind CSS, HTMX
*   **AI/ML**: Google Cloud Vertex AI (Text Embedding Models)
*   **Database**: MongoDB Atlas (Cloud-hosted NoSQL database with Vector Search)
*   **Hosting**: Google Cloud Run
*   **Languages**: JavaScript

### Google Cloud Platform

*   **Vertex AI**: For generating high-quality text embeddings that power the semantic search.
*   **Cloud Run**: For scalable, serverless hosting of the backend API.
*   **IAM (Identity and Access Management)**: For securely managing access to GCP services via service accounts.

### MongoDB Atlas

*   **MongoDB Atlas Database**: For storing job data, including pre-computed embeddings.
*   **Vector Search**: For performing k-NN (k-Nearest Neighbors) searches on the `job_description_embedding` field to find semantically similar jobs.

## Setup and Installation

### Prerequisites

*   Node.js (v18.x or later recommended)
*   npm or yarn
*   Google Cloud SDK (`gcloud` CLI) installed and configured (for deployment)
*   A Google Cloud Platform project with Vertex AI API enabled.
*   A MongoDB Atlas account with a cluster set up.

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/PassionPay.git
cd PassionPay
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```

### 3. Environment Variables

Create a `.env` file in the root of the project by copying `.env.example`:

```bash
cp .env.example .env
```

Update the `.env` file with your specific credentials and configurations:

*   `MONGODB_URI`: Your MongoDB Atlas connection string.
    *   Example: `mongodb+srv://<username>:<password>@<cluster-url>/passion_pay_db?retryWrites=true&w=majority`
*   `YOUTUBE_API_KEY`: Your Google YouTube Data API v3 key (if the `/api/youtube-search` endpoint is used for direct API calls).
*   `GCP_PROJECT_ID`: Your Google Cloud Project ID.
*   `GCP_LOCATION`: The GCP region for Vertex AI services (e.g., `us-central1`).
*   `GCP_EMBEDDING_MODEL`: The Vertex AI embedding model ID (e.g., `text-embedding-005`).
*   `GOOGLE_CREDENTIALS`: A JSON string of your GCP service account key. **See instructions below.**
    *   This is used for authenticating with GCP services, especially in serverless environments.
*   `MONGO_DATABASE_NAME`: The name of your MongoDB database (default: `passion_pay_db`).
*   `COLLECTION_NAME`: The name of the collection storing job data (default: `all_jobs`).
*   `VECTOR_INDEX_NAME`: The name of your MongoDB vector search index (default: `default`).
*   `EMBEDDING_FIELD_NAME`: The field in your MongoDB documents that stores job embeddings (default: `job_description_embedding`).

#### Obtaining `GOOGLE_CREDENTIALS`:

1.  Go to the GCP Console > IAM & Admin > Service Accounts.
2.  Create a new service account or select an existing one.
3.  Grant the service account the **"Vertex AI User"** role (and any other roles needed by your application).
4.  Create a JSON key for the service account and download it.
5.  **Important**: Copy the entire content of the downloaded JSON key file and paste it as a single-line string for the `GOOGLE_CREDENTIALS` variable in your `.env` file. Ensure it's valid JSON.
    *   Example: `GOOGLE_CREDENTIALS='{"type": "service_account", "project_id": "...", ...}'`

### 4. MongoDB Atlas Setup

1.  **Create a Cluster**: In MongoDB Atlas, create a new cluster (M0 free tier is sufficient for development).
2.  **Create Database and Collection**: 
    *   Database: `passion_pay_db` (or as configured in `MONGO_DATABASE_NAME`)
    *   Collection: `all_jobs` (or as configured in `COLLECTION_NAME`)
3.  **Import Data**: You'll need to populate this collection with job data, including a field named `job_description_embedding` (or as configured in `EMBEDDING_FIELD_NAME`) containing pre-computed embeddings for each job description. The embeddings should match the dimensionality of your chosen `GCP_EMBEDDING_MODEL` (e.g., 768 dimensions for `text-embedding-005`).
4.  **Create a Vector Search Index**:
    *   In MongoDB Atlas, navigate to your `all_jobs` collection and go to the "Search" tab to create a new Search Index.
    *   Choose "JSON Editor" and configure an index similar to this (using `VECTOR_INDEX_NAME` as the index name, e.g., `default`):

    ```json
    {
      "name": "default",
      "collectionName": "all_jobs",
      "database": "passion_pay_db",
      "mappings": {
        "dynamic": true,
        "fields": {
          "job_description_embedding": {
            "type": "vector",
            "dimensions": 768, // Match your embedding model's dimensions
            "similarity": "cosine" // Or "euclidean", "dotProduct"
          }
        }
      }
    }
    ```
    *   Ensure `dimensions` matches your `GCP_EMBEDDING_MODEL` (e.g., 768 for `text-embedding-005`).
    *   The `name` of the index in this JSON definition should match your `VECTOR_INDEX_NAME` environment variable.

## Running Locally

This project is designed with serverless functions in mind (`api/` directory).

*   To emulate the Cloud Run environment locally for Node.js functions, you might use tools provided by Google Cloud or run the specific API file if it's a simple HTTP server (though `api/search.js` is a handler function).
*   For frontend development (HTML/Tailwind CSS), you can serve the static files using a simple HTTP server or a tool like Live Server if you have an `index.html` at the root.

## Deployment

This application is designed to be deployed on **Google Cloud Run**.

1.  Ensure you have the Google Cloud SDK (`gcloud`) installed and authenticated.
2.  Set your project context: `gcloud config set project YOUR_GCP_PROJECT_ID`
3.  Deploy the service (example command, adjust based on your `package.json` and entry points):

    ```bash
    gcloud run deploy passionpay-api \
      --source . \
      --region YOUR_GCP_REGION \
      --platform managed \
      --allow-unauthenticated \
      --set-env-vars "MONGODB_URI=your_mongo_uri,GCP_PROJECT_ID=your_gcp_project_id,GCP_LOCATION=your_gcp_location,GCP_EMBEDDING_MODEL=your_model_id,GOOGLE_CREDENTIALS='your_gcp_credentials_json_string',YOUTUBE_API_KEY=your_youtube_key" 
      # Add other necessary environment variables
    ```
    *   Make sure to replace placeholders with your actual values.
    *   It's highly recommended to manage secrets like `GOOGLE_CREDENTIALS` and `MONGODB_URI` using Google Cloud Secret Manager and reference them in Cloud Run, rather than passing them directly in the deploy command for production.

## How It Works

1.  **User Query**: The user enters a search query on the frontend.
2.  **API Request**: The frontend (via HTMX) sends a GET request to the `/api/search` endpoint with the query and any filters.
3.  **Embedding Generation**: The backend API calls Google Cloud Vertex AI to generate a numerical embedding for the user's query.
4.  **Vector Search**: This query embedding is used to perform a vector search in the MongoDB Atlas `all_jobs` collection against the pre-computed `job_description_embedding` field.
5.  **Filtering & Ranking**: Results from MongoDB are filtered by relevance score and any user-specified criteria (remote, salary) and then ranked.
6.  **HTML Generation**: The API dynamically generates HTML for:
    *   Job listings.
    *   Relevant education programs.
    *   Professional certifications.
    *   A placeholder for a "Day in the Life" YouTube video (which HTMX will then load).
7.  **Response**: The combined HTML is sent back to the client, and HTMX updates the relevant parts of the page.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
