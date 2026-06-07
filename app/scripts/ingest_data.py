import json
import os
import sys

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.db.faiss_store import faiss_store
from app.services.embeddings import embedding_service

def run_ingestion():
    kb_path = "backend/data/knowledge_base.json"
    
    if not os.path.exists(kb_path):
        print(f"Error: {kb_path} not found.")
        return

    with open(kb_path, "r") as f:
        data = json.load(f)

    print(f"Ingesting {len(data)} entries into FAISS...")

    embeddings = []
    metadatas = []

    for entry in data:
        text = entry["text"]
        print(f"Generating embedding for: {entry['id']}")
        
        # Combine topic and text for better context
        full_text = f"Topic: {entry['topic']}. {text}"
        
        emb = embedding_service.generate_query_embedding(full_text)
        embeddings.append(emb)
        metadatas.append(entry)

    faiss_store.insert(embeddings, metadatas)
    print("Ingestion complete. FAISS index updated.")

if __name__ == "__main__":
    run_ingestion()
