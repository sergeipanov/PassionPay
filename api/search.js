// Vercel Serverless Function (Node.js)
// /api/search.js

export default function handler(request, response) {
    const { query } = request.body || request.query; // HTMX might send as query params or body

    if (!query) {
        return response.status(400).send('Missing search query.');
    }

    // In a real scenario:
    // 1. Get embedding for 'query' from Vertex AI
    // 2. Perform vector search in MongoDB Atlas
    // 3. Enrich results (Coursera, YouTube)
    // 4. Return HTML snippet for HTMX

    // For now, let's send a placeholder response
    const htmlResponse = `
        <div class="p-4 mb-4 text-sm text-blue-700 bg-blue-100 rounded-lg dark:bg-blue-200 dark:text-blue-800" role="alert">
            <span class="font-medium">Search results for:</span> "${query}"
        </div>
        <div class="border border-gray-200 p-4 rounded-lg shadow-sm mb-3">
            <h3 class="text-lg font-semibold text-gray-900">Placeholder Job 1: AI Whisperer</h3>
            <p class="text-sm text-gray-600 mb-1">Salary: $150,000 - $200,000</p>
            <p class="text-xs text-gray-500">Skills: Python, TensorFlow, GCP</p>
            <p class="mt-2 text-xs text-gray-500">This is a placeholder. Real results coming soon!</p>
        </div>
         <div class="border border-gray-200 p-4 rounded-lg shadow-sm">
            <h3 class="text-lg font-semibold text-gray-900">Placeholder Job 2: Cloud Ninja</h3>
            <p class="text-sm text-gray-600 mb-1">Salary: $140,000 - $190,000</p>
            <p class="text-xs text-gray-500">Skills: AWS, Kubernetes, Terraform</p>
            <p class="mt-2 text-xs text-gray-500">Another placeholder. Stay tuned!</p>
        </div>
    `;

    response.status(200).setHeader('Content-Type', 'text/html').send(htmlResponse);
}
