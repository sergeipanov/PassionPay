import pandas as pd
import vertexai
from vertexai.language_models import TextEmbeddingModel
import time
from pymongo import MongoClient
import os
from dotenv import load_dotenv

# --- Vertex AI Configuration ---
PROJECT_ID = "passionpay"  # Your Google Cloud Project ID
LOCATION = "us-central1"    # Vertex AI Endpoint location, e.g., "us-central1"
MODEL_NAME = "text-embedding-004" # Model for text embeddings
# Batch size for getting embeddings. The API might have limits (e.g., 250 for textembedding-gecko).
# Using a smaller batch size with a small delay can help manage API rate limits for very large datasets.
EMBEDDING_BATCH_SIZE = 20

# --- MongoDB Configuration ---
DATABASE_NAME = "passion_pay_db"
COLLECTION_NAME = "job_salaries"

def get_text_embeddings(texts: list[str], project_id: str, location: str, model_name: str, batch_size: int = EMBEDDING_BATCH_SIZE) -> dict[str, list[float]]:
    """Generates text embeddings for a list of texts using Vertex AI.

    Args:
        texts: A list of strings to embed.
        project_id: Google Cloud Project ID.
        location: Google Cloud region for Vertex AI.
        model_name: The name of the pre-trained text embedding model.
        batch_size: Number of texts to send in a single API call.

    Returns:
        A dictionary mapping each input text to its embedding vector.
        Returns an empty dictionary if an error occurs or no texts are provided.
    """
    if not texts:
        print("No texts provided for embedding.")
        return {}

    print(f"\nInitializing Vertex AI for embeddings with project: {project_id}, location: {location}")
    try:
        vertexai.init(project=project_id, location=location)
        model = TextEmbeddingModel.from_pretrained(model_name)
        print(f"Successfully loaded Vertex AI model: {model_name}")
    except Exception as e:
        print(f"Error initializing Vertex AI or loading model: {e}")
        return {}

    embeddings_map = {}
    # Process only unique texts to avoid redundant API calls and reduce costs
    unique_texts_to_embed = sorted(list(set(texts)))
    
    print(f"Generating embeddings for {len(unique_texts_to_embed)} unique texts in batches of {batch_size}...")

    for i in range(0, len(unique_texts_to_embed), batch_size):
        batch_texts = unique_texts_to_embed[i:i + batch_size]
        try:
            num_batches = (len(unique_texts_to_embed) + batch_size - 1) // batch_size
            print(f"Processing batch {i // batch_size + 1}/{num_batches} (size: {len(batch_texts)})")
            
            response = model.get_embeddings(batch_texts)
            
            for text_content, embedding_obj in zip(batch_texts, response):
                embeddings_map[text_content] = embedding_obj.values
            
            # Optional: Add a small delay between batches for very large datasets to respect rate limits
            if num_batches > 1 and (i + batch_size) < len(unique_texts_to_embed):
                 time.sleep(0.5) # 0.5 second delay

        except Exception as e:
            print(f"Error generating embeddings for batch starting with '{batch_texts[0]}': {e}")
            # Continue to the next batch, these embeddings will be missing.
    
    print(f"Successfully generated embeddings for {len(embeddings_map)} out of {len(unique_texts_to_embed)} unique texts.")
    return embeddings_map


def save_to_mongodb(df: pd.DataFrame, db_name: str, collection_name: str):
    """Saves the DataFrame to a MongoDB collection in batches.

    Args:
        df: The pandas DataFrame to save.
        db_name: The name of the MongoDB database.
        collection_name: The name of the MongoDB collection.
    """
    load_dotenv() # Load environment variables from .env file
    mongo_uri = os.getenv("MONGODB_URI")

    if not mongo_uri:
        print("Error: MONGODB_URI not found in environment variables. Skipping save to MongoDB.")
        return

    print(f"\n--- Starting MongoDB Save to {db_name}.{collection_name} ---")
    client = None  # Initialize client to None for finally block
    try:
        client = MongoClient(mongo_uri)
        db = client[db_name]
        collection = db[collection_name]

        records = df.where(pd.notnull(df), None).to_dict('records')

        print(f"Clearing existing data from collection: {collection_name}...")
        delete_result = collection.delete_many({})
        print(f"Deleted {delete_result.deleted_count} existing documents.")
        

        # Batch insert records
        batch_size = 5000
        total_records = len(records)
        print(f"Preparing to insert {total_records} new documents in batches of {batch_size}...")
        
        for i in range(0, total_records, batch_size):
            batch = records[i:i + batch_size]
            if not batch: # Should not happen if total_records > 0, but as a safeguard
                continue
            print(f"Inserting batch {(i // batch_size) + 1}/{(total_records + batch_size - 1) // batch_size} (documents {i+1}-{min(i+batch_size, total_records)} of {total_records})...")
            insert_result = collection.insert_many(batch)
            print(f"Successfully inserted {len(insert_result.inserted_ids)} documents in this batch.")
        
        print(f"Successfully inserted all {total_records} new documents.")

    except Exception as e:
        print(f"Error connecting to or writing to MongoDB: {e}")
    finally:
        if client:
            client.close()
            print("MongoDB connection closed.")
    print("--- MongoDB Save Complete ---")


def load_and_process_data(file_path):
    """Loads the CSV data, selects relevant columns, and checks for missing values."""
    try:
        df = pd.read_csv(file_path)
        print(f"Successfully loaded {file_path}")
        print("\nOriginal columns:", df.columns.tolist())
        print(f"Original shape: {df.shape}")

        # 1. Column Selection
        selected_columns = [
            'job_title', 
            'salary_in_usd', 
            'experience_level', 
            'employment_type', 
            'employee_residence', 
            'company_location', 
            'company_size',
            'remote_ratio',
            'work_year' # Keep work_year for context
        ]
        
        # Ensure all selected columns are actually in the DataFrame
        # (Handles cases where a column might be missing from the CSV)
        existing_selected_columns = [col for col in selected_columns if col in df.columns]
        df_selected = df[existing_selected_columns].copy() # Use .copy() to avoid SettingWithCopyWarning

        print("\nSelected columns:", df_selected.columns.tolist())
        print(f"Shape after column selection: {df_selected.shape}")
        
        print("\nFirst 5 rows of the selected dataset:")
        print(df_selected.head().to_string()) # Using to_string for better console output

        # 2. Data Cleaning - Missing Values Check
        print("\nMissing values per selected column:")
        missing_values = df_selected.isnull().sum()
        print(missing_values[missing_values > 0]) # Only print columns with missing values
        if missing_values.sum() == 0:
            print("No missing values found in selected columns.")

        print("\nUnique job titles (from selected data):")
        unique_job_titles = df_selected['job_title'].unique()
        print(f"Found {len(unique_job_titles)} unique job titles.")
        if len(unique_job_titles) > 0:
            if len(unique_job_titles) > 20:
                print("Sample of unique job titles (first 20):", unique_job_titles[:20])
            else:
                print("Unique job titles:", unique_job_titles)

            # --- Generate Embeddings for Job Titles ---
            print("\n--- Starting Embedding Generation ---")
            # Ensure unique_job_titles is a list of strings
            job_titles_list = [str(title) for title in unique_job_titles if pd.notna(title)]
            
            job_title_to_embedding_map = get_text_embeddings(
                texts=job_titles_list,
                project_id=PROJECT_ID,
                location=LOCATION,
                model_name=MODEL_NAME,
                batch_size=EMBEDDING_BATCH_SIZE
            )

            if job_title_to_embedding_map:
                # Add embeddings as a new column in the DataFrame
                df_selected['job_title_embedding'] = df_selected['job_title'].map(job_title_to_embedding_map)
                print("\nSuccessfully added 'job_title_embedding' column.")
                print("Sample of DataFrame with embeddings (first 3 rows, job_title and embedding start):")
                # Display job_title and the first few dimensions of its embedding
                for index, row in df_selected[['job_title', 'job_title_embedding']].head(3).iterrows():
                    embedding_sample = str(row['job_title_embedding'][:5]) + '...' if isinstance(row['job_title_embedding'], list) and len(row['job_title_embedding']) > 5 else row['job_title_embedding']
                    print(f"Job Title: {row['job_title']}, Embedding (sample): {embedding_sample}")
                
                missing_embeddings_count = df_selected['job_title_embedding'].isnull().sum()
                if missing_embeddings_count > 0:
                    print(f"\nWarning: {missing_embeddings_count} job titles could not be embedded or were not found in the map (NaN in 'job_title_embedding').")
            else:
                print("\nEmbedding generation failed or returned no embeddings. Skipping adding embedding column.")
            print("--- Embedding Generation Complete ---")
        else:
            print("\nNo unique job titles found to generate embeddings for.")
            
        return df_selected
    except FileNotFoundError:
        print(f"Error: The file {file_path} was not found.")
        return None
    except KeyError as e:
        print(f"Error: A specified column was not found in the dataset: {e}")
        return None
    except Exception as e:
        print(f"An error occurred: {e}")
        return None

if __name__ == "__main__":
    data_file_path = "data/raw/DataScience_salaries_2025.csv"
    df_processed = load_and_process_data(data_file_path)
    
    if df_processed is not None:
        print("\nData loading, initial processing, and embedding generation attempt complete.")
        if 'job_title_embedding' in df_processed.columns:
            total_rows = len(df_processed)
            embedded_rows = df_processed['job_title_embedding'].notna().sum()
            print(f"Number of rows with embeddings: {embedded_rows} / {total_rows}")
            if embedded_rows < total_rows:
                print(f"Note: {total_rows - embedded_rows} rows do not have an embedding. This could be due to errors during embedding or missing job titles.")
            
            # Save the processed data to MongoDB
            save_to_mongodb(df_processed, DATABASE_NAME, COLLECTION_NAME)
        else:
            print("Column 'job_title_embedding' was not created. Skipping save to MongoDB.")
        print("\nETL process finished.")
    else:
        print("\nETL process failed during data loading or processing.")
