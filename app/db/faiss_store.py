import os
import pickle
from typing import Any, Dict, List

import numpy as np

from app.config import settings

# Force NumPy fallback on Windows due to FAISS C++ path space bug (Errno 22)
faiss = None
_HAS_FAISS = False


class FAISSStore:
    def __init__(self, dimension: int = 384):
        self.dimension = dimension
        self.index_path = os.path.abspath(settings.FAISS_INDEX_PATH)
        self.metadata_path = self.index_path.replace(".bin", "_metadata.pkl")
        self._vectors_path = self.index_path.replace(".bin", "_vectors.npy")

        if _HAS_FAISS:
            if os.path.exists(self.index_path):
                self.index = faiss.read_index(self.index_path)
                with open(self.metadata_path, "rb") as f:
                    self.metadata = pickle.load(f)
            else:
                self.index = faiss.IndexFlatL2(dimension)
                self.metadata = []
            self._vectors = None
        else:
            self.index = None
            if os.path.exists(self._vectors_path) and os.path.exists(self.metadata_path):
                self._vectors = np.load(self._vectors_path)
                with open(self.metadata_path, "rb") as f:
                    self.metadata = pickle.load(f)
            else:
                self._vectors = np.zeros((0, dimension), dtype="float32")
                self.metadata = []

    def insert(self, embeddings: List[List[float]], metadatas: List[Dict[str, Any]]):
        try:
            vectors = np.array(embeddings, dtype="float32")
            if _HAS_FAISS:
                self.index.add(vectors)
            else:
                if self._vectors.size == 0:
                    self._vectors = vectors
                else:
                    self._vectors = np.vstack([self._vectors, vectors])
            self.metadata.extend(metadatas)
            self.save()
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise e

    def search(self, query_embedding: List[float], k: int = 5) -> List[Dict[str, Any]]:
        if _HAS_FAISS:
            vector = np.array([query_embedding], dtype="float32")
            _, indices = self.index.search(vector, k)
            results: List[Dict[str, Any]] = []
            for idx in indices[0]:
                if idx != -1 and idx < len(self.metadata):
                    results.append(self.metadata[idx])
            return results

        if self._vectors is None or self._vectors.shape[0] == 0:
            return []
        q = np.array(query_embedding, dtype="float32")
        dists = np.linalg.norm(self._vectors - q, axis=1)
        idxs = np.argsort(dists)[:k]
        return [self.metadata[int(i)] for i in idxs if int(i) < len(self.metadata)]

    def save(self):
        base_dir = os.path.dirname(self.index_path)
        if base_dir:
            os.makedirs(base_dir, exist_ok=True)
        if _HAS_FAISS:
            faiss.write_index(self.index, self.index_path)
        else:
            np.save(self._vectors_path, self._vectors)
        with open(self.metadata_path, "wb") as f:
            pickle.dump(self.metadata, f)

    def delete_index(self):
        self.metadata = []
        if _HAS_FAISS:
            self.index = faiss.IndexFlatL2(self.dimension)
            if os.path.exists(self.index_path):
                os.remove(self.index_path)
        else:
            self._vectors = np.zeros((0, self.dimension), dtype="float32")
            if os.path.exists(self._vectors_path):
                os.remove(self._vectors_path)
        if os.path.exists(self.metadata_path):
            os.remove(self.metadata_path)


faiss_store = FAISSStore()
