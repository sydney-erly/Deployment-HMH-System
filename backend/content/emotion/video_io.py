# backend/content/emotion/libreface.py
import torch
from libreface import Inference

class EmotionRecognizer:
    def __init__(self, device=None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = Inference(device=self.device)

    def predict_emotions(self, frame_path: str) -> dict:
        """
        Returns a dict of emotion -> probability (0..1) from a single image.
        Example: {"happy": 0.83, "sad": 0.02, ...}
        """
        return self.model.infer(frame_path)
